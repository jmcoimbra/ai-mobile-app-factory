import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { parse } from 'yaml';

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
const ruleset = JSON.parse(readFileSync('.github/rulesets/main.json', 'utf8'));

function requiredChecks() {
  const rule = ruleset.rules.find((entry) => entry.type === 'required_status_checks');
  assert.ok(rule, 'the ruleset has no required_status_checks rule');
  return rule.parameters.required_status_checks.map((check) => check.context).sort();
}

function gatingJobs() {
  return Object.entries(workflow.jobs)
    .filter(([, job]) => job['continue-on-error'] !== true)
    .map(([id, job]) => job.name ?? id)
    .sort();
}

test('ci workflow defines every job the ruleset requires', () => {
  assert.equal(ruleset.enforcement, 'active');
  // Both directions: a required check with no job would block every merge,
  // and a gating job the ruleset forgets would fail without blocking one.
  assert.deepEqual(requiredChecks(), gatingJobs());
});

test('ci workflow runs on every pull request', () => {
  assert.ok('pull_request' in workflow.on, 'ci.yml must run on pull_request');
  assert.equal(workflow.on.pull_request?.branches, undefined, 'no base branch filter');
});
