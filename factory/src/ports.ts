import type { AllowedScript } from './policy.ts';
import type { FeatureSpec } from './spec.ts';

/** An isolated checkout the agent works in. */
export interface Workspace {
  path: string;
  branch: string;
}

export interface Diff {
  /** Paths changed, added or deleted, relative to the repository root. */
  files: string[];
  patch: string;
}

export interface CheckResult {
  ok: boolean;
  /** One entry per failing check, short enough to hand back to the agent. */
  failures: string[];
  /** Names of every test that ran and passed. */
  passedTests: string[];
  /** Names of the Maestro flows present in the workspace. */
  e2eFlows: string[];
}

export interface ReviewResult {
  ok: boolean;
  findings: string[];
}

export interface PullRequest {
  url: string;
  number: number;
}

export type Store = 'play' | 'appstore';
export type Flavor = 'public' | 'corporate';

/** One store, one flavor, one track: the unit a person approves. */
export interface ReleaseTarget {
  store: Store;
  flavor: Flavor;
  /** The test track a submission lands on: `internal` on Play, `testflight` on the App Store. */
  track: string;
}

export interface ReleaseRequest {
  tag: string;
  target: ReleaseTarget;
  action: 'submit' | 'promote';
  /** A dry run builds and validates and uploads nothing. */
  dryRun: boolean;
}

export interface ReleaseRun {
  url: string;
  dryRun: boolean;
}

/** Context handed to the coding agent on each attempt. */
export interface ImplementContext {
  spec: FeatureSpec;
  plan: string;
  workspace: Workspace;
  attempt: number;
  /** Failures from the previous attempt, empty on the first. */
  feedback: string[];
}

/**
 * Everything the graph needs from the outside world. The graph holds no
 * model, no git and no network of its own: tests pass fakes, the CLI passes
 * the adapters in src/adapters.
 */
export interface FactoryDeps {
  loadSpec(path: string): FeatureSpec;
  plan(spec: FeatureSpec): Promise<string>;
  implement(context: ImplementContext): Promise<void>;
  review(input: { spec: FeatureSpec; diff: Diff }): Promise<ReviewResult>;

  createWorkspace(spec: FeatureSpec): Promise<Workspace>;
  diff(workspace: Workspace): Promise<Diff>;
  runChecks(workspace: Workspace, scripts: readonly AllowedScript[]): Promise<CheckResult>;

  openPullRequest(input: { spec: FeatureSpec; workspace: Workspace }): Promise<PullRequest>;
  /** Waits for the checks of the pull request to finish. */
  awaitChecks(pullRequest: PullRequest): Promise<{ ok: boolean; failures: string[] }>;
  isMerged(pullRequest: PullRequest): Promise<boolean>;

  /** The release run that already exists for this request, if any. */
  findReleaseRun(request: ReleaseRequest): Promise<ReleaseRun | null>;
  dispatchRelease(request: ReleaseRequest): Promise<ReleaseRun>;
}

export interface FactoryOptions {
  /**
   * Whether submit and promote may ask for a real upload. False by default:
   * they then dispatch a dry run. Set from FACTORY_ALLOW_STORE_SUBMIT by the
   * CLI. Even when true, the upload job still waits for a reviewer in the
   * protected GitHub environment (docs/adr/0008).
   */
  allowStoreSubmit: boolean;
}
