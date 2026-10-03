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
   Every action that reaches a store sits in its own node behind an
   `interrupt`, and the upload itself runs behind a second approval that
   GitHub enforces.
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

One graph, two kinds of run. A **feature run** starts from a feature spec and
ends when its pull request is merged. A **release run** starts from a release
tag and ends when the build is in the stores. The tag exists because a person
merged the release pull request that release-please opened (ADR 0004), so the
two runs are separated by that approval.

| #   | Node                 | Kind          | What it does                                                                                                                                                                               |
| --- | -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | `route_entry`        | deterministic | Sends a feature spec to node 1 and a release tag to node 11.                                                                                                                               |
| 1   | `load_spec`          | deterministic | Parses the feature spec. Fails when a criterion has no test name.                                                                                                                          |
| 2   | `plan`               | model         | Maps each criterion to files and tests. Writes nothing.                                                                                                                                    |
| 3   | `approve_plan`       | **interrupt** | A human approves, edits or rejects the plan.                                                                                                                                               |
| 4   | `implement`          | agent         | Writes code and tests inside an isolated git worktree.                                                                                                                                     |
| 5   | `verify`             | deterministic | Lint, types, unit and component tests. Checks that every criterion's test exists and passed, and that the diff touches no protected path.                                                  |
| 6   | `review`             | model         | Reads the diff against the spec and the security rules.                                                                                                                                    |
| 7   | `escalate`           | **interrupt** | Reached when `verify` or `review` fails three times. A human decides.                                                                                                                      |
| 8   | `open_pull_request`  | side effect   | Commits to a branch the factory owns, pushes it and opens the pull request. CI runs E2E and the preview builds.                                                                            |
| 9   | `await_ci`           | deterministic | Reads the checks. A failure returns to `implement`.                                                                                                                                        |
| 10  | `approve_merge`      | **interrupt** | A human reviews and merges; the factory never merges, and the feature run ends here. Rejecting with a note sends the note back to `implement`, and the fix lands on the same pull request. |
| 11  | `load_release`       | deterministic | Validates the release tag and derives the version numbers.                                                                                                                                 |
| 12  | `approve_submission` | **interrupt** | One approval per store and flavor, showing version, flavor, store and track.                                                                                                               |
| 13  | `submit`             | side effect   | Dispatches the release workflow for that store, flavor and track. The upload job waits for a reviewer in a protected GitHub environment.                                                   |
| 14  | `approve_promotion`  | **interrupt** | A human approves the move from the test track to production or to the organization.                                                                                                        |
| 15  | `promote`            | side effect   | Dispatches the promotion, behind the same protected environment.                                                                                                                           |
| 16  | `report`             | deterministic | Writes what happened and what was measured. Both kinds of run end here.                                                                                                                    |

Rules the graph holds:

- **A side effect lives in the node after its approval.** LangGraph restarts
  a node from its first line on resume, so an upload placed before an
  `interrupt` would run twice.
- **The pull request is the review surface.** Opening it needs no approval of
  its own: it lands on a branch, changes nothing on `main`, and the merge is
  a person's.
- **The factory never holds a store credential.** An `interrupt` records
  intent, and whoever can resume the thread can answer it, so it is not the
  control that protects the stores. That control is the `store-submission`
  environment in GitHub: its secrets are released to the upload job only
  after a required reviewer approves that job (ADR 0008).
- **`submit` and `promote` default to a dry run.** They dispatch a real
  upload only when the state carries the matching approval and the operator
  set `FACTORY_ALLOW_STORE_SUBMIT=true`.
- **Model output is untrusted input.** File tools reject paths outside the
  worktree. The command runner accepts an allowlist of npm scripts. The
  agent's process receives no secret.
- **Protected paths need a person.** The agent cannot change `.github/`,
  `fastlane/`, `factory/`, the release configuration, `app.config.ts`,
  config plugins, any `package.json` or the lockfile. These are the files
  that execute at build time or decide what gets installed. `verify` checks
  the diff for them, independently of the file tools.

## Slices and acceptance criteria

Each slice is one pull request. Under **Tests**, each line is the exact name
of a test. Under **Delivered with it** are the parts a test name cannot
carry; the pull request reports how each was checked.

### Slice 1: QA pipeline green with an empty app

Tests:

- `home screen renders the app title`
- `e2e: app launches and shows the home screen`
- `ci workflow defines every job the ruleset requires`

Delivered with it: CI jobs `lint`, `typecheck`, `unit`, `e2e-android`,
`preview-android` and `preview-ios` on every pull request, and a ruleset on
`main` that blocks the merge when one fails.

