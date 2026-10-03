import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER = resolve(import.meta.dirname, '..', 'src', 'adapters', 'mcp-server.ts');

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'factory-mcp-'));
  await mkdir(join(root, 'apps', 'reference', 'src'), { recursive: true });
  await writeFile(join(root, 'apps', 'reference', 'src', 'index.ts'), 'export {};\n');
  await writeFile(join(root, 'package.json'), '{"name":"x","scripts":{}}\n');
  return root;
}

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text?: string }[] }).content;
  return content.map((part) => part.text ?? '').join('');
}

describe('mcp tool server', () => {
  test('serves the four factory tools over stdio and keeps the sandbox rules', async () => {
    const root = await workspace();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [SERVER, '--workspace', root] }),
    );
    try {
      const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
      assert.deepEqual(tools, ['list_files', 'read_file', 'run_script', 'write_file']);

      const read = await client.callTool({
        name: 'read_file',
        arguments: { path: 'apps/reference/src/index.ts' },
      });
      assert.equal(textOf(read), 'export {};\n');

      const written = await client.callTool({
        name: 'write_file',
        arguments: { path: 'apps/reference/src/new.ts', content: 'export const a = 1;\n' },
      });
      assert.equal(textOf(written), 'wrote apps/reference/src/new.ts');

      const escaped = await client.callTool({
        name: 'read_file',
        arguments: { path: '../outside' },
      });
      assert.equal((escaped as { isError?: boolean }).isError, true);
      assert.match(textOf(escaped), /leaves the workspace/);

      const guarded = await client.callTool({
        name: 'write_file',
        arguments: { path: 'package.json', content: '{}' },
      });
      assert.equal((guarded as { isError?: boolean }).isError, true);
      assert.match(textOf(guarded), /protected/);

      const notAllowed = await client.callTool({
        name: 'run_script',
        arguments: { script: 'install' },
      });
      assert.equal((notAllowed as { isError?: boolean }).isError, true);
    } finally {
      await client.close();
    }
  });
});
