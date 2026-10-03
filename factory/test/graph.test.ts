import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Command, MemorySaver } from '@langchain/langgraph';

import { buildFactoryGraph, type FactoryGraph } from '../src/graph.ts';
import type { RunRequest, State } from '../src/state.ts';
import { PASSING_CHECKS, SPEC_MARKDOWN, fakeDeps, type FakeOptions } from './fakes.ts';

const feature: RunRequest = { kind: 'feature', specPath: 'specs/checklist.md' };
const release: RunRequest = {
  kind: 'release',
  tag: 'v1.2.0',
  target: { store: 'play', flavor: 'corporate', track: 'internal' },
};

type Result = State & { __interrupt__?: { value: unknown }[] };
type Config = { configurable: { thread_id: string } };

let threads = 0;
function start(options: FakeOptions = {}, allowStoreSubmit = false) {
  const { deps, calls } = fakeDeps(options);
  const compiled = buildFactoryGraph(deps, { allowStoreSubmit }, new MemorySaver());
  const config: Config = { configurable: { thread_id: `thread-${(threads += 1)}` } };
  // One wrapper so every test reads the interrupt payload the same way.
  const graph = {
    invoke: async (input: { request: RunRequest } | Command): Promise<Result> =>
      (await compiled.invoke(input as never, config)) as Result,
    getState: () => compiled.getState(config),
  };
  return { graph, calls, config, compiled: compiled as FactoryGraph };
}

function interruptKind(result: Result): string | undefined {
  const value = result.__interrupt__?.[0]?.value as { kind?: string } | undefined;
  return value?.kind;
}

const approve = (by = 'maintainer') => new Command({ resume: { approved: true, by } });
const reject = (by = 'maintainer') => new Command({ resume: { approved: false, by } });

