#!/usr/bin/env node
/**
 * The factory's command line.
 *
 *   factory feature <spec.md>                    start a feature run
 *   factory release <tag> --store play|appstore --flavor public|corporate [--track internal]
 *   factory resume <thread> --approve|--reject|--retry|--abort [--by <name>] [--note <text>]
 *   factory status <thread>
 *
 * Runs are durable: every run is a thread in .factory/checkpoints.sqlite,
 * and a run that stopped at an approval resumes from there, in another
 * process, on another day.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { Command } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

import { createDeps } from './deps.ts';
import { buildFactoryGraph } from './graph.ts';
import type { Flavor, Store } from './ports.ts';
import type { RunRequest } from './state.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function repoRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function repoSlug(): string {
  return (
    process.env.FACTORY_REPO ??
    execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
      encoding: 'utf8',
    }).trim()
  );
}

function stamp(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 12);
}

function printState(result: Record<string, unknown>): void {
  const interrupts = result.__interrupt__ as { value: unknown }[] | undefined;
  if (interrupts?.length) {
    console.log('\nWaiting for a person:');
    console.log(JSON.stringify(interrupts[0]?.value, null, 2));
    console.log('\nResume with: factory resume <thread> --approve | --reject | --retry | --abort');
  } else {
    console.log(`\nOutcome: ${String(result.outcome ?? 'unknown')}`);
    if (result.error) console.log(`Error: ${String(result.error)}`);
  }
  const log = result.log as string[] | undefined;
  if (log?.length) console.log(`\nLog:\n- ${log.join('\n- ')}`);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      store: { type: 'string' },
      flavor: { type: 'string' },
      track: { type: 'string' },
      thread: { type: 'string' },
      model: { type: 'string' },
      approve: { type: 'boolean' },
      reject: { type: 'boolean' },
      retry: { type: 'boolean' },
      abort: { type: 'boolean' },
      by: { type: 'string' },
      note: { type: 'string' },
    },
  });
  const [command, argument] = positionals;
  if (!command) fail('usage: factory <feature|release|resume|status> ...');

  const root = repoRoot();
  mkdirSync(resolve(root, '.factory'), { recursive: true });
  const checkpointer = SqliteSaver.fromConnString(resolve(root, '.factory', 'checkpoints.sqlite'));
  const graph = buildFactoryGraph(
    createDeps({ repoRoot: root, repo: repoSlug(), model: values.model }),
    { allowStoreSubmit: process.env.FACTORY_ALLOW_STORE_SUBMIT === 'true' },
    checkpointer,
  );

  if (command === 'feature') {
    if (!argument) fail('usage: factory feature <spec.md>');
    const specPath = resolve(argument);
    const thread = values.thread ?? `feature-${stamp()}`;
    const request: RunRequest = { kind: 'feature', specPath };
    console.log(`Thread: ${thread}`);
    const result = await graph.invoke({ request }, { configurable: { thread_id: thread } });
    printState(result as Record<string, unknown>);
    return;
  }

  if (command === 'release') {
    const store = values.store as Store | undefined;
    const flavor = values.flavor as Flavor | undefined;
    if (!argument || !store || !flavor) {
      fail(
        'usage: factory release <tag> --store play|appstore --flavor public|corporate [--track <track>]',
      );
    }
    if (!['play', 'appstore'].includes(store)) fail(`unknown store "${store}"`);
    if (!['public', 'corporate'].includes(flavor)) fail(`unknown flavor "${flavor}"`);
    const track = values.track ?? (store === 'play' ? 'internal' : 'testflight');
    const thread = values.thread ?? `release-${argument}-${store}-${flavor}`;
    const request: RunRequest = {
      kind: 'release',
      tag: argument,
      target: { store, flavor, track },
    };
    console.log(`Thread: ${thread}`);
    const result = await graph.invoke({ request }, { configurable: { thread_id: thread } });
    printState(result as Record<string, unknown>);
    return;
  }

  if (command === 'resume') {
    if (!argument) fail('usage: factory resume <thread> --approve|--reject|--retry|--abort');
    const by = values.by ?? process.env.USER ?? 'unknown';
    const note = values.note ?? '';
    let resume: Record<string, unknown>;
    if (values.approve) resume = { approved: true, by, note };
    else if (values.reject) resume = { approved: false, by, note };
    else if (values.retry) resume = { action: 'retry', by, note };
    else if (values.abort) resume = { action: 'abort', by, note };
    else fail('say what the answer is: --approve, --reject, --retry or --abort');
    const result = await graph.invoke(new Command({ resume }) as never, {
      configurable: { thread_id: argument },
    });
    printState(result as Record<string, unknown>);
    return;
  }

  if (command === 'status') {
    if (!argument) fail('usage: factory status <thread>');
    const snapshot = await graph.getState({ configurable: { thread_id: argument } });
    const pending = snapshot.tasks.flatMap((task) => task.interrupts.map((item) => item.value));
    console.log(`Next: ${snapshot.next.join(', ') || 'finished'}`);
    if (pending.length) console.log(`Waiting on: ${JSON.stringify(pending[0], null, 2)}`);
    printState(snapshot.values as Record<string, unknown>);
    return;
  }

  fail(`unknown command "${command}"`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
