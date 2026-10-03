import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { childEnvironment } from '../policy.ts';
import type { PullRequest, ReleaseRequest, ReleaseRun } from '../ports.ts';

const run = promisify(execFile);

async function gh(args: string[], cwd?: string): Promise<string> {
  // The GitHub CLI reads its own credentials from the keyring; none pass through here.
  const { stdout } = await run('gh', args, { cwd, env: childEnvironment() });
  return stdout.trim();
}

export interface GitHubOptions {
  repo: string;
  /** Workflow file the release runs come from. */
  releaseWorkflow?: string;
  /** The branch pull requests target. */
  baseBranch?: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGitHub(options: GitHubOptions) {
  const {
    repo,
    releaseWorkflow = 'release.yml',
    baseBranch = 'main',
    pollIntervalMs = 60_000,
    maxWaitMs = 90 * 60_000,
    sleep = defaultSleep,
  } = options;

  return {
    async openPullRequest(input: {
      branch: string;
      title: string;
      body: string;
      cwd: string;
    }): Promise<PullRequest> {
      // A network timeout can leave the pull request created: ask before repeating.
      const existing = await gh([
        'pr',
        'list',
        '--repo',
        repo,
        '--head',
        input.branch,
        '--json',
        'number,url',
      ]);
      const found = (JSON.parse(existing) as PullRequest[])[0];
      if (found) return found;
      const url = await gh(
        [
          'pr',
          'create',
          '--repo',
          repo,
          '--head',
          input.branch,
          '--base',
          baseBranch,
          '--title',
          input.title,
          '--body',
          input.body,
        ],
        input.cwd,
      );
      const number = Number(url.split('/').pop());
      return { url, number };
    },

    /** Polls the checks until every one finished, or the wait runs out. */
    async awaitChecks(pullRequest: PullRequest): Promise<{ ok: boolean; failures: string[] }> {
      const started = Date.now();
      while (true) {
        // Right after the push, gh exits non-zero with "no checks reported":
        // the checks have not started yet, which is the same as pending.
        let json = '[]';
        try {
          json = await gh([
            'pr',
            'checks',
            String(pullRequest.number),
            '--repo',
            repo,
            '--json',
            'name,state,bucket',
          ]);
        } catch (error) {
          if (!/no checks reported/.test(error instanceof Error ? error.message : String(error))) {
            throw error;
          }
        }
        const checks = JSON.parse(json) as { name: string; state: string; bucket: string }[];
        const pending = checks.filter((check) => check.bucket === 'pending');
        if (checks.length > 0 && pending.length === 0) {
          // Only a pass counts. A cancelled or skipped check is not green.
          const failures = checks
            .filter((check) => check.bucket !== 'pass')
            .map((check) => `${check.name} (${check.bucket})`);
          return { ok: failures.length === 0, failures };
        }
        if (Date.now() - started > maxWaitMs) {
          return {
            ok: false,
            failures: [`checks still pending after ${Math.round(maxWaitMs / 60_000)} minutes`],
          };
        }
        await sleep(pollIntervalMs);
      }
    },

    async isMerged(pullRequest: PullRequest): Promise<boolean> {
      const state = await gh([
        'pr',
        'view',
        String(pullRequest.number),
        '--repo',
        repo,
        '--json',
        'state',
        '--jq',
        '.state',
      ]);
      return state === 'MERGED';
    },

    /** The run of the release workflow already dispatched for this request, if any. */
    async findReleaseRun(request: ReleaseRequest): Promise<ReleaseRun | null> {
      const json = await gh([
        'run',
        'list',
        '--repo',
        repo,
        '--workflow',
        releaseWorkflow,
        '--event',
        'workflow_dispatch',
        '--json',
        'url,displayTitle,status',
        '--limit',
        '50',
      ]);
      const runs = JSON.parse(json) as { url: string; displayTitle: string; status: string }[];
      const title = runTitle(request);
      const found = runs.find((candidate) => candidate.displayTitle.includes(title));
      return found ? { url: found.url, dryRun: request.dryRun } : null;
    },

    async dispatchRelease(request: ReleaseRequest): Promise<ReleaseRun> {
      await gh([
        'workflow',
        'run',
        releaseWorkflow,
        '--repo',
        repo,
        '--ref',
        request.tag,
        '-f',
        `tag=${request.tag}`,
        '-f',
        `store=${request.target.store}`,
        '-f',
        `flavor=${request.target.flavor}`,
        '-f',
        `track=${request.target.track}`,
        '-f',
        `action=${request.action}`,
        '-f',
        `dry_run=${request.dryRun}`,
      ]);
      // The run takes a moment to be listed.
      for (let tries = 0; tries < 10; tries += 1) {
        await sleep(3_000);
        const found = await this.findReleaseRun(request);
        if (found) return found;
      }
      return {
        url: `https://github.com/${repo}/actions/workflows/${releaseWorkflow}`,
        dryRun: request.dryRun,
      };
    },
  };
}

/** The `run-name` the release workflow gives itself, so a run can be found again. */
export function runTitle(request: ReleaseRequest): string {
  return `${request.action} ${request.tag} ${request.target.store} ${request.target.flavor} ${request.target.track}`;
}
