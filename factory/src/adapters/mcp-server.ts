#!/usr/bin/env node
/**
 * The agent's tools, served over the Model Context Protocol on stdio.
 *
 * A coding agent that speaks MCP (Claude Code, for one) gets exactly the
 * four tools the LangChain backend gets, backed by the same sandbox and
 * command runner, with its own built-in tools switched off. The policy
 * does not change with the agent.
 *
 *   node factory/src/adapters/mcp-server.ts --workspace <absolute path>
 */
import { parseArgs } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

import { ALLOWED_SCRIPTS } from '../policy.ts';
import { createCommandRunner } from './command-runner.ts';
import { Sandbox } from './sandbox.ts';

export function createToolServer(workspacePath: string): McpServer {
  const sandbox = new Sandbox(workspacePath);
  const runner = createCommandRunner(workspacePath);
  const server = new McpServer({ name: 'factory', version: '0.0.0' });

  const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
  const failure = (error: unknown) => ({
    content: [
      { type: 'text' as const, text: error instanceof Error ? error.message : String(error) },
    ],
    isError: true,
  });

  server.registerTool(
    'read_file',
    {
      description: 'Read a file in the workspace, by path relative to its root.',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        return text(await sandbox.read(path));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'write_file',
    {
      description: 'Create or replace a file in the workspace. Protected paths are refused.',
      inputSchema: { path: z.string(), content: z.string() },
    },
    async ({ path, content }) => {
      try {
        await sandbox.write(path, content);
        return text(`wrote ${path}`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'list_files',
    {
      description: 'List the files under a directory of the workspace, skipping generated trees.',
      inputSchema: { path: z.string().default('.') },
    },
    async ({ path }) => {
      try {
        return text((await sandbox.list(path)).join('\n'));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    'run_script',
    {
      description: `Run one of the allowed npm scripts: ${ALLOWED_SCRIPTS.join(', ')}.`,
      inputSchema: { script: z.enum(ALLOWED_SCRIPTS) },
    },
    async ({ script }) => {
      try {
        const result = await runner.run(script);
        return {
          content: [
            {
              type: 'text' as const,
              text: `exit ${result.exitCode}\n${result.output.slice(-12_000)}`,
            },
          ],
          isError: !result.ok,
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { workspace: { type: 'string' } } });
  if (!values.workspace) {
    console.error('usage: mcp-server.ts --workspace <path>');
    process.exit(2);
  }
  await createToolServer(values.workspace).connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
