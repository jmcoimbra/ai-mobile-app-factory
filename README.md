# ai-mobile-app-factory

An agent-driven factory that takes a feature specification to a tested,
versioned and store-ready mobile app.

- **The factory** is a LangGraph graph. It turns a feature spec into code,
  tests, a build and a store submission, and it stops for human approval
  before anything is sent to an app store.
- **The reference app** is a React Native + Expo app built through the
  factory. It proves the pipeline end to end, in two flavors from one
  codebase: a public store app and a corporate app restricted to a company's
  staff.

Status: under construction, one slice per pull request.

## Where to start

- [The spec](docs/spec/0001-factory-and-reference-app.md): what gets built,
  the graph, the slices and their acceptance criteria.
- [Architecture decisions](docs/adr/README.md): LangGraph in TypeScript,
  Fastlane, Maestro, versions from tags, telemetry, store distribution and
  the error contract.

## How a change ships

1. A feature spec in `specs/` goes through the factory: plan, approval,
   code, checks, review, pull request. A person merges.
2. release-please keeps a release pull request open with the changelog.
   Merging it creates the tag `vX.Y.Z`; the app's version fields derive from
   that tag and are never edited by hand.
3. A release run builds one flavor from the tag and asks for an approval
   per store. The upload job waits for a reviewer in the `store-submission`
   environment, which is where the store credentials live. Without the
   operator flag the run is a dry run that uploads nothing.

Setting up the stores, the environment and the ruleset:
[docs/runbooks/first-store-submission.md](docs/runbooks/first-store-submission.md).

## License

MIT. See [LICENSE](LICENSE).
