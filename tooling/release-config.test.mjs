import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';

import { deriveVersion } from '../packages/app-version/src/index.ts';

const config = JSON.parse(readFileSync('release-please-config.json', 'utf8'));
const manifest = JSON.parse(readFileSync('.release-please-manifest.json', 'utf8'));
const workflow = parse(readFileSync('.github/workflows/release-please.yml', 'utf8'));
const ci = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));

test('release configuration builds the changelog from conventional commits', () => {
  // Features and fixes are what a reader of the changelog needs to see.
  const visible = config['changelog-sections']
    .filter((section) => !section.hidden)
    .map((section) => section.type);
  assert.ok(visible.includes('feat') && visible.includes('fix'));
  assert.equal(config.packages['.']['changelog-path'], 'CHANGELOG.md');
});

test('the tags release-please creates are tags the build accepts', () => {
  // One version for the whole repository, tagged vX.Y.Z with no component.
  assert.deepEqual(Object.keys(config.packages), ['.']);
  assert.equal(config['include-v-in-tag'], true);
  assert.equal(config['include-component-in-tag'], false);
  assert.match(manifest['.'], /^\d+\.\d+\.\d+$/);

  // The first release after the manifest version, in each bump size.
  const [major, minor, patch] = manifest['.'].split('.').map(Number);
  for (const next of [
    `v${major}.${minor}.${patch + 1}`,
    `v${major}.${minor + 1}.0`,
    `v${major + 1}.0.0`,
  ]) {
    assert.equal(`v${deriveVersion(next).version}`, next);
  }
});

test('the release pull request gets the required checks', () => {
  // The release workflow starts CI by workflow_dispatch, so ci.yml must accept it.
  assert.ok('workflow_dispatch' in ci.on, 'ci.yml must accept workflow_dispatch');
  const steps = workflow.jobs['release-please'].steps;
  assert.ok(
    steps.some(
      (step) => typeof step.run === 'string' && step.run.includes('gh workflow run ci.yml'),
    ),
    'the release workflow must start CI on the release branch',
  );
  const permissions = workflow.jobs['release-please'].permissions;
  assert.equal(permissions.actions, 'write');
  // Documented by release-please-action: labels need issues: write.
  assert.equal(permissions.issues, 'write');
  assert.equal(permissions['pull-requests'], 'write');
  assert.equal(permissions.contents, 'write');
});
