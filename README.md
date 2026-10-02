# mobile-app-factory

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

## License

MIT. See [LICENSE](LICENSE).
