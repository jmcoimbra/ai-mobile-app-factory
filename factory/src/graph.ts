import { deriveVersion } from '@maf/app-version';
import { END, START, StateGraph, interrupt, type BaseCheckpointSaver } from '@langchain/langgraph';

import { ALLOWED_SCRIPTS, MAX_ATTEMPTS, isProtectedPath } from './policy.ts';
import type { FactoryDeps, FactoryOptions, ReleaseRequest } from './ports.ts';
import { isE2eCriterion } from './spec.ts';
import { Approval, EscalationDecision, FactoryState, type State, type Update } from './state.ts';

/** Thrown when a side-effect node is reached without the approval it requires. */
export class ApprovalGuardError extends Error {
  constructor(node: string) {
    super(`${node} was reached without an approval. Refusing to run.`);
    this.name = 'ApprovalGuardError';
  }
}

const CHECK_SCRIPTS = ALLOWED_SCRIPTS.filter((script) => script !== 'format');

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * Build the factory graph.
 *
 * Two rules shape it. A node restarts from its first line when it resumes
 * from an interrupt, so every side effect lives in the node after the one
 * that asks. And an interrupt records intent without authenticating anyone,
 * so the nodes that touch a store only dispatch a workflow whose upload job
 * waits for a reviewer in a protected GitHub environment (docs/adr/0008).
 */
