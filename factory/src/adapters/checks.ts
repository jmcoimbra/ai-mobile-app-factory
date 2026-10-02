import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AllowedScript } from '../policy.ts';
import type { CheckResult, Workspace } from '../ports.ts';
import { createCommandRunner } from './command-runner.ts';

// Jest (verbose) prints "✓ name (3 ms)"; node:test prints "✔ name (0.5ms)".
const PASSED_LINE = /^\s*[✓✔]\s+(.+?)(?:\s+\(\d+(?:\.\d+)?\s?ms\))?\s*$/;
const FAILED_LINE = /^\s*[✕✖]\s+(.+?)(?:\s+\(\d+(?:\.\d+)?\s?ms\))?\s*$/;

export function passedTestNames(output: string): string[] {
  const passed = new Set<string>();
  const failed = new Set<string>();
  for (const rawLine of output.split('\n')) {
    // Strip ANSI colour codes before matching.
    const line = rawLine.replace(/\u001b\[[0-9;]*m/g, '');
    const pass = PASSED_LINE.exec(line);
    if (pass?.[1]) passed.add(pass[1]);
    const fail = FAILED_LINE.exec(line);
    if (fail?.[1]) failed.add(fail[1]);
  }
  return [...passed].filter((name) => !failed.has(name));
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
 * Runs the allowed check scripts in a workspace and reads the names of the
 * tests that passed out of their output.
 */
export async function runChecks(
  workspace: Workspace,
  scripts: readonly AllowedScript[],
): Promise<CheckResult> {
  const runner = createCommandRunner(workspace.path);
  const failures: string[] = [];
  let testOutput = '';

  for (const script of scripts) {
    const result = await runner.run(script);
    if (script === 'test') testOutput = result.output;
    if (!result.ok) {
      failures.push(`${script} failed (exit ${result.exitCode}):\n${result.output.slice(-4000)}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    passedTests: passedTestNames(testOutput),
    e2eFlows: await maestroFlowNames(workspace.path),
  };
}