describe('feature run', () => {
  test('fails the spec when an acceptance criterion has no test name', async () => {
    const broken = SPEC_MARKDOWN.replace(
      '- `toggling a task persists and survives a reload`: state is kept',
      '- toggling a task persists and survives a reload',
    );
    const { graph, calls } = start({ specs: { 'specs/checklist.md': broken } });

    const result = await graph.invoke({ request: feature });

    assert.equal(result.outcome, 'failed');
    assert.match(result.error ?? '', /has no test name/);
    assert.equal(result.__interrupt__, undefined, 'nobody is asked to approve a broken spec');
    assert.equal(calls.implement.length, 0);
  });

  test('stops at the plan approval before any file is written', async () => {
    const { graph, calls } = start();

    const result = await graph.invoke({ request: feature });

    assert.equal(interruptKind(result), 'approve_plan');
    assert.ok(result.planDraft, 'the plan is there for a person to read');
    assert.equal(result.workspace, undefined, 'no workspace exists yet');
    assert.equal(calls.implement.length, 0);
    assert.equal(calls.openPullRequest, 0);
  });

  test('a rejected plan ends the run without writing anything', async () => {
    const { graph, calls } = start();
    await graph.invoke({ request: feature });

    const result = await graph.invoke(reject());

    assert.equal(result.outcome, 'plan_rejected');
    assert.equal(calls.implement.length, 0);
  });

  test('resumes after approval and reaches the pull request step', async () => {
    const { graph, calls } = start();
    await graph.invoke({ request: feature });

    const result = await graph.invoke(approve());

    assert.equal(calls.implement.length, 1);
    assert.equal(calls.openPullRequest, 1);
    assert.equal(result.verified, true);
    assert.equal(result.ciPassed, true);
    assert.equal(interruptKind(result), 'approve_merge');
    assert.equal(result.pullRequest?.number, 7);

    const finished = await graph.invoke(approve());
    assert.equal(finished.outcome, 'awaiting_merge');
    assert.equal(calls.openPullRequest, 1, 'resuming did not open a second pull request');
  });

  test('returns to implement when verification fails and escalates at the limit', async () => {
    const { graph, calls } = start({
      checks: { ...PASSING_CHECKS, ok: false, failures: ['lint: 3 errors'] },
    });
    await graph.invoke({ request: feature });

    const result = await graph.invoke(approve());

    assert.equal(calls.implement.length, 3);
    assert.deepEqual(
      calls.implement.map((context) => context.attempt),
      [1, 2, 3],
    );
    assert.deepEqual(calls.implement[0]?.feedback, []);
    assert.ok(
      calls.implement[1]?.feedback.includes('lint: 3 errors'),
      'the agent gets the failures',
    );
    assert.equal(interruptKind(result), 'escalate');
    assert.equal(calls.openPullRequest, 0, 'nothing failing is pushed');

    // A person can abort...
    const aborted = await graph.invoke(
      new Command({ resume: { action: 'abort', by: 'maintainer' } }),
    );
    assert.equal(aborted.outcome, 'aborted');
  });

  test('a retry from escalation starts a fresh set of attempts', async () => {
    let healthy = false;
    const { graph, calls } = start({
      checks: () =>
        healthy ? PASSING_CHECKS : { ...PASSING_CHECKS, ok: false, failures: ['tests failed'] },
    });
    await graph.invoke({ request: feature });
    await graph.invoke(approve());
    assert.equal(calls.implement.length, 3);

    healthy = true;
    const result = await graph.invoke(
      new Command({ resume: { action: 'retry', by: 'maintainer' } }),
    );

    assert.equal(calls.implement.length, 4);
    assert.equal(interruptKind(result), 'approve_merge');
  });

  test('a passing test with the wrong name does not satisfy a criterion', async () => {
    const { graph, calls } = start({
      checks: { ...PASSING_CHECKS, passedTests: ['checklist shows tasks', 'toggle works'] },
    });
    await graph.invoke({ request: feature });
    const result = await graph.invoke(approve());

    assert.equal(interruptKind(result), 'escalate');
    assert.ok(
      calls.implement[1]?.feedback.some((line) =>
        line.includes('"checklist lists the tasks of the day"'),
      ),
    );
  });

  test('verify fails a diff that touches a protected path', async () => {
    const { graph, calls } = start({
      diff: { files: ['apps/reference/src/screen.tsx', '.github/workflows/ci.yml'], patch: '' },
    });
    await graph.invoke({ request: feature });
    const result = await graph.invoke(approve());

    assert.equal(interruptKind(result), 'escalate');
    assert.ok(
      calls.implement[1]?.feedback.some((line) =>
        line.includes('protected path changed: .github/workflows/ci.yml'),
      ),
    );
    assert.equal(calls.openPullRequest, 0);
  });

  test('review findings go back to implement', async () => {
    const { graph, calls } = start({
      review: (attempt) =>
        attempt < 2 ? { ok: false, findings: ['detail is rendered'] } : { ok: true, findings: [] },
    });
    await graph.invoke({ request: feature });
    const result = await graph.invoke(approve());

    assert.equal(calls.implement.length, 2);
    assert.deepEqual(calls.implement[1]?.feedback, ['review: detail is rendered']);
    assert.equal(interruptKind(result), 'approve_merge');
  });

  test('a red CI sends the work back before anyone is asked to merge', async () => {
    const { graph, calls } = start({ ciOk: false });
    await graph.invoke({ request: feature });
    const result = await graph.invoke(approve());

    assert.equal(interruptKind(result), 'escalate');
    assert.equal(calls.openPullRequest, 1, 'the same pull request is updated, never a second one');
    assert.equal(calls.pushUpdate, 2, 'each later attempt is pushed to that pull request');
    assert.equal(calls.implement.length, 3);
  });

  test('changes requested at the merge go back to the agent and land on the same pull request', async () => {
    const { graph, calls } = start();
    await graph.invoke({ request: feature });
    await graph.invoke(approve());

    const result = await graph.invoke(
      new Command({
        resume: {
          approved: false,
          by: 'maintainer',
          note: 'the rollover test does not fire the timer',
        },
      }),
    );

    assert.equal(calls.implement.length, 2);
    assert.deepEqual(calls.implement[1]?.feedback, [
      'changes requested by maintainer: the rollover test does not fire the timer',
    ]);
    assert.equal(calls.openPullRequest, 1);
    assert.equal(calls.pushUpdate, 1);
    assert.equal(interruptKind(result), 'approve_merge', 'the person is asked again');
  });

  test('a rejected merge with no note ends the run', async () => {
    const { graph, calls } = start();
    await graph.invoke({ request: feature });
    await graph.invoke(approve());

    const result = await graph.invoke(reject());

    assert.equal(calls.implement.length, 1);
    assert.equal(result.__interrupt__, undefined);
  });

  test('a fix after a red CI is pushed and the merge is asked for', async () => {
    const { graph, calls } = start({ ciOk: (attempt) => attempt >= 2 });
    await graph.invoke({ request: feature });
    const result = await graph.invoke(approve());

    assert.equal(interruptKind(result), 'approve_merge');
    assert.equal(calls.openPullRequest, 1);
    assert.equal(calls.pushUpdate, 1);
    assert.ok(
      calls.implement[1]?.feedback[0]?.startsWith('ci: '),
      'the agent sees which check failed',
    );
  });
});

