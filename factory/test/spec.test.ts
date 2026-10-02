import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseTestReport } from '../src/adapters/checks.ts';
import { parseReview } from '../src/adapters/models.ts';
import { SpecError, parseSpec } from '../src/spec.ts';
import { SPEC_MARKDOWN } from './fakes.ts';

describe('spec parsing', () => {
  test('reads the title and the criteria with their test names', () => {
    const spec = parseSpec('checklist', SPEC_MARKDOWN);
    assert.equal(spec.title, 'Daily store checklist');
    assert.deepEqual(
      spec.criteria.map((criterion) => criterion.testName),
      [
        'checklist lists the tasks of the day',
        'toggling a task persists and survives a reload',
        'e2e: manager completes the daily checklist',
      ],
    );
    assert.equal(spec.criteria[0]?.description, 'the home screen lists them');
  });

  test('refuses a spec with no criteria section, no criteria, or duplicated names', () => {
    assert.throws(() => parseSpec('x', '# Title\n\nno section'), SpecError);
    assert.throws(
      () => parseSpec('x', '# Title\n\n## Acceptance criteria\n\nnothing listed'),
      SpecError,
    );
    assert.throws(
      () => parseSpec('x', '# Title\n\n## Acceptance criteria\n\n- `same`: a\n- `same`: b'),
      /appears twice/,
    );
    assert.throws(() => parseSpec('x', '## Acceptance criteria\n\n- `a`: b'), /no title/);
  });

  test('a criterion without a test name is refused with its text', () => {
    assert.throws(
      () => parseSpec('x', '# Title\n\n## Acceptance criteria\n\n- `ok`: fine\n- the app is fast'),
      /the criterion "the app is fast" has no test name/,
    );
  });
});

describe('reading the test report', () => {
  test('reads passing names from the structured report and fails closed otherwise', () => {
    const report = parseTestReport(
      JSON.stringify({
        ok: true,
        passed: ['home screen renders the app title', 'contrast'],
        failed: [],
      }),
    );
    assert.equal(report.ok, true);
    assert.deepEqual(report.passed, ['home screen renders the app title', 'contrast']);

    const failing = parseTestReport(JSON.stringify({ ok: false, passed: ['a'], failed: ['b'] }));
    assert.equal(failing.ok, false);
    assert.deepEqual(failing.failed, ['b']);

    // A report that claims ok with failures, no report, or garbage: not ok.
    assert.equal(
      parseTestReport(JSON.stringify({ ok: true, passed: [], failed: ['x'] })).ok,
      false,
    );
    assert.equal(parseTestReport(undefined).ok, false);
    assert.equal(parseTestReport('✓ home screen renders the app title').ok, false);
  });
});

describe('reading the reviewer', () => {
  test('parses a json block and fails closed on anything else', () => {
    assert.deepEqual(parseReview('Looks good.\n```json\n{"ok": true, "findings": []}\n```'), {
      ok: true,
      findings: [],
    });
    assert.deepEqual(
      parseReview('```json\n{"ok": false, "findings": ["detail rendered in screen.tsx:12"]}\n```'),
      {
        ok: false,
        findings: ['detail rendered in screen.tsx:12'],
      },
    );
    // ok with findings is a contradiction: blocked.
    assert.equal(parseReview('{"ok": true, "findings": ["x"]}').ok, false);
    // Notes are what is fine or unverified; they never block.
    assert.deepEqual(
      parseReview('{"ok": true, "findings": [], "notes": ["criterion 1 covered"]}'),
      {
        ok: true,
        findings: [],
      },
    );
    assert.equal(parseReview('I think it is fine').ok, false);
    assert.equal(parseReview('').ok, false);
  });
});
