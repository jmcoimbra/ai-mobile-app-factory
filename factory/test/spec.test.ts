import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { passedTestNames } from '../src/adapters/checks.ts';
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

describe('reading test output', () => {
  test('collects passing names from jest and node:test output and drops failures', () => {
    const output = [
      '\u001b[32m✓\u001b[39m \u001b[2mhome screen renders the app title (30 ms)\u001b[22m',
      '  ✓ toggling a task persists and survives a reload (2 ms)',
      '  ✕ broken test (1 ms)',
      '  ✔ every text and surface pair meets WCAG AA contrast in light and dark (0.4ms)',
      '✔ contrast (1.6ms)',
      '  ✖ flaky one (3.2ms)',
      '  ✓ flaky one (1 ms)',
      'Tests: 3 passed, 3 total',
    ].join('\n');
    assert.deepEqual(passedTestNames(output), [
      'home screen renders the app title',
      'toggling a task persists and survives a reload',
      'every text and surface pair meets WCAG AA contrast in light and dark',
      'contrast',
    ]);
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
    assert.equal(parseReview('I think it is fine').ok, false);
    assert.equal(parseReview('').ok, false);
  });
});
