import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { childEnvironment } from '../policy.ts';
import type { Diff, Workspace } from '../ports.ts';
import type { FeatureSpec } from '../spec.ts';

const run = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, {
    cwd,
    env: childEnvironment(),
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * One git worktree per feature, cut from the remote default branch, under
 * `.factory/workspaces/`. Dependencies are installed from the lockfile by
 * the factory itself, so the agent never runs an install.
 */
export function createGitWorkspaces(repoRoot: string, baseBranch = 'main') {
  const root = resolve(repoRoot);
  const workspacesRoot = resolve(root, '.factory', 'workspaces');

  return {
    async create(spec: FeatureSpec): Promise<Workspace> {
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
      const branch = `factory/${spec.id}-${stamp}`;
      const path = resolve(workspacesRoot, `${spec.id}-${stamp}`);
      await mkdir(workspacesRoot, { recursive: true });
      await git(root, 'fetch', 'origin', baseBranch);
      await git(root, 'worktree', 'add', '--no-track', '-b', branch, path, `origin/${baseBranch}`);
      await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: path, env: childEnvironment() });
      return { path, branch };
    },

    /** Everything that differs from the base, tracked or not. */
    async diff(workspace: Workspace): Promise<Diff> {
      await git(workspace.path, 'add', '--all', '--intent-to-add');
      const files = (await git(workspace.path, 'diff', '--name-only', `origin/${baseBranch}`))
        .split('\n')
        .filter(Boolean);
      const patch = await git(workspace.path, 'diff', `origin/${baseBranch}`);
      return { files, patch };
    },

    async commitAndPush(workspace: Workspace, message: string): Promise<void> {
      await git(workspace.path, 'add', '--all');
      await git(workspace.path, 'commit', '--quiet', '-m', message);
      await git(workspace.path, 'push', '--quiet', '-u', 'origin', workspace.branch);
    },

    async remove(workspace: Workspace): Promise<void> {
      await git(root, 'worktree', 'remove', '--force', workspace.path);
    },
  };
}

export type GitWorkspaces = ReturnType<typeof createGitWorkspaces>;
