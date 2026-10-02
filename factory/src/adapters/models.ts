import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createAgent, initChatModel, tool } from 'langchain';
import * as z from 'zod';

import { ALLOWED_SCRIPTS, isProtectedPath } from '../policy.ts';
import type { Diff, ImplementContext, ReviewResult } from '../ports.ts';
import type { FeatureSpec } from '../spec.ts';
import { createCommandRunner } from './command-runner.ts';
import { REPOSITORY_RULES } from './prompts.ts';
import { Sandbox } from './sandbox.ts';

/** Provider and model in LangChain's `provider:model` form. */
export const DEFAULT_MODEL = 'anthropic:claude-opus-5-5';

export interface ModelOptions {
  model?: string;
  /** Upper bound on agent steps in one implement attempt. */
  maxSteps?: number;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '',
      )
      .join('');
  }
  return '';
}

export function createModelAdapters(options: ModelOptions = {}) {
  const modelName = options.model ?? process.env.FACTORY_MODEL ?? DEFAULT_MODEL;
  const maxSteps = options.maxSteps ?? 120;
  let modelPromise: ReturnType<typeof initChatModel> | undefined;
  const model = () => (modelPromise ??= initChatModel(modelName));

  return {
    modelName,

    async plan(spec: FeatureSpec): Promise<string> {
      const response = await (
        await model()
      ).invoke([
        new SystemMessage(
          `You plan the implementation of one feature in a React Native + Expo monorepo. ${REPOSITORY_RULES}\n\nWrite a short plan in Markdown: for each acceptance criterion, the files to create or change and the test that proves it, using the criterion's exact name. State what you will not do. No code.`,
        ),
        new HumanMessage(spec.body),
      ]);
      return textOf(response.content).trim();
    },

    async implement(context: ImplementContext): Promise<void> {
      const sandbox = new Sandbox(context.workspace.path);
      const runner = createCommandRunner(context.workspace.path);

      const tools = [
        tool(async ({ path }) => sandbox.read(path), {
          name: 'read_file',
          description: 'Read a file in the workspace, by path relative to its root.',
          schema: z.object({ path: z.string() }),
        }),
        tool(
          async ({ path, content }) => {
            await sandbox.write(path, content);
            return `wrote ${path}`;
          },
          {
            name: 'write_file',
            description: 'Create or replace a file in the workspace. Protected paths are refused.',
            schema: z.object({ path: z.string(), content: z.string() }),
          },
        ),
        tool(async ({ path }) => (await sandbox.list(path)).join('\n'), {
          name: 'list_files',
          description:
            'List the files under a directory of the workspace, skipping generated trees.',
          schema: z.object({ path: z.string().default('.') }),
        }),
        tool(
          async ({ script }) => {
            const result = await runner.run(script);
            return `exit ${result.exitCode}\n${result.output.slice(-12_000)}`;
          },
          {
            name: 'run_script',
            description: `Run one of the allowed npm scripts: ${ALLOWED_SCRIPTS.join(', ')}.`,
            schema: z.object({ script: z.enum(ALLOWED_SCRIPTS) }),
          },
        ),
      ];

      const agent = createAgent({
        model: await model(),
        tools,
        systemPrompt: `You implement one feature in a React Native + Expo monorepo, working only through the tools. ${REPOSITORY_RULES}\n\nWork in small steps: read the files you touch before writing them. Finish when every acceptance criterion has its passing test and lint and typecheck are clean. Then answer with a short summary of what you changed.`,
      });

      const feedback =
        context.feedback.length > 0
          ? `\n\nThe previous attempt (${context.attempt - 1}) failed verification. Fix these problems:\n- ${context.feedback.join('\n- ')}`
          : '';

      await agent.invoke(
        {
          messages: [
            new HumanMessage(
              `Feature spec:\n\n${context.spec.body}\n\nApproved plan:\n\n${context.plan}${feedback}`,
            ),
          ],
        },
        { recursionLimit: maxSteps },
      );
    },

    async review(input: { spec: FeatureSpec; diff: Diff }): Promise<ReviewResult> {
      const protectedFiles = input.diff.files.filter(isProtectedPath);
      const response = await (
        await model()
      ).invoke([
        new SystemMessage(
          `You review a diff against a feature spec and these rules:\n- Every acceptance criterion has a test with its exact name, and the test checks the behaviour the criterion describes rather than restating it.\n- No technical detail reaches the user interface; messages come from the catalog.\n- No personal data goes into telemetry attributes or messages.\n- No secret, token or credential in the code.\n- No change to a protected path.\n- No code that runs at build or install time (scripts, config plugins, dependencies).\n\nAnswer with one JSON object in a \`\`\`json block: {"ok": boolean, "findings": string[]}. "ok" is false when any finding blocks the merge. Keep findings specific: file, line, what is wrong.`,
        ),
        new HumanMessage(
          `Spec:\n\n${input.spec.body}\n\nFiles changed:\n${input.diff.files.join('\n')}\n\nProtected files in the diff: ${protectedFiles.join(', ') || 'none'}\n\nDiff:\n\n${input.diff.patch.slice(0, 200_000)}`,
        ),
      ]);
      return parseReview(textOf(response.content));
    },
  };
}

/** Reads the reviewer's JSON. Anything unreadable fails closed. */
export function parseReview(text: string): ReviewResult {
  const block = /```json\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  try {
    const parsed = z
      .object({ ok: z.boolean(), findings: z.array(z.string()).default([]) })
      .parse(JSON.parse(block.trim()));
    return parsed.ok && parsed.findings.length === 0
      ? { ok: true, findings: [] }
      : {
          ok: false,
          findings:
            parsed.findings.length > 0
              ? parsed.findings
              : ['the reviewer blocked the change without a finding'],
        };
  } catch {
    return {
      ok: false,
      findings: ['the review answer could not be read; the diff is treated as not reviewed'],
    };
  }
}
