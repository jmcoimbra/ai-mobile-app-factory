import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { isProtectedPath } from '../policy.ts';
import type { Diff, ImplementContext, ReviewResult } from '../ports.ts';
import type { FeatureSpec } from '../spec.ts';
import { parseReview } from './models.ts';
import { REPOSITORY_RULES } from './prompts.ts';

const run = promisify(execFile);

export interface ClaudeCodeOptions {
  /** The command to run; the real CLI by default, a stub in tests. */
  command?: string;
  model?: string;
  /** Upper bound on agent turns in one implement attempt. */
  maxTurns?: number;
  timeoutMs?: number;
}

/** The variables the CLI needs. Nothing from the operator's shell beyond these. */
function cliEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'HOME', 'LANG', 'TMPDIR', 'TERM', 'SHELL', 'USER']) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

/**
 * Plan, implement and review through Claude Code in headless mode.
 *
 * Plan and review run with no tools at all. Implement runs with the
 * built-in tools switched off and only the factory's MCP server allowed,
 * so the agent reads, writes and runs scripts through the same sandbox
 * and allowlist as the LangChain backend. The CLI itself keeps the
 * operator's HOME because its credentials live there; the code the agent
 * writes executes through the command runner, with the scratch HOME.
 */
export function createClaudeCodeAdapters(options: ClaudeCodeOptions = {}) {
  const command = options.command ?? 'claude';
  const model = options.model ?? process.env.FACTORY_CLAUDE_MODEL ?? 'opus';
  const maxTurns = options.maxTurns ?? 150;
  const timeoutMs = options.timeoutMs ?? 60 * 60 * 1000;
  const serverPath = resolve(import.meta.dirname, 'mcp-server.ts');

  async function ask(systemPrompt: string, prompt: string, cwd?: string): Promise<string> {
    const { stdout } = await run(
      command,
      [
        '-p',
        prompt,
        '--output-format',
        'text',
        '--tools',
        '',
        '--model',
        model,
        '--system-prompt',
        systemPrompt,
      ],
      { cwd, env: cliEnvironment(), timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout.trim();
  }

  return {
    backend: 'claude-code' as const,

    async plan(spec: FeatureSpec): Promise<string> {
      return ask(
        `You plan the implementation of one feature in a React Native + Expo monorepo. ${REPOSITORY_RULES}\n\nWrite a short plan in Markdown: for each acceptance criterion, the files to create or change and the test that proves it, using the criterion's exact name. State what you will not do. No code.`,
        spec.body,
      );
    },

    async implement(context: ImplementContext): Promise<void> {
      const mcpConfig = JSON.stringify({
        mcpServers: {
          factory: { command: 'node', args: [serverPath, '--workspace', context.workspace.path] },
        },
      });
      const feedback =
        context.feedback.length > 0
          ? `\n\nThe previous attempt (${context.attempt - 1}) failed verification. Fix these problems:\n- ${context.feedback.join('\n- ')}`
          : '';
      await run(
        command,
        [
          '-p',
          `Feature spec:\n\n${context.spec.body}\n\nApproved plan:\n\n${context.plan}${feedback}`,
          '--output-format',
          'text',
          '--model',
          model,
          '--max-turns',
          String(maxTurns),
          // No built-in tool: everything goes through the factory's server.
          '--tools',
          '',
          '--mcp-config',
          mcpConfig,
          '--strict-mcp-config',
          '--allowedTools',
          'mcp__factory',
          '--permission-mode',
          'dontAsk',
          '--system-prompt',
          `You implement one feature in a React Native + Expo monorepo, working only through the factory tools (read_file, write_file, list_files, run_script). ${REPOSITORY_RULES}\n\nWork in small steps: read the files you touch before writing them. Finish when every acceptance criterion has its passing test and lint and typecheck are clean. Then answer with a short summary of what you changed.`,
        ],
        {
          cwd: context.workspace.path,
          env: cliEnvironment(),
          timeout: timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
    },

    async review(input: { spec: FeatureSpec; diff: Diff }): Promise<ReviewResult> {
      const protectedFiles = input.diff.files.filter(isProtectedPath);
      const answer = await ask(
        `You review a diff against a feature spec and these rules:\n- Every acceptance criterion has a test with its exact name, and the test checks the behaviour the criterion describes rather than restating it.\n- No technical detail reaches the user interface; messages come from the catalog.\n- No personal data goes into telemetry attributes or messages.\n- No secret, token or credential in the code.\n- No change to a protected path.\n- No code that runs at build or install time (scripts, config plugins, dependencies).\n\nAnswer with one JSON object in a \`\`\`json block: {"ok": boolean, "findings": string[]}. "ok" is false when any finding blocks the merge. Keep findings specific: file, line, what is wrong.`,
        `Spec:\n\n${input.spec.body}\n\nFiles changed:\n${input.diff.files.join('\n')}\n\nProtected files in the diff: ${protectedFiles.join(', ') || 'none'}\n\nDiff:\n\n${input.diff.patch.slice(0, 200_000)}`,
      );
      return parseReview(answer);
    },
  };
}
