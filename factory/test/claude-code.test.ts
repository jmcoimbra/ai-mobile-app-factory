import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { createClaudeCodeAdapters } from '../src/adapters/claude-code.ts';
import { parseSpec } from '../src/spec.ts';
import { SPEC_MARKDOWN } from './fakes.ts';

/** A stand-in for the claude CLI that records its arguments and answers canned text. */
async function stubCli(answer: string): Promise<{ command: string; argsFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'claude-stub-'));
  const argsFile = join(dir, 'args.json');
  const command = join(dir, 'claude');
  await writeFile(
    command,
    `#!/usr/bin/env node
require('node:fs').writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write(${JSON.stringify(answer)});
`,
  );
  await chmod(command, 0o755);
  return { command, argsFile };
}

const spec = parseSpec('checklist', SPEC_MARKDOWN);

describe('claude code backend', () => {
  test('plans and reviews with every tool switched off', async () => {
    const plan = await stubCli('## Plan\n- one file per criterion');
    const adapters = createClaudeCodeAdapters({ command: plan.command, model: 'opus' });

    assert.equal(await adapters.plan(spec), '## Plan\n- one file per criterion');
    const planArgs = JSON.parse(await readFile(plan.argsFile, 'utf8')) as string[];
    assert.ok(planArgs.includes('-p'));
    assert.equal(planArgs[planArgs.indexOf('--tools') + 1], '');
    assert.ok(!planArgs.includes('--mcp-config'));

    const review = await stubCli(
      '```json\n{"ok": false, "findings": ["screen.tsx:3 renders detail"]}\n```',
    );
    const reviewer = createClaudeCodeAdapters({ command: review.command });
    assert.deepEqual(await reviewer.review({ spec, diff: { files: ['a.ts'], patch: '' } }), {
      ok: false,
      findings: ['screen.tsx:3 renders detail'],
    });
  });

  test('implements with the built-in tools off and only the factory server allowed', async () => {
    const stub = await stubCli('done');
    const adapters = createClaudeCodeAdapters({ command: stub.command, maxTurns: 7 });
    const workspacePath = await mkdtemp(join(tmpdir(), 'factory-ws-'));

    await adapters.implement({
      spec,
      plan: 'the plan',
      workspace: { path: workspacePath, branch: 'factory/x' },
      attempt: 2,
      feedback: ['lint failed'],
    });

    const args = JSON.parse(await readFile(stub.argsFile, 'utf8')) as string[];
    const value = (flag: string) => args[args.indexOf(flag) + 1] ?? '';
    assert.equal(value('--tools'), '');
    assert.ok(args.includes('--strict-mcp-config'));
    assert.equal(value('--allowedTools'), 'mcp__factory');
    assert.equal(value('--permission-mode'), 'dontAsk');
    assert.equal(value('--max-turns'), '7');
    const mcp = JSON.parse(value('--mcp-config')) as {
      mcpServers: { factory: { args: string[] } };
    };
    assert.deepEqual(mcp.mcpServers.factory.args.slice(-2), ['--workspace', workspacePath]);
    assert.match(mcp.mcpServers.factory.args[0] ?? '', /mcp-server\.ts$/);
    assert.match(value('-p'), /attempt \(1\) failed verification[\s\S]*lint failed/);
  });
});
