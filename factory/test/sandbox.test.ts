import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';

import { createCommandRunner, CommandError } from '../src/adapters/command-runner.ts';
import { Sandbox, SandboxError } from '../src/adapters/sandbox.ts';
import { childEnvironment, isProtectedPath, scratchHome } from '../src/policy.ts';

async function workspace(): Promise<{ root: string; outside: string }> {
  const base = await mkdtemp(join(tmpdir(), 'factory-'));
  const root = join(base, 'repo');
  const outside = join(base, 'outside');
  await mkdir(join(root, 'apps', 'reference', 'src'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, 'apps', 'reference', 'src', 'index.ts'), 'export {};\n');
  await writeFile(join(outside, 'secret.txt'), 'nope\n');
  return { root, outside };
}

describe('sandbox', () => {
  test('file tools reject a path outside the workspace', async () => {
    const { root, outside } = await workspace();
    const sandbox = new Sandbox(root);

    for (const path of [
      '../outside/secret.txt',
      outside,
      '/etc/passwd',
      'apps/../../outside/secret.txt',
    ]) {
      await assert.rejects(sandbox.read(path), SandboxError, `read "${path}" was allowed`);
      await assert.rejects(sandbox.write(path, 'x'), SandboxError, `write "${path}" was allowed`);
    }

    // A symbolic link inside the workspace that points outside is followed and refused.
    await symlink(outside, join(root, 'escape'));
    await assert.rejects(sandbox.read('escape/secret.txt'), SandboxError);
    await assert.rejects(sandbox.write('escape/new.txt', 'x'), SandboxError);
    await assert.rejects(sandbox.list('escape'), SandboxError);

    // While a normal path works.
    assert.equal(await sandbox.read('apps/reference/src/index.ts'), 'export {};\n');
    await sandbox.write('apps/reference/src/new.ts', 'export const a = 1;\n');
    assert.deepEqual(await sandbox.list('apps'), [
      'apps/reference/src/index.ts',
      'apps/reference/src/new.ts',
    ]);
  });

  test('agent cannot write to a protected path', async () => {
    const { root } = await workspace();
    const sandbox = new Sandbox(root);

    for (const path of [
      '.github/workflows/ci.yml',
      'package.json',
      'apps/reference/package.json',
      'package-lock.json',
      'apps/reference/app.config.ts',
      'apps/reference/plugins/with-thing.js',
      'factory/src/graph.ts',
      'apps/reference/fastlane/Fastfile',
      '.env',
      'apps/reference/.env.local',
      'release-please-config.json',
      '.claude/settings.json',
      'apps/reference/.claude/settings.local.json',
      'CLAUDE.local.md',
      '.mcp.json',
    ]) {
      assert.ok(isProtectedPath(path), `${path} is not protected`);
      await assert.rejects(sandbox.write(path, 'x'), /protected/, `write to ${path} was allowed`);
    }
    // Reading a protected file is fine: the agent needs the context.
    await writeFile(join(root, 'package.json'), '{}\n');
    assert.equal(await sandbox.read('package.json'), '{}\n');

    for (const path of [
      'apps/reference/src/features/x.tsx',
      'packages/telemetry/src/x.ts',
      'specs/x.md',
    ]) {
      assert.equal(isProtectedPath(path), false, `${path} is protected`);
    }
  });
});

describe('command runner', () => {
  test('command runner rejects a command outside the allowlist', async () => {
    const { root } = await workspace();
    const runner = createCommandRunner(root);

    for (const script of [
      'install',
      'exec',
      'postinstall',
      'lint; rm -rf /',
      'test && curl x',
      '',
    ]) {
      await assert.rejects(runner.run(script), CommandError, `"${script}" was allowed`);
    }
    await assert.rejects(runner.run('test', ['--', '$(id)']), CommandError);
    await assert.rejects(runner.run('test', ['a b']), CommandError);
  });

  test('a child process gets no secret from the operator environment', () => {
    const env = childEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/x',
      ANTHROPIC_API_KEY: 'sk-secret',
      GITHUB_TOKEN: 'ghp-secret',
      EXPO_TOKEN: 'secret',
      SENTRY_AUTH_TOKEN: 'secret',
    });
    assert.deepEqual(Object.keys(env).sort(), [
      'CI',
      'HOME',
      'NODE_ENV',
      'PATH',
      'npm_config_update_notifier',
    ]);
    // The running node comes first, ahead of any version-manager shim.
    assert.ok(env.PATH?.startsWith(dirname(process.execPath)), env.PATH);
  });

  test('code run from the workspace gets a scratch HOME, never the real one', async () => {
    const { root } = await workspace();
    const env = childEnvironment({ PATH: '/usr/bin', HOME: '/home/x' }, scratchHome(root));
    // The scratch home is a sibling tree, outside the workspace.
    assert.equal(env.HOME, `${root}.home`);
    assert.ok(!env.HOME.startsWith(root + '/'));
    assert.ok(isProtectedPath('.factory-home/.npmrc'));
    assert.ok(isProtectedPath('.factory/test-results.json'));
  });
});
