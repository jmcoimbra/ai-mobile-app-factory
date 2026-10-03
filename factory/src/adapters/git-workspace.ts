import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { childEnvironment, isProtectedPath, scratchHome } from '../policy.ts';
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

export class ProtectedPathError extends Error {
  readonly paths: string[];

  constructor(paths: string[]) {
    super(`refusing to commit protected paths: ${paths.join(', ')}`);
    this.paths = paths;
    this.name = 'ProtectedPathError';
  }
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
      // Install scripts run here, so they get the scratch HOME too.
      await mkdir(scratchHome(path), { recursive: true });
      await run('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts'], {
        cwd: path,
        env: childEnvironment(process.env, scratchHome(path)),
      });
      return { path, branch };
    },

    /** Whether the tag exists and sits on the default branch. */
    async tagOnDefaultBranch(tag: string): Promise<boolean> {
      try {
        await git(
          root,
          'fetch',
          '--quiet',
          'origin',
          baseBranch,
          `refs/tags/${tag}:refs/tags/${tag}`,
        );
        await git(root, 'merge-base', '--is-ancestor', `refs/tags/${tag}`, `origin/${baseBranch}`);
        return true;
      } catch {
        return false;
      }
    },

    /** Everything that differs from the base, tracked or not. The scratch HOME stays out. */
    async diff(workspace: Workspace): Promise<Diff> {
      const scope = ['--', '.', ':(exclude).factory-home'];
      try {
        // Drop any index entry a previous pass may have added under the scratch HOME.
        await git(workspace.path, 'reset', '-q', '--', '.factory-home');
      } catch {
        // Nothing was there.
      }
      await git(workspace.path, 'add', '--all', '--intent-to-add');
      // Against the point the workspace was cut from, so commits that
      // landed on the base since then do not read as the agent's changes.
      const base = await git(workspace.path, 'merge-base', `origin/${baseBranch}`, 'HEAD');
      const files = (await git(workspace.path, 'diff', '--name-only', base, ...scope))
        .split('\n')
        .filter(Boolean);
      const patch = await git(workspace.path, 'diff', base, ...scope);
      return { files, patch };
    },

    /** Commits whatever changed and pushes the branch. Nothing to commit is fine. */
    async commitAndPush(workspace: Workspace, message: string): Promise<void> {
      try {
        await git(workspace.path, 'reset', '-q', '--', '.factory-home');
      } catch {
        // Nothing was there.
      }
      await git(workspace.path, 'add', '--all');
      const staged = await git(workspace.path, 'diff', '--cached', '--name-only');
      // Checked again here, on what is about to be committed: a test run
      // after verify could have written a protected file.
      const blocked = staged.split('\n').filter(Boolean).filter(isProtectedPath);
      if (blocked.length > 0) {
        await git(workspace.path, 'reset', '-q');
        throw new ProtectedPathError(blocked);
      }
      if (staged.length > 0) await git(workspace.path, 'commit', '--quiet', '-m', message);
      await git(workspace.path, 'push', '--quiet', '-u', 'origin', workspace.branch);
    },

    async remove(workspace: Workspace): Promise<void> {
      await git(root, 'worktree', 'remove', '--force', workspace.path);
    },
  };
}

export type GitWorkspaces = ReturnType<typeof createGitWorkspaces>;
