import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = 'tooling/uploadable-paths.py';

function run(dir) {
  execFileSync('python3', [script, dir]);
}

test('debug folder names lose the characters upload-artifact refuses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maestro-debug-'));
  mkdirSync(join(dir, 'e2e: app launches', 'logs'), { recursive: true });
  writeFileSync(join(dir, 'e2e: app launches', 'logs', 'maestro.log'), 'log');
  writeFileSync(join(dir, 'odd*"name"?.json'), '{}');
  writeFileSync(join(dir, 'plain.txt'), 'plain');

  run(dir);

  assert.deepEqual(readdirSync(dir).sort(), ['e2e- app launches', 'odd--name--.json', 'plain.txt']);
  assert.equal(readFileSync(join(dir, 'e2e- app launches', 'logs', 'maestro.log'), 'utf8'), 'log');
});

test('two names that clean up to the same one both survive', () => {
  const dir = mkdtempSync(join(tmpdir(), 'maestro-debug-'));
  for (const flow of ['e2e: launch', 'e2e? launch']) {
    mkdirSync(join(dir, flow));
    writeFileSync(join(dir, flow, 'maestro.log'), flow);
  }
  writeFileSync(join(dir, 'a:b.json'), 'first');
  writeFileSync(join(dir, 'a?b.json'), 'second');

  run(dir);

  assert.deepEqual(readdirSync(dir).sort(), [
    'a-b-2.json',
    'a-b.json',
    'e2e- launch',
    'e2e- launch-2',
  ]);
  const logs = ['e2e- launch', 'e2e- launch-2'].map((d) =>
    readFileSync(join(dir, d, 'maestro.log'), 'utf8'),
  );
  assert.deepEqual(logs.sort(), ['e2e: launch', 'e2e? launch']);
  const files = ['a-b.json', 'a-b-2.json'].map((f) => readFileSync(join(dir, f), 'utf8'));
  assert.deepEqual(files.sort(), ['first', 'second']);
});

test('a run that never created the debug folder passes', () => {
  run(join(tmpdir(), 'maestro-debug-that-does-not-exist'));
});