describe('release run', () => {
  test('an invalid tag ends the run before anyone is asked', async () => {
    const { graph, calls } = start();
    const result = await graph.invoke({ request: { ...release, tag: 'v1.2.0-rc.1' } });

    assert.equal(result.outcome, 'failed');
    assert.equal(result.__interrupt__, undefined);
    assert.equal(calls.dispatchRelease.length, 0);
  });

  test('a tag that is not on the default branch ends the run', async () => {
    const { graph, calls } = start({ tagOnMain: false }, true);
    const result = await graph.invoke({ request: release });

    assert.equal(result.outcome, 'failed');
    assert.match(result.error ?? '', /not on the default branch/);
    assert.equal(calls.dispatchRelease.length, 0);
  });

  test('a dry run approved stays a dry run when the flag changes before the resume', async () => {
    // The approval is asked while the operator flag says dry run...
    const { deps, calls } = fakeDeps();
    const options = { allowStoreSubmit: false };
    const compiled = buildFactoryGraph(deps, options, new MemorySaver());
    const config = { configurable: { thread_id: 'flag-flip' } };
    await compiled.invoke({ request: release }, config);

    // ...and the flag is flipped before the person's answer arrives.
    options.allowStoreSubmit = true;
    const result = (await compiled.invoke(approve() as never, config)) as Result;

    assert.equal(calls.dispatchRelease[0]?.dryRun, true);
    assert.equal(result.submission?.dryRun, true);
  });

  test('never reaches submit without an approved submission', async () => {
    const { graph, calls } = start({}, true);
    const asked = await graph.invoke({ request: release });
    assert.equal(interruptKind(asked), 'approve_submission');
    assert.equal(calls.dispatchRelease.length, 0, 'asking dispatches nothing');

    const result = await graph.invoke(reject());

    assert.equal(result.outcome, 'submission_rejected');
    assert.equal(calls.dispatchRelease.length, 0);
    assert.equal(calls.findReleaseRun.length, 0);
  });

  test('submit does not run twice when the approval is resumed', async () => {
    const { graph, calls } = start({}, true);
    await graph.invoke({ request: release });

    const result = await graph.invoke(approve('release-manager'));

    assert.equal(interruptKind(result), 'approve_promotion');
    assert.equal(calls.dispatchRelease.length, 1);
    assert.deepEqual(calls.dispatchRelease[0], {
      tag: 'v1.2.0',
      target: release.kind === 'release' ? release.target : undefined,
      action: 'submit',
      dryRun: false,
    });
    assert.equal(result.submission?.dryRun, false);
  });

  test('a submission already dispatched is found instead of repeated', async () => {
    const existing = { url: 'https://github.com/example/repo/actions/runs/99', dryRun: false };
    const { graph, calls } = start({ existingRun: existing }, true);
    await graph.invoke({ request: release });

    const result = await graph.invoke(approve());

    assert.equal(calls.dispatchRelease.length, 0);
    assert.deepEqual(result.submission, existing);
  });

  test('submit runs as a dry run unless the operator flag is set', async () => {
    const { graph, calls } = start({}, false);
    await graph.invoke({ request: release });

    const result = await graph.invoke(approve());

    assert.equal(calls.dispatchRelease[0]?.dryRun, true);
    assert.equal(result.submission?.dryRun, true);
    const payload = (await graph.getState()).tasks[0]?.interrupts[0]?.value as { dryRun?: boolean };
    assert.equal(payload?.dryRun, true, 'the promotion approval says it is a dry run');
  });

  test('promotion waits for its own approval and then dispatches once', async () => {
    const { graph, calls } = start({}, true);
    await graph.invoke({ request: release });
    await graph.invoke(approve());

    const rejected = await graph.invoke(reject());
    assert.equal(rejected.outcome, 'promotion_rejected');
    assert.equal(calls.dispatchRelease.length, 1, 'rejecting dispatches nothing');
  });

  test('an approved promotion dispatches the promote action', async () => {
    const { graph, calls } = start({}, true);
    await graph.invoke({ request: release });
    await graph.invoke(approve());

    const result = await graph.invoke(approve());

    assert.equal(result.outcome, 'promoted');
    assert.deepEqual(
      calls.dispatchRelease.map((request) => request.action),
      ['submit', 'promote'],
    );
  });
});
