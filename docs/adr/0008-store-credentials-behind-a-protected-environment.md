# 0008: store credentials live behind a protected GitHub environment

- Status: Accepted
- Date: 2026-10-02

## Context

Two things can send a wrong build to a store. A caller can resume a graph
thread with a forged approval, because an `interrupt` takes whatever value
the resume call carries. And code written by an agent runs at build time
(dependency install scripts, `app.config.ts`, config plugins, bundling), so
a build job that holds store keys exposes them to that code.

## Decision

- **Store credentials are secrets of a GitHub environment named
  `store-submission`, with required reviewers.** GitHub releases environment
  secrets to a job only after one of the reviewers approves that job. This
  is the approval that protects the stores. The graph's `interrupt` records
  intent and decides nothing about credentials.
- **The factory dispatches the release workflow and holds no store
  credential.** It needs a token that can start a workflow, and nothing
  more.
- **Build and upload are separate jobs.**
  - The build job checks out the tag, installs, runs prebuild and compiles.
    It runs repository code and holds no store credential. It outputs an
    unsigned Android bundle and an unsigned iOS archive, with checksums.
  - The upload job references the protected environment. It downloads the
    artifacts, verifies the checksums, signs, and uploads with Fastlane
    actions from a pinned Gemfile. It installs no npm dependency and runs
    no app config, so nothing a dependency or the app carries executes
    next to a credential. The lanes it runs live under `fastlane/`, a
    protected path only a person changes.
- **The environment accepts deployments only from release tags.**
- **Files that execute at build time are protected paths for the agent**
  (spec 0001). A person authors those changes.

## Consequences

- A release needs two human actions: the answer to the graph's `interrupt`
  and the approval of the environment in GitHub. The second one is the one
  an attacker cannot answer from inside the graph.
- On a repository with a single maintainer, that maintainer is the required
  reviewer. A team turns on "prevent self-review".
- Required reviewers and environment secrets are available to public
  repositories on the GitHub Free plan. A private repository needs a paid
  plan for them.
- Signing after the build needs the unsigned outputs to be signable. On
  Android, the build job strips the debug signature from the bundle and the
  upload job signs it with `jarsigner`; a dry run proves the path with a
  throwaway key. On iOS, the build job archives with code signing off and
  the upload job exports with manual signing through `match`; that path
  runs only once an Apple signing identity exists, so a dry run with no
  identity checks the archive and exports nothing.

## Sources, read on 2026-10-02

- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- https://docs.langchain.com/oss/javascript/langgraph/interrupts.md
