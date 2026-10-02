/** Rules every model backend tells the agent. One place, two backends. */
export const REPOSITORY_RULES = `Rules of this repository:
- Every acceptance criterion is the exact name of a test. Write each test with that name, character for character.
- Unit and component tests run with Jest in apps/reference and with node:test in packages/. A criterion whose name starts with "e2e:" is a Maestro flow in apps/reference/e2e whose "name:" is that exact string.
- User-facing error text comes from the message catalog in packages/error-contract. Telemetry goes through packages/telemetry. Colours and spacing come from packages/design-tokens.
- Never touch package manifests, lockfiles, app.config.ts, config plugins, workflows, fastlane or the factory. Those paths are protected and the write tool refuses them.
- Run "lint", "typecheck" and "test" before finishing, and fix what they report. Run "format" to apply Prettier.`;
