import { runChecks } from './adapters/checks.ts';
import { createGitWorkspaces } from './adapters/git-workspace.ts';
import { createGitHub } from './adapters/github.ts';
import { createModelAdapters } from './adapters/models.ts';
import type { FactoryDeps, Workspace } from './ports.ts';
import { loadSpec, type FeatureSpec } from './spec.ts';

export interface DepsOptions {
  repoRoot: string;
  repo: string;
  model?: string;
}

/** The real adapters, wired together for the CLI. */
export function createDeps(options: DepsOptions): FactoryDeps {
  const workspaces = createGitWorkspaces(options.repoRoot);
  const github = createGitHub({ repo: options.repo });
  const models = createModelAdapters({ model: options.model });

  return {
    loadSpec,
    plan: models.plan,
    implement: models.implement,
    review: models.review,
    createWorkspace: workspaces.create,
    diff: workspaces.diff,
    runChecks,
    async openPullRequest({ spec, workspace }: { spec: FeatureSpec; workspace: Workspace }) {
      await workspaces.commitAndPush(workspace, `feat: ${spec.title.toLowerCase()}`);
      return github.openPullRequest({
        branch: workspace.branch,
        title: `feat: ${spec.title.toLowerCase()}`,
        body: pullRequestBody(spec),
        cwd: workspace.path,
      });
    },
    awaitChecks: github.awaitChecks,
    isMerged: github.isMerged,
    findReleaseRun: github.findReleaseRun,
    dispatchRelease: github.dispatchRelease,
  };
}

function pullRequestBody(spec: FeatureSpec): string {
  const tests = spec.criteria.map((criterion) => `- \`${criterion.testName}\``).join('\n');
  return `Implements the feature spec \`specs/${spec.id}.md\` through the factory.\n\nAcceptance criteria, each one a test:\n\n${tests}\n\nOpened by the factory after lint, types, tests and review passed in its workspace. A person reviews and merges.`;
}
