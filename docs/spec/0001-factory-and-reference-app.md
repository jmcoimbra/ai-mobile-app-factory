# Spec 0001: the factory and the reference app

- Status: Draft
- Date: 2026-10-02
- Decisions this spec relies on: [docs/adr](../adr/README.md)

## Problem

Shipping a mobile app means many steps that are easy to do badly: tests that
do not cover the acceptance criteria, versions edited by hand, crash data
carrying personal information, and a store submission nobody reviewed. Coding
agents make the first half faster and make the second half riskier, because
an agent that can write code can also send a build to a store.

This repository shows one way to keep the speed and remove the risk: a graph
with deterministic checks between the agent steps and a human approval before
every action that leaves the repository.

## What gets built

1. **The factory.** A LangGraph graph, in TypeScript, that takes a feature
   spec through plan, code, tests, pull request, build and store submission.
   Every outward action sits in its own node behind an `interrupt`.
2. **The reference app.** A React Native + Expo app built through the
   factory. One codebase, two flavors:
   - `public`: listed on Google Play and the App Store;
   - `corporate`: restricted to the staff of one organization and absent
     from public store search.

The corporate flavor assumes a generic restaurant chain: store managers and
field staff who open the app on a managed or personal phone. The reference
feature is a daily store checklist.

## Layout

```
apps/reference/         Expo app: routes, features, Maestro flows, fastlane lanes
packages/design-tokens/ tokens, light and dark themes, brand override
packages/error-contract/ problem details schema, error codes, retry policy
packages/telemetry/     telemetry port, PII guard, adapters
packages/app-version/   SemVer tag to version, buildNumber and versionCode
factory/                the LangGraph graph, its nodes, tools and CLI
specs/                  feature specs the factory consumes
docs/                   this spec, ADRs, distribution notes, runbooks
.github/workflows/      CI, release
```

## The graph

| # | Node | Kind | What it does |
|---|---|---|---|
| 1 | `load_spec` | deterministic | Parses the feature spec. Fails when a criterion has no test name. |
| 2 | `plan` | model | Maps each criterion to files and tests. Writes nothing. |
| 3 | `approve_plan` | **interrupt** | A human approves, edits or rejects the plan. |
| 4 | `implement` | agent | Writes code and tests inside an isolated git worktree. |
| 5 | `verify` | deterministic | Lint, types, unit and component tests. Checks that every criterion's test exists and passed. |
| 6 | `review` | model | Reads the diff against the spec and the security rules. |
| 7 | `escalate` | **interrupt** | Reached when `verify` or `review` fails three times. A human decides. |
| 8 | `open_pull_request` | side effect | Commits, pushes and opens the pull request. CI runs E2E and the preview builds. |
| 9 | `await_ci` | deterministic | Reads the checks. A failure returns to `implement`. |
| 10 | `approve_merge` | **interrupt** | A human merges. The factory never merges. |
| 11 | `prepare_release` | deterministic | Reads the release tag, derives the version numbers, builds both flavors. |
| 12 | `approve_submission` | **interrupt** | One approval per store and flavor, showing artifact, version and track. |
| 13 | `submit` | side effect | Uploads to the internal track or TestFlight. |
| 14 | `approve_promotion` | **interrupt** | A human approves the move to production or to the organization. |
| 15 | `promote` | side effect | Promotes the approved build. |
| 16 | `report` | deterministic | Writes what happened and what was measured. |

Rules the graph holds:

- A side effect lives in the node after its approval. LangGraph restarts a
  node from its first line on resume, so an upload placed before an
  `interrupt` would run twice.
- `submit` and `promote` refuse to run unless the state carries the matching
  approval and the environment sets `FACTORY_ALLOW_STORE_SUBMIT=true`.
  Without both they run as a dry run and say so.
- Model output is untrusted input. File tools reject paths outside the
  worktree. The command runner accepts an allowlist of npm scripts. The agent
  cannot edit `.github/`, `fastlane/`, `factory/` or the release
  configuration, and it never sees a store credential.

## Slices and acceptance criteria

Each slice is one pull request. Each criterion is the name of a test.

