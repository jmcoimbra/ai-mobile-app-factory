# Architecture decisions

One file per decision. A decision that replaces another says so in both files.
Every claim about a store, a license or a price cites the vendor page it was
read from and the date of the read.

| #                                                                | Decision                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [0001](0001-orchestration-langgraph-typescript.md)               | The factory is a LangGraph graph written in TypeScript                    |
| [0002](0002-build-and-submission-fastlane.md)                    | Fastlane builds and submits, on top of `expo prebuild`, in GitHub Actions |
| [0003](0003-e2e-maestro.md)                                      | Maestro runs the on-device E2E tests                                      |
| [0004](0004-versioning-from-tags.md)                             | Versions derive from SemVer tags created by release-please                |
| [0005](0005-telemetry-port-and-adapters.md)                      | Telemetry goes through a port with Sentry-protocol and OTLP adapters      |
| [0006](0006-distribution-paths.md)                               | Store paths for the public and the corporate flavor                       |
| [0007](0007-error-contract-problem-details.md)                   | RFC 9457 problem details is the error contract                            |
| [0008](0008-store-credentials-behind-a-protected-environment.md) | Store credentials live behind a protected GitHub environment              |
