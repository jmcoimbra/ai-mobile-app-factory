import type {
  CheckResult,
  Diff,
  FactoryDeps,
  ImplementContext,
  PullRequest,
  ReleaseRequest,
  ReleaseRun,
  ReviewResult,
  Workspace,
} from '../src/ports.ts';
import { parseSpec, type FeatureSpec } from '../src/spec.ts';

export const SPEC_MARKDOWN = `# Daily store checklist

A manager opens the app and sees the tasks of the day.

## Acceptance criteria

- \`checklist lists the tasks of the day\`: the home screen lists them
- \`toggling a task persists and survives a reload\`: state is kept
- \`e2e: manager completes the daily checklist\`: on a device
`;

export const PASSING_CHECKS: CheckResult = {
  ok: true,
  failures: [],
  passedTests: [
    'checklist lists the tasks of the day',
    'toggling a task persists and survives a reload',
  ],
  e2eFlows: ['e2e: manager completes the daily checklist'],
};

/** Every call the graph makes, in order, so a test can assert on sequence and count. */
export interface Calls {
  implement: ImplementContext[];
  openPullRequest: number;
  pushUpdate: number;
  dispatchRelease: ReleaseRequest[];
  findReleaseRun: ReleaseRequest[];
}

export interface FakeOptions {
  specs?: Record<string, string>;
  checks?: CheckResult | ((attempt: number) => CheckResult);
  review?: ReviewResult | ((attempt: number) => ReviewResult);
  diff?: Diff;
  ciOk?: boolean | ((attempt: number) => boolean);
  merged?: boolean;
  tagOnMain?: boolean;
  existingRun?: ReleaseRun | null;
}

export function fakeDeps(options: FakeOptions = {}): { deps: FactoryDeps; calls: Calls } {
  const calls: Calls = {
    implement: [],
    openPullRequest: 0,
    pushUpdate: 0,
    dispatchRelease: [],
    findReleaseRun: [],
  };
  const specs = options.specs ?? { 'specs/checklist.md': SPEC_MARKDOWN };
  let attempt = 0;

  const deps: FactoryDeps = {
    loadSpec(path: string): FeatureSpec {
      const markdown = specs[path];
      if (markdown === undefined) throw new Error(`no spec at ${path}`);
      return parseSpec(path.replace(/^.*\//, '').replace(/\.md$/, ''), markdown);
    },
    async plan(spec) {
      return `Plan for ${spec.title}: one file per criterion.`;
    },
    async implement(context) {
      attempt = context.attempt;
      calls.implement.push(context);
    },
    async review() {
      const review = options.review ?? { ok: true, findings: [] };
      return typeof review === 'function' ? review(attempt) : review;
    },
    async createWorkspace(spec): Promise<Workspace> {
      return { path: `/tmp/factory/${spec.id}`, branch: `factory/${spec.id}` };
    },
    async diff() {
      return (
        options.diff ?? { files: ['apps/reference/src/features/checklist/screen.tsx'], patch: '' }
      );
    },
    async runChecks() {
      const checks = options.checks ?? PASSING_CHECKS;
      return typeof checks === 'function' ? checks(attempt) : checks;
    },
    async tagOnDefaultBranch() {
      return options.tagOnMain ?? true;
    },
    async openPullRequest(): Promise<PullRequest> {
      calls.openPullRequest += 1;
      return { url: 'https://github.com/example/repo/pull/7', number: 7 };
    },
    async pushUpdate() {
      calls.pushUpdate += 1;
    },
    async awaitChecks() {
      const ok =
        typeof options.ciOk === 'function' ? options.ciOk(attempt) : (options.ciOk ?? true);
      return ok ? { ok: true, failures: [] } : { ok: false, failures: ['e2e-android (fail)'] };
    },
    async isMerged() {
      return options.merged ?? false;
    },
    async findReleaseRun(request) {
      calls.findReleaseRun.push(request);
      return options.existingRun ?? null;
    },
    async dispatchRelease(request): Promise<ReleaseRun> {
      calls.dispatchRelease.push(request);
      return {
        url: `https://github.com/example/repo/actions/runs/${calls.dispatchRelease.length}`,
        dryRun: request.dryRun,
      };
    },
  };
  return { deps, calls };
}
