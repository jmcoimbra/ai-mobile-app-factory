import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AllowedScript } from '../policy.ts';
import type { CheckResult, Workspace } from '../ports.ts';
import { createCommandRunner } from './command-runner.ts';

/** What tooling/test-report.mjs writes. */
export interface TestReport {
  ok: boolean;
  passed: string[];
  failed: string[];
}

export const TEST_REPORT_PATH = '.factory/test-results.json';

/**
 * Read the structured report the test runners produced. Names come from
 * the runners' own reporters, never from console output, so a test that
 * prints a check mark proves nothing. A missing or unreadable report is a
 * failure, never an empty success.
 */
export function parseTestReport(text: string | undefined): TestReport {
  if (text === undefined) return { ok: false, passed: [], failed: ['no test report was written'] };
  try {
    const parsed = JSON.parse(text) as Partial<TestReport>;
    const passed = Array.isArray(parsed.passed)
      ? parsed.passed.filter((n) => typeof n === 'string')
      : [];
    const failed = Array.isArray(parsed.failed)
      ? parsed.failed.filter((n) => typeof n === 'string')
      : [];
    return { ok: parsed.ok === true && failed.length === 0, passed, failed };
  } catch {
    return { ok: false, passed: [], failed: ['the test report could not be read'] };
  }
}

/** The `name:` of every Maestro flow under apps/<app>/e2e. */
export async function maestroFlowNames(root: string): Promise<string[]> {
  const names: string[] = [];
  const appsDir = resolve(root, 'apps');
  let apps: string[] = [];
  try {
    apps = await readdir(appsDir);
  } catch {
    return names;
  }
  for (const app of apps) {
    const e2eDir = resolve(appsDir, app, 'e2e');
    let flows: string[] = [];
    try {
      flows = await readdir(e2eDir);
    } catch {
      continue;
    }
    for (const flow of flows.filter((file) => /\.ya?ml$/.test(file))) {
      const text = await readFile(resolve(e2eDir, flow), 'utf8');
      const match = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text);
      if (match?.[1]) names.push(match[1]);
    }
  }
  return names;
}

/**
 * Runs the allowed check scripts in a workspace. `test:report` writes the
 * structured report this reads the passing test names from.
 */
export async function runChecks(
  workspace: Workspace,
  scripts: readonly AllowedScript[],
): Promise<CheckResult> {
  const runner = createCommandRunner(workspace.path);
  const failures: string[] = [];

  for (const script of scripts) {
    const result = await runner.run(script);
    if (!result.ok) {
      failures.push(`${script} failed (exit ${result.exitCode}):\n${result.output.slice(-4000)}`);
    }
  }

  let reportText: string | undefined;
  try {
    reportText = await readFile(resolve(workspace.path, TEST_REPORT_PATH), 'utf8');
  } catch {
    reportText = undefined;
  }
  const report = parseTestReport(reportText);
  failures.push(...report.failed.map((name) => `test failed: ${name}`));

  return {
    ok: failures.length === 0 && report.ok,
    failures,
    passedTests: report.passed,
    e2eFlows: await maestroFlowNames(workspace.path),
  };
}
