# The factory

A LangGraph graph that takes a feature spec to a reviewed pull request, and
a release tag to a store submission, stopping for a person at every point
that matters. The design is in `docs/spec/0001-factory-and-reference-app.md`
and `docs/adr/0001`, `0004` and `0008`.

## Run it

```bash
# A feature run: plan, approval, implementation, checks, review, pull request.
npm run factory -w @maf/factory -- feature specs/daily-checklist.md

# Answer the approval it stops at (the thread id is printed at the start).
npm run factory -w @maf/factory -- resume feature-202610021830 --approve --by juliano

# A release run: one store, one flavor. Dispatches the release workflow as a
# dry run unless FACTORY_ALLOW_STORE_SUBMIT=true is set.
npm run factory -w @maf/factory -- release v0.1.0 --store play --flavor corporate

npm run factory -w @maf/factory -- status <thread>
```

Needs: Node 24, `git` and `gh` logged in, and a model. The model is
`anthropic:claude-opus-5-5` by default; set `FACTORY_MODEL` to any
`provider:model` LangChain knows, with that provider's package installed
and its API key in the environment of the factory process. The agent's own
processes never see that environment: see `src/policy.ts`.

## What it will not do

- Merge a pull request. A person does, after reading it.
- Send a build to a store. It dispatches a workflow whose upload job waits
  for a reviewer in a protected GitHub environment, and only when the
  operator set `FACTORY_ALLOW_STORE_SUBMIT=true`.
- Change a protected path (workflows, manifests, lockfiles, app config,
  config plugins, fastlane, the factory itself). The write tool refuses,
  and `verify` checks the diff again.
- Run anything but the allowed npm scripts, and never with a secret in the
  environment.

## Layout

```
src/graph.ts        the nodes, the interrupts and the edges
src/state.ts        the state and the answer schemas
src/spec.ts         the feature spec format
src/policy.ts       protected paths, allowed scripts, child environment
src/ports.ts        what the graph needs from the outside
src/adapters/       git worktrees, GitHub, the sandbox, the command runner, the models
src/cli.ts          feature, release, resume, status
test/               the graph with fakes, the sandbox, the parsers
```
