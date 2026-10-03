import { readFileSync } from 'node:fs';

/** One acceptance criterion of a feature spec. Its test name is the contract. */
export interface Criterion {
  /** The exact name of the test that proves the criterion. */
  testName: string;
  description: string;
}

export interface FeatureSpec {
  id: string;
  title: string;
  /** The whole spec, as written. Models read this. */
  body: string;
  criteria: Criterion[];
}

export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecError';
  }
}

const E2E_PREFIX = 'e2e:';

/** A criterion proven on a device by a Maestro flow instead of a unit test. */
export function isE2eCriterion(criterion: Criterion): boolean {
  return criterion.testName.startsWith(E2E_PREFIX);
}

/**
 * Parse a feature spec written in Markdown.
 *
 * The title is the first `# heading`. Criteria are the list items under
 * `## Acceptance criteria`, and each one starts with the test name in
 * backticks:
 *
 *     - `checklist lists the tasks of the day`: the home screen shows them
 *
 * A criterion with no test name is an error. Everything the factory does
 * afterwards leans on that name, so a spec without it stops here.
 */
export function parseSpec(id: string, markdown: string): FeatureSpec {
  const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim();
  if (!title) throw new SpecError(`spec "${id}" has no title (a line starting with "# ")`);

  const section = /^## Acceptance criteria\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(markdown)?.[1];
  if (section === undefined) {
    throw new SpecError(`spec "${id}" has no "## Acceptance criteria" section`);
  }

  const items = section
    .split('\n')
    .filter((line) => /^\s*[-*] /.test(line))
    .map((line) => line.replace(/^\s*[-*] /, '').trim());
  if (items.length === 0) throw new SpecError(`spec "${id}" lists no acceptance criterion`);

  const criteria = items.map((item) => {
    const match = /^`([^`]+)`\s*:?\s*(.*)$/.exec(item);
    const testName = match?.[1]?.trim();
    if (!testName) {
      throw new SpecError(
        `spec "${id}": the criterion "${item}" has no test name. Start it with the test name in backticks.`,
      );
    }
    return { testName, description: match?.[2]?.trim() ?? '' };
  });

  const duplicated = criteria.find(
    (criterion, index) => criteria.findIndex((c) => c.testName === criterion.testName) !== index,
  );
  if (duplicated) {
    throw new SpecError(`spec "${id}": the test name "${duplicated.testName}" appears twice`);
  }

  return { id, title, body: markdown, criteria };
}

export function loadSpec(path: string): FeatureSpec {
  const id = path.replace(/^.*\//, '').replace(/\.md$/, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new SpecError(`spec file name "${id}" must be lowercase letters, digits and dashes`);
  }
  return parseSpec(id, readFileSync(path, 'utf8'));
}
