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

test('gating jobs always run', () => {
  // GitHub reports a skipped required job as successful, so a job-level
  // condition would let a merge through with the check never run.
  for (const [id, job] of Object.entries(workflow.jobs)) {
    if (job['continue-on-error'] === true) continue;
    assert.equal(job.if, undefined, `gating job ${id} must not be conditional`);
  }
});

test('ci workflow runs on every pull request', () => {
  assert.ok('pull_request' in workflow.on, 'ci.yml must run on pull_request');
  // No filter of any kind: types, branches or paths would leave some pull
  // request without the checks the ruleset waits for.
  assert.deepEqual(workflow.on.pull_request ?? {}, {});
});