export function buildFactoryGraph(
  deps: FactoryDeps,
  options: FactoryOptions,
  checkpointer: BaseCheckpointSaver,
) {
  // ---- Feature run -------------------------------------------------------

  function loadSpecNode(state: State): Update {
    if (state.request.kind !== 'feature') return {};
    try {
      const spec = deps.loadSpec(state.request.specPath);
      return { spec, log: [`spec "${spec.id}" loaded with ${spec.criteria.length} criteria`] };
    } catch (error) {
      return {
        error: describe(error),
        outcome: 'failed',
        log: [`spec rejected: ${describe(error)}`],
      };
    }
  }

  async function planNode(state: State): Promise<Update> {
    const plan = await deps.plan(state.spec!);
    return { planDraft: plan, log: ['plan drafted'] };
  }

  // Interrupt 1. Nothing has been written anywhere when this asks.
  function approvePlanNode(state: State): Update {
    const answer = interrupt(
      {
        kind: 'approve_plan',
        spec: state.spec!.id,
        criteria: state.spec!.criteria.map((criterion) => criterion.testName),
        plan: state.planDraft,
      },
      { responseSchema: Approval },
    );
    const planApproval = Approval.parse(answer);
    return {
      planApproval,
      ...(planApproval.approved ? {} : { outcome: 'plan_rejected' as const }),
      log: [`plan ${planApproval.approved ? 'approved' : 'rejected'} by ${planApproval.by}`],
    };
  }

  async function implementNode(state: State): Promise<Update> {
    const workspace = state.workspace ?? (await deps.createWorkspace(state.spec!));
    const attempt = state.attempts + 1;
    await deps.implement({
      spec: state.spec!,
      plan: state.planDraft!,
      workspace,
      attempt,
      feedback: state.feedback,
    });
    return { workspace, attempts: attempt, log: [`implement, attempt ${attempt}`] };
  }

  async function verifyNode(state: State): Promise<Update> {
    const workspace = state.workspace!;
    const failures: string[] = [];

    // Independent of the file tools: read what actually changed.
    const diff = await deps.diff(workspace);
    for (const file of diff.files.filter(isProtectedPath)) {
      failures.push(`protected path changed: ${file}. A person has to author that change.`);
    }
    if (diff.files.length === 0) failures.push('nothing was changed');

    const checks = await deps.runChecks(workspace, CHECK_SCRIPTS);
    failures.push(...checks.failures);

    // Every criterion needs its test, by exact name, and that test has to pass.
    for (const criterion of state.spec!.criteria) {
      if (isE2eCriterion(criterion)) {
        if (!checks.e2eFlows.includes(criterion.testName)) {
          failures.push(`no Maestro flow is named "${criterion.testName}"`);
        }
      } else if (!checks.passedTests.includes(criterion.testName)) {
        failures.push(`no passing test is named "${criterion.testName}"`);
      }
    }

    const verified = failures.length === 0 && checks.ok;
    return {
      verified,
      feedback: failures,
      log: [verified ? 'verify passed' : `verify failed: ${failures.length} problem(s)`],
    };
  }

  async function reviewNode(state: State): Promise<Update> {
    const diff = await deps.diff(state.workspace!);
    const review = await deps.review({ spec: state.spec!, diff });
    return {
      reviewResult: review,
      feedback: review.ok ? [] : review.findings.map((finding) => `review: ${finding}`),
      log: [review.ok ? 'review passed' : `review found ${review.findings.length} problem(s)`],
    };
  }

  // Interrupt 2. Reached when the loop has used its attempts.
  function escalateNode(state: State): Update {
    const answer = interrupt(
      {
        kind: 'escalate',
        spec: state.spec!.id,
        attempts: state.attempts,
        problems: state.feedback,
        pullRequest: state.pullRequest?.url,
      },
      { responseSchema: EscalationDecision },
    );
    const escalation = EscalationDecision.parse(answer);
    return {
      escalation,
      // A retry gets a fresh set of attempts and keeps the feedback.
      ...(escalation.action === 'retry' ? { attempts: 0 } : { outcome: 'aborted' as const }),
      log: [`escalation answered "${escalation.action}" by ${escalation.by}`],
    };
  }

  async function openPullRequestNode(state: State): Promise<Update> {
    // Resuming after a crash must not open a second pull request.
    if (state.pullRequest) return { log: ['pull request already open'] };
    const pullRequest = await deps.openPullRequest({
      spec: state.spec!,
      workspace: state.workspace!,
    });
    return { pullRequest, log: [`pull request opened: ${pullRequest.url}`] };
  }

  async function awaitCiNode(state: State): Promise<Update> {
    const result = await deps.awaitChecks(state.pullRequest!);
    return {
      ciPassed: result.ok,
      feedback: result.ok ? [] : result.failures.map((failure) => `ci: ${failure}`),
      log: [result.ok ? 'ci passed' : `ci failed: ${result.failures.join('; ')}`],
    };
  }

  // Interrupt 3. A person reviews and merges. The factory never merges.
  function approveMergeNode(state: State): Update {
    const answer = interrupt(
      {
        kind: 'approve_merge',
        spec: state.spec!.id,
        pullRequest: state.pullRequest!.url,
        instruction: 'Review and merge the pull request yourself, then resume.',
      },
      { responseSchema: Approval },
    );
    const mergeApproval = Approval.parse(answer);
    return { mergeApproval, log: [`merge decision recorded by ${mergeApproval.by}`] };
  }

  // ---- Release run -------------------------------------------------------

  function loadReleaseNode(state: State): Update {
    if (state.request.kind !== 'release') return {};
    try {
      const version = deriveVersion(state.request.tag);
      return { version, log: [`release ${state.request.tag} is version ${version.version}`] };
    } catch (error) {
      return {
        error: describe(error),
        outcome: 'failed',
        log: [`tag rejected: ${describe(error)}`],
      };
    }
  }

  function releaseRequest(state: State, action: ReleaseRequest['action']): ReleaseRequest {
    if (state.request.kind !== 'release') throw new Error('not a release run');
    return {
      tag: state.request.tag,
      target: state.request.target,
      action,
      dryRun: !options.allowStoreSubmit,
    };
  }

  // Interrupt 4. One approval per store and flavor.
  function approveSubmissionNode(state: State): Update {
    const request = releaseRequest(state, 'submit');
    const answer = interrupt(
      {
        kind: 'approve_submission',
        tag: request.tag,
        version: state.version,
        target: request.target,
        dryRun: request.dryRun,
      },
      { responseSchema: Approval },
    );
    const submissionApproval = Approval.parse(answer);
    return {
      submissionApproval,
      ...(submissionApproval.approved ? {} : { outcome: 'submission_rejected' as const }),
      log: [
        `submission ${submissionApproval.approved ? 'approved' : 'rejected'} by ${submissionApproval.by}`,
      ],
    };
  }

  async function submitNode(state: State): Promise<Update> {
    // The edge already routes rejections away. This guard is for a state
    // that reached the node some other way.
    if (state.submissionApproval?.approved !== true) throw new ApprovalGuardError('submit');
    const request = releaseRequest(state, 'submit');

    // If the process died after dispatching, the run is already there.
    const existing = await deps.findReleaseRun(request);
    const submission = existing ?? (await deps.dispatchRelease(request));
    return {
      submission,
      log: [
        `${existing ? 'found' : 'dispatched'} ${submission.dryRun ? 'dry-run ' : ''}submission: ${submission.url}`,
      ],
    };
  }

  // Interrupt 5. From the test track to production or to the organization.
  function approvePromotionNode(state: State): Update {
    const request = releaseRequest(state, 'promote');
    const answer = interrupt(
      {
        kind: 'approve_promotion',
        tag: request.tag,
        version: state.version,
        target: request.target,
        submission: state.submission?.url,
        dryRun: request.dryRun,
      },
      { responseSchema: Approval },
    );
    const promotionApproval = Approval.parse(answer);
    return {
      promotionApproval,
      ...(promotionApproval.approved ? {} : { outcome: 'promotion_rejected' as const }),
      log: [
        `promotion ${promotionApproval.approved ? 'approved' : 'rejected'} by ${promotionApproval.by}`,
      ],
    };
  }

  async function promoteNode(state: State): Promise<Update> {
    if (state.promotionApproval?.approved !== true) throw new ApprovalGuardError('promote');
    if (state.submissionApproval?.approved !== true) throw new ApprovalGuardError('promote');
    const request = releaseRequest(state, 'promote');

    const existing = await deps.findReleaseRun(request);
    const promotion = existing ?? (await deps.dispatchRelease(request));
    return {
      promotion,
      outcome: 'promoted',
      log: [
        `${existing ? 'found' : 'dispatched'} ${promotion.dryRun ? 'dry-run ' : ''}promotion: ${promotion.url}`,
      ],
    };
  }

  // ---- Both --------------------------------------------------------------

  async function reportNode(state: State): Promise<Update> {
    if (state.outcome) return { log: [`finished: ${state.outcome}`] };

    if (state.request.kind === 'feature') {
      const merged = state.pullRequest ? await deps.isMerged(state.pullRequest) : false;
      const outcome = merged ? 'merged' : 'awaiting_merge';
      return { outcome, log: [`finished: ${outcome}`] };
    }
    return { outcome: 'submitted', log: ['finished: submitted'] };
  }

  /** After a failed step: try again, or ask a person once the attempts are used. */
  const retryOrEscalate = (state: State) =>
    state.attempts >= MAX_ATTEMPTS ? 'escalate' : 'implement';

  return (
    new StateGraph(FactoryState)
      .addNode('load_spec', loadSpecNode)
      .addNode('plan', planNode)
      .addNode('approve_plan', approvePlanNode)
      .addNode('implement', implementNode)
      .addNode('verify', verifyNode)
      .addNode('review', reviewNode)
      .addNode('escalate', escalateNode)
      .addNode('open_pull_request', openPullRequestNode)
      .addNode('await_ci', awaitCiNode)
      .addNode('approve_merge', approveMergeNode)
      .addNode('load_release', loadReleaseNode)
      .addNode('approve_submission', approveSubmissionNode)
      .addNode('submit', submitNode)
      .addNode('approve_promotion', approvePromotionNode)
      .addNode('promote', promoteNode)
      .addNode('report', reportNode)

      // route_entry: a feature spec or a release tag.
      .addConditionalEdges(
        START,
        (state: State) => (state.request.kind === 'feature' ? 'load_spec' : 'load_release'),
        ['load_spec', 'load_release'],
      )

      .addConditionalEdges('load_spec', (state: State) => (state.error ? 'report' : 'plan'), [
        'plan',
        'report',
      ])
      .addEdge('plan', 'approve_plan')
      .addConditionalEdges(
        'approve_plan',
        (state: State) => (state.planApproval?.approved ? 'implement' : 'report'),
        ['implement', 'report'],
      )
      .addEdge('implement', 'verify')
      .addConditionalEdges(
        'verify',
        (state: State) => (state.verified ? 'review' : retryOrEscalate(state)),
        ['review', 'implement', 'escalate'],
      )
      .addConditionalEdges(
        'review',
        (state: State) => (state.reviewResult?.ok ? 'open_pull_request' : retryOrEscalate(state)),
        ['open_pull_request', 'implement', 'escalate'],
      )
      .addConditionalEdges(
        'escalate',
        (state: State) => (state.escalation?.action === 'retry' ? 'implement' : 'report'),
        ['implement', 'report'],
      )
      .addEdge('open_pull_request', 'await_ci')
      .addConditionalEdges(
        'await_ci',
        (state: State) => (state.ciPassed ? 'approve_merge' : retryOrEscalate(state)),
        ['approve_merge', 'implement', 'escalate'],
      )
      .addEdge('approve_merge', 'report')

      .addConditionalEdges(
        'load_release',
        (state: State) => (state.error ? 'report' : 'approve_submission'),
        ['approve_submission', 'report'],
      )
      .addConditionalEdges(
        'approve_submission',
        (state: State) => (state.submissionApproval?.approved ? 'submit' : 'report'),
        ['submit', 'report'],
      )
      .addEdge('submit', 'approve_promotion')
      .addConditionalEdges(
        'approve_promotion',
        (state: State) => (state.promotionApproval?.approved ? 'promote' : 'report'),
        ['promote', 'report'],
      )
      .addEdge('promote', 'report')
      .addEdge('report', END)
      .compile({ checkpointer })
  );
}

export type FactoryGraph = ReturnType<typeof buildFactoryGraph>;