### Slice 2: design tokens and theming

Tests:

- `every text and surface pair meets WCAG AA contrast in light and dark`
- `brand override replaces brand tokens and keeps the semantic roles`
- `theme follows the system color scheme`
- `interactive elements expose a role and an accessible name`

### Slice 3: error handling

Tests:

- `parses a problem details response into an AppError`
- `falls back to a generic AppError when the body is not problem details`
- `retries an idempotent request with backoff`
- `never retries a non-idempotent request`
- `user message catalog covers every error code`
- `error boundary shows the user message and hides the technical detail`

### Slice 4: telemetry

Tests:

- `noop adapter is the default when nothing is configured`
- `drops attributes that are not on the allowlist`
- `never forwards server detail or exception messages by default`
- `redacts email addresses, phone numbers and long digit runs from free text`
- `captureError forwards to the configured adapter`
- `otlp adapter exports a span to the configured endpoint`

### Slice 5: flavors and versioning

Tests:

- `derives version, buildNumber and versionCode from a release tag`
- `rejects a tag outside the accepted grammar`
- `versionCode grows with every accepted version increment`
- `public and corporate flavors resolve distinct ids, names and icons`
- `unknown flavor fails the config`
- `release configuration builds the changelog from conventional commits`

### Slice 6: the factory graph

Tests:

- `fails the spec when an acceptance criterion has no test name`
- `stops at the plan approval before any file is written`
- `resumes after approval and reaches the pull request step`
- `returns to implement when verification fails and escalates at the limit`
- `never reaches submit without an approved submission`
- `submit does not run twice when the approval is resumed`
- `submit runs as a dry run unless the operator flag is set`
- `file tools reject a path outside the workspace`
- `command runner rejects a command outside the allowlist`
- `verify fails a diff that touches a protected path`

### Slice 7: publishing

Tests:

- `fastlane exposes build and submit lanes for both platforms`
- `release workflow builds from a release tag only`
- `upload jobs run in the protected environment and build jobs do not`
- `build jobs receive no store credential`

Delivered with it: the distribution paths per flavor, documented with the
vendor pages that back them, and a runbook for the first submission.

### Slice 8: the reference feature, built through the factory

Tests:

- `checklist lists the tasks of the day`
- `toggling a task persists and survives a reload`
- `e2e: manager completes the daily checklist`

Delivered with it: the feature spec in `specs/`, and a pull request opened
by the factory.

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
  live in a password manager or in GitHub environment secrets. Only
  `.env.example` is versioned.
- **Store credentials are released only inside the protected environment**,
  after a required reviewer approves the job. The job that holds them
  downloads a built artifact, signs it and uploads it. The only repository
  code it runs is the lanes under `fastlane/` and their pinned Gemfile, both
  protected paths that only a person changes; it installs no npm dependency
  and evaluates no app config. The jobs that do (install, prebuild, compile)
  hold no store credential.
- A release builds only from a tag on `main`, and `main` only takes
  reviewed pull requests with green checks.
- Telemetry events carry no personal data. The port drops every attribute
  outside an allowlist. Server-provided text and exception messages are not
  sent by default; when enabled they pass a redactor, which is a second
  line of defence and no guarantee. Events carry a session id that is
  random per launch and is not stored.
- The message a user sees comes from a catalog keyed by error code. The
  technical detail never reaches the screen.
- The factory treats model output as untrusted, as listed under the graph.
- **The tests the agent writes run on the host, as the operator's user.**
  The scratch HOME and the minimal environment keep tokens out of their
  reach, and the allowlist limits which scripts start, but neither is a
  sandbox: a test can read or write any path the user can. Run the
  factory inside a disposable VM or container with no credentials but its
  own, and give the agent's checks no network beyond the package registry.
- Protected paths are checked three times: by the write tool, by `verify`
  on the diff, and on the staged files right before the commit, because
  tests run between the second check and the commit.
- The corporate flavor has its own bundle identifier, signing identity and
  keys. A build of one flavor cannot be submitted as the other.

## Edge cases the tests cover

- A release needs a new build with no code change: it gets a new patch tag.
  The same tag never produces two store builds.
- A tag with a minor or patch above 999, or with a pre-release suffix.
- The process dies between an approval and its side effect: the checkpointer
  resumes at the side-effect node, which first asks GitHub whether a release
  run for that tag, store and flavor already exists.
- The API answers with a body that is not problem details, or with no body.
- The device is offline during a retry sequence.
- A flavor is requested that does not exist.
