import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { ProtectedPathError, createGitWorkspaces } from '../src/adapters/git-workspace.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('a protected file written after verify is refused at commit time', async () => {
  const base = await mkdtemp(join(tmpdir(), 'factory-git-'));
  const remote = join(base, 'remote.git');
  const work = join(base, 'work');
  git(base, 'init', '-q', '--bare', '-b', 'main', remote);
  git(base, 'clone', '-q', remote, work);
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'user.name', 'test');
  await writeFile(join(work, 'README.md'), 'x\n');
  git(work, 'add', '.');
  git(work, 'commit', '-q', '-m', 'init');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'switch', '-q', '-c', 'factory/x');

  // What a test could leave behind during npm test, after verify ran.
  await mkdir(join(work, '.github', 'workflows'), { recursive: true });
  await writeFile(join(work, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  await writeFile(join(work, 'feature.ts'), 'export const a = 1;\n');

  const workspaces = createGitWorkspaces(work);
  await assert.rejects(
    workspaces.commitAndPush({ path: work, branch: 'factory/x' }, 'feat: x'),
    (error: unknown) =>
      error instanceof ProtectedPathError && error.paths.includes('.github/workflows/ci.yml'),
  );
  // Nothing was committed and nothing stays staged.
  assert.equal(git(work, 'log', '--oneline').split('\n').length, 1);
  assert.equal(git(work, 'diff', '--cached', '--name-only'), '');
});
