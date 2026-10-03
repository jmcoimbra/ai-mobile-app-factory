import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8'));
const fastfile = readFileSync('apps/reference/fastlane/Fastfile', 'utf8');
const jobs = Object.entries(workflow.jobs);
const PROTECTED_ENVIRONMENT = 'store-submission';

/** The body of each `platform :<name> do ... end` block, by platform. */
function platformBlocks() {
  const blocks = {};
  const pattern = /^platform :(\w+) do\n([\s\S]*?)^end$/gm;
  for (const match of fastfile.matchAll(pattern)) blocks[match[1]] = match[2];
  return blocks;
}

/** The lanes of a platform block with the first statement of each body. */
function lanes(block) {
  const found = {};
  const pattern = /^  (?:private_)?lane :(\w+) do(?: \|\w+\|)?\n([\s\S]*?)^  end$/gm;
  for (const match of block.matchAll(pattern)) {
    const firstStatement = match[2]
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('#'));
    found[match[1]] = { firstStatement };
  }
  return found;
}

test('fastlane exposes build and submit lanes for both platforms', () => {
  const blocks = platformBlocks();
  assert.deepEqual(Object.keys(blocks).sort(), ['android', 'ios']);
  for (const [platform, block] of Object.entries(blocks)) {
    const names = Object.keys(lanes(block));
    for (const lane of ['build', 'upload', 'promote']) {
      assert.ok(names.includes(lane), `${platform} has no ${lane} lane`);
    }
  }
});

test('submit lanes refuse to run without the approval flag', () => {
  // Static half: the first thing an upload or promote lane does is ask for
  // the approval. The lint job proves the refusal by running a lane.
  for (const [platform, block] of Object.entries(platformBlocks())) {
    const found = lanes(block);
    for (const lane of ['upload', 'promote']) {
      assert.equal(found[lane]?.firstStatement, 'require_approval!', `${platform} ${lane}`);
    }
    assert.notEqual(
      found.build?.firstStatement,
      'require_approval!',
      'build lanes need no approval',
    );
  }
  assert.match(fastfile, /ENV\[APPROVAL_FLAG\] == "true"/);
  assert.match(fastfile, /APPROVAL_FLAG = "STORE_SUBMISSION_APPROVED"/);
});

test('release workflow builds from a release tag only', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'], 'no other trigger');
  const validate = workflow.jobs.validate;
  assert.ok(validate, 'a validate job exists');
  const steps = validate.steps.map((step) => `${step.name ?? ''}\n${step.run ?? ''}`).join('\n');
  assert.match(steps, /merge-base --is-ancestor "refs\/tags\/\$TAG" origin\/main/);
  assert.match(steps, /test "\$version" != "0\.0\.0"/);
  for (const [id, job] of jobs) {
    if (id === 'validate') continue;
    const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
    assert.ok(needs.includes('validate'), `${id} does not wait for validate`);
    for (const step of job.steps) {
      if (step.uses?.startsWith('actions/checkout')) {
        assert.equal(
          step.with?.ref,
          'refs/tags/${{ inputs.tag }}',
          `${id} checks out something else`,
        );
      }
    }
  }
});

test('upload jobs run in the protected environment and build jobs do not', () => {
  for (const [id, job] of jobs) {
    const touchesStore = /^(upload|promote)-/.test(id);
    assert.equal(
      job.environment,
      touchesStore ? PROTECTED_ENVIRONMENT : undefined,
      `${id}: environment is ${job.environment}`,
    );
    if (touchesStore) {
      const run = job.steps.map((step) => JSON.stringify(step.env ?? {})).join('\n');
      assert.match(
        run,
        /"STORE_SUBMISSION_APPROVED":"true"/,
        `${id} does not set the approval flag`,
      );
    }
  }
});

test('credential jobs take inputs through the environment, never in the command', () => {
  for (const [id, job] of jobs) {
    if (!/^(upload|promote)-/.test(id)) continue;
    for (const step of job.steps) {
      if (typeof step.run !== 'string') continue;
      assert.doesNotMatch(
        step.run,
        /\$\{\{\s*(inputs|github\.event)/,
        `${id}: an input is interpolated into a shell command`,
      );
    }
  }
});

test('build jobs receive no store credential', () => {
  for (const [id, job] of jobs) {
    const text = JSON.stringify(job);
    const touchesStore = /^(upload|promote)-/.test(id);
    if (touchesStore) continue;
    assert.doesNotMatch(text, /secrets\./, `${id} references a secret`);
    assert.doesNotMatch(text, /STORE_SUBMISSION_APPROVED/, `${id} sets the approval flag`);
  }
  // The jobs that hold credentials install no npm dependency: nothing a
  // dependency or the app config carries runs next to a credential.
  for (const [id, job] of jobs) {
    if (!/^(upload|promote)-/.test(id)) continue;
    const text = JSON.stringify(job);
    assert.doesNotMatch(
      text,
      /setup-workspace|npm ci|npm install|expo prebuild/,
      `${id} runs repository code`,
    );
  }
});
