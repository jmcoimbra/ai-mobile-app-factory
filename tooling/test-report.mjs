/**
 * Run every test suite of the repository and write a machine-readable
 * summary to .factory/test-results.json:
 *
 *   { "ok": boolean, "passed": [names], "failed": [names] }
 *
 * The factory reads that file to check that each acceptance criterion has
 * a passing test with its exact name. It comes from the runners' own
 * reporters (node:test events, Jest's --json), never from console text, so
 * a test that prints a check mark proves nothing.
 *
 * Usage: node tooling/test-report.mjs   (from the repository root)
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { run } from 'node:test';
import { promisify } from 'node:util';

import { glob } from 'glob';

const root = resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

/** Suites run by node:test, as globs relative to the root. */
const NODE_TEST_GLOBS = [
  'tooling/**/*.test.mjs',
  'packages/*/src/**/*.test.ts',
  'factory/test/**/*.test.ts',
];
/** Workspaces whose tests run with Jest. */
const JEST_WORKSPACES = ['apps/reference'];

async function runNodeTests() {
  const files = (await glob(NODE_TEST_GLOBS, { cwd: root, ignore: '**/node_modules/**' })).map(
    (file) => resolve(root, file),
  );
  const passed = [];
  const failed = [];
  await new Promise((resolveRun, reject) => {
    const stream = run({ files, concurrency: true });
    stream.on('test:pass', (event) => passed.push(event.name));
    stream.on('test:fail', (event) => failed.push(event.name));
    stream.on('error', reject);
    stream.on('end', resolveRun);
    // The stream is also the reporter's output. It ends only when it is read.
    stream.resume();
  });
  return { passed, failed };
}

async function runJest(workspace) {
  const outputFile = join(tmpdir(), `jest-${process.pid}-${workspace.replace(/\W/g, '_')}.json`);
  try {
    await execFileAsync('npx', ['jest', '--json', '--outputFile', outputFile], {
      cwd: resolve(root, workspace),
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    // Jest exits non-zero on a failing test; the JSON still says which.
  }
  let report;
  try {
    report = JSON.parse(await readFile(outputFile, 'utf8'));
  } catch {
    return { passed: [], failed: [`jest did not produce a report for ${workspace}`] };
  }
  const passed = [];
  const failed = [];
  for (const file of report.testResults ?? []) {
    for (const result of file.assertionResults ?? []) {
      (result.status === 'passed' ? passed : failed).push(result.title);
    }
    if (file.status === 'failed' && (file.assertionResults ?? []).length === 0) {
      failed.push(`${file.name}: ${file.message?.split('\n')[0] ?? 'suite failed to run'}`);
    }
  }
  return { passed, failed };
}

const results = [await runNodeTests(), ...(await Promise.all(JEST_WORKSPACES.map(runJest)))];
const passed = [...new Set(results.flatMap((result) => result.passed))];
const failed = [...new Set(results.flatMap((result) => result.failed))];
const summary = { ok: failed.length === 0, passed, failed };

await mkdir(resolve(root, '.factory'), { recursive: true });
await writeFile(resolve(root, '.factory', 'test-results.json'), JSON.stringify(summary, null, 2));
console.log(`${passed.length} passed, ${failed.length} failed`);
for (const name of failed) console.log(`  failed: ${name}`);
process.exit(summary.ok ? 0 : 1);
