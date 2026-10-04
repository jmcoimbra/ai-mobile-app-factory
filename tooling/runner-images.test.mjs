import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';

const dir = '.github/workflows';
const workflows = readdirSync(dir)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, parsed: parse(readFileSync(`${dir}/${file}`, 'utf8')) }));

test('every job pins its runner image', () => {
  // A `-latest` label moves to a new operating system on GitHub's schedule,
  // with no commit here. Images change in a pull request of their own.
  for (const { file, parsed } of workflows) {
    for (const [id, job] of Object.entries(parsed.jobs ?? {})) {
      const label = String(job['runs-on'] ?? '');
      assert.ok(label.length > 0, `${file} ${id} has no runs-on`);
      assert.doesNotMatch(label, /-latest$/, `${file} ${id} runs on ${label}`);
    }
  }
});
