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
  /** Workflow file whose run decides whether a pull request is green. */
  ciWorkflow?: string;
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
    ciWorkflow = 'ci.yml',
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

    /**
     * Waits for the CI workflow run on the pull request's current head
     * commit and returns its verdict. Reading `gh pr checks` right after a
     * push returns the previous commit's checks; asking by commit does not.
     */
    async awaitChecks(pullRequest: PullRequest): Promise<{ ok: boolean; failures: string[] }> {
      const started = Date.now();
      const head = await gh([
        'pr',
        'view',
        String(pullRequest.number),
        '--repo',
        repo,
        '--json',
        'headRefOid',
        '--jq',
        '.headRefOid',
      ]);
      while (true) {
        const runs = JSON.parse(
          await gh([
            'run',
            'list',
            '--repo',
            repo,
            '--workflow',
            ciWorkflow,
            '--commit',
            head,
            '--json',
            'databaseId,status,conclusion,createdAt',
            '--limit',
            '20',
          ]),
        ) as CiRun[];
        const verdict = judgeCiRuns(runs);
        if (verdict.state === 'done') {
          if (verdict.ok) return { ok: true, failures: [] };
          const jobs = JSON.parse(
            await gh([
              'run',
              'view',
              String(verdict.runId),
              '--repo',
              repo,
              '--json',
              'jobs',
              '--jq',
              '.jobs',
            ]),
          ) as { name: string; conclusion: string | null }[];
          const failures = jobs
            .filter((job) => job.conclusion !== 'success' && job.conclusion !== 'skipped')
            .map((job) => `${job.name} (${job.conclusion ?? 'unknown'})`);
          return { ok: false, failures: failures.length > 0 ? failures : ['the CI run failed'] };
        }
        if (Date.now() - started > maxWaitMs) {
          return {
            ok: false,
            failures: [
              `no finished CI run on ${head.slice(0, 7)} after ${Math.round(maxWaitMs / 60_000)} minutes`,
            ],
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

export interface CiRun {
  databaseId: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
}

/**
 * The verdict on the CI runs of one commit. Pending while any run is in
 * flight or none has finished; otherwise the newest run that was not
 * cancelled decides. A duplicate run cancelled by the concurrency group
 * never counts.
 */
export function judgeCiRuns(
  runs: readonly CiRun[],
): { state: 'pending' } | { state: 'done'; runId: number; ok: boolean } {
  if (runs.length === 0 || runs.some((run) => run.status !== 'completed'))
    return { state: 'pending' };
  const decisive = runs
    .filter((run) => run.conclusion !== 'cancelled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = decisive[0];
  if (!latest) return { state: 'pending' };
  return { state: 'done', runId: latest.databaseId, ok: latest.conclusion === 'success' };
}

/** The `run-name` the release workflow gives itself, so a run can be found again. */
export function runTitle(request: ReleaseRequest): string {
  return `${request.action} ${request.tag} ${request.target.store} ${request.target.flavor} ${request.target.track}`;
}