### Slice 1: QA pipeline green with an empty app

- `home screen renders the app title`
- `e2e: app launches and shows the home screen`
- `ruleset requires every CI job that gates a merge`
- CI jobs `lint`, `typecheck`, `unit`, `e2e-android`, `preview-android` and
  `preview-ios` run on every pull request, and a ruleset on `main` blocks the
  merge when one fails.

### Slice 2: design tokens and theming

- `every text and surface pair meets WCAG AA contrast in light and dark`
- `brand override replaces brand tokens and keeps the semantic roles`
- `theme follows the system color scheme`
- `interactive elements expose a role and an accessible name`

### Slice 3: error handling

- `parses a problem details response into an AppError`
- `falls back to a generic AppError when the body is not problem details`
- `retries an idempotent request with backoff`
- `never retries a non-idempotent request`
- `user message catalog covers every error code`
- `error boundary shows the user message and hides the technical detail`

### Slice 4: telemetry

- `noop adapter is the default when nothing is configured`
- `drops attributes that are not on the allowlist`
- `redacts email addresses and phone numbers from free text`
- `captureError forwards to the configured adapter`
- `otlp adapter exports a span to the configured endpoint`

### Slice 5: flavors and versioning

- `derives version, buildNumber and versionCode from a SemVer tag`
- `rejects a tag that is not SemVer`
- `versionCode grows with every SemVer increment`
- `public and corporate flavors resolve distinct ids, names and icons`
- `unknown flavor fails the config`
- A release pull request opened by release-please carries the changelog
  generated from Conventional Commits.

### Slice 6: the factory graph

- `fails the spec when an acceptance criterion has no test name`
- `stops at the plan approval before any file is written`
- `resumes after approval and reaches the pull request step`
- `returns to implement when verification fails and escalates at the limit`
- `never reaches submit without an approved submission`
- `submit does not run twice when the approval is resumed`
- `file tools reject a path outside the workspace`
- `command runner rejects a command outside the allowlist`
- `agent cannot write to a protected path`

### Slice 7: publishing

- `fastlane exposes build and submit lanes for both platforms and flavors`
- `submit lanes refuse to run without the approval flag`
- `release workflow builds from a SemVer tag only`
- The distribution paths per flavor are documented with the vendor pages
  that back them.

### Slice 8: the reference feature, built through the factory

- The daily store checklist is specified in `specs/`, and its pull request
  is opened by the factory.
- `checklist lists the tasks of the day`
- `toggling a task persists and survives a reload`
- `e2e: manager completes the daily checklist`

## Out of scope for the first version

- A real store submission. The lanes exist and run as a dry run. The first
  upload to a real store waits for an explicit approval and for credentials.
- The Apple Developer Enterprise Program path.
- iOS E2E as a required check. The iOS simulator build is required; the iOS
  Maestro run reports without blocking until it proves stable.
- Over-the-air updates, push notifications, sign-in, and a real backend. The
  app talks to an in-memory demo API through the same client a real API
  would use.
- Languages other than English, tablet layouts and the web target.
- MDM app configuration, store listing metadata and screenshots.
- A hosted deployment of the graph. It runs from the CLI with a SQLite
  checkpointer.

## Security

- No secret enters the repository. Store keys, the keystore and certificates
  live in a password manager or in GitHub secrets. Only `.env.example` is
  versioned.
- Telemetry events carry no personal data. The telemetry port drops every
  attribute outside an allowlist and redacts free text.
- The message a user sees comes from a catalog keyed by error code. The
  technical detail goes to telemetry and never to the screen.
- The factory treats model output as untrusted, as listed under the graph.
- The corporate flavor has its own bundle identifier, signing identity and
  keys. A build of one flavor cannot be submitted as the other.

## Edge cases the tests cover

- A release needs a new build with no code change: it gets a new patch tag.
  The same tag never produces two store builds.
- The process dies between an approval and its side effect: the checkpointer
  resumes at the side-effect node, which first asks the store whether that
  version is already there.
- The API answers with a body that is not problem details, or with no body.
- The device is offline during a retry sequence.
- A flavor is requested that does not exist.
