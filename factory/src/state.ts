import { Annotation } from '@langchain/langgraph';
import * as z from 'zod';

import type { AppVersion } from '@maf/app-version';

import type { PullRequest, ReleaseRun, ReleaseTarget, ReviewResult, Workspace } from './ports.ts';
import type { FeatureSpec } from './spec.ts';

/** What a person answers at an approval interrupt. */
export const Approval = z.object({
  approved: z.boolean(),
  /** Who answered. Recorded in the report; it authenticates nobody. */
  by: z.string().default('unknown'),
  note: z.string().default(''),
});
export type ApprovalAnswer = z.infer<typeof Approval>;

/** What a person answers when the factory gives up and asks. */
export const EscalationDecision = z.object({
  action: z.enum(['retry', 'abort']),
  by: z.string().default('unknown'),
  note: z.string().default(''),
});
export type EscalationAnswer = z.infer<typeof EscalationDecision>;

/** The input of a run: a feature spec to build, or a release tag to ship. */
export type RunRequest =
  { kind: 'feature'; specPath: string } | { kind: 'release'; tag: string; target: ReleaseTarget };

export type Outcome =
  | 'merged'
  | 'awaiting_merge'
  | 'plan_rejected'
  | 'aborted'
  | 'failed'
  | 'submitted'
  | 'promoted'
  | 'submission_rejected'
  | 'promotion_rejected';

const lastValue = <T>() => Annotation<T | undefined>();

export const FactoryState = Annotation.Root({
  request: Annotation<RunRequest>(),

  // Feature run.
  spec: lastValue<FeatureSpec>(),
  planDraft: lastValue<string>(),
  planApproval: lastValue<ApprovalAnswer>(),
  workspace: lastValue<Workspace>(),
  attempts: Annotation<number>({ reducer: (_previous, next) => next, default: () => 0 }),
  feedback: Annotation<string[]>({ reducer: (_previous, next) => next, default: () => [] }),
  verified: lastValue<boolean>(),
  reviewResult: lastValue<ReviewResult>(),
  escalation: lastValue<EscalationAnswer>(),
  pullRequest: lastValue<PullRequest>(),
  ciPassed: lastValue<boolean>(),
  mergeApproval: lastValue<ApprovalAnswer>(),

  // Release run.
  version: lastValue<AppVersion>(),
  submissionApproval: lastValue<ApprovalAnswer>(),
  /** Whether the submission a person approved was a dry run. Fixed at approval time. */
  submissionDryRun: lastValue<boolean>(),
  submission: lastValue<ReleaseRun>(),
  promotionApproval: lastValue<ApprovalAnswer>(),
  promotionDryRun: lastValue<boolean>(),
  promotion: lastValue<ReleaseRun>(),

  // Both.
  error: lastValue<string>(),
  outcome: lastValue<Outcome>(),
  /** What happened, in order. Appended to by every node. */
  log: Annotation<string[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
});

export type State = typeof FactoryState.State;
export type Update = typeof FactoryState.Update;
