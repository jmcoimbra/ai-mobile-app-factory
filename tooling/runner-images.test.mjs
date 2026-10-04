import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';

const dir = '.github/workflows';
const workflows = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, parsed: parse(readFileSync(`${dir}/${file}`, 'utf8')) }));

/** Every label of a `runs-on`, in each form GitHub accepts: a string, a list, or `{ labels }`. */
function runnerLabels(runsOn) {
  if (typeof runsOn === 'string') return [runsOn];
  if (Array.isArray(runsOn)) return runsOn.map(String);
  if (runsOn && typeof runsOn === 'object' && 'labels' in runsOn)
    return runnerLabels(runsOn.labels);
  return [];
}

test('runner labels are read in every form GitHub accepts', () => {
  assert.deepEqual(runnerLabels('ubuntu-24.04'), ['ubuntu-24.04']);
  assert.deepEqual(runnerLabels(['ubuntu-latest', 'self-hosted']), [
    'ubuntu-latest',
    'self-hosted',
  ]);
  assert.deepEqual(runnerLabels({ group: 'big', labels: 'ubuntu-latest' }), ['ubuntu-latest']);
  assert.deepEqual(runnerLabels({ labels: ['macos-latest'] }), ['macos-latest']);
  assert.deepEqual(runnerLabels(undefined), []);
});

test('every job pins its runner image', () => {
  // A `-latest` label moves to a new operating system on GitHub's schedule,
  // with no commit here. Images change in a pull request of their own.
  for (const { file, parsed } of workflows) {
    for (const [id, job] of Object.entries(parsed.jobs ?? {})) {
      const labels = runnerLabels(job['runs-on']);
      assert.ok(labels.length > 0, `${file} ${id} has no runs-on`);
      for (const label of labels) {
        assert.doesNotMatch(label, /-latest$/, `${file} ${id} runs on ${label}`);
      }
    }
  }
});
