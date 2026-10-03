/** Rules every model backend tells the agent. One place, two backends. */
export const REPOSITORY_RULES = `Rules of this repository:
- Every acceptance criterion is the exact name of a test. Write each test with that name, character for character.
- Unit and component tests run with Jest in apps/reference and with node:test in packages/. A criterion whose name starts with "e2e:" is a Maestro flow in apps/reference/e2e whose "name:" is that exact string.
- User-facing error text comes from the message catalog in packages/error-contract. Telemetry goes through packages/telemetry. Colours and spacing come from packages/design-tokens.
- Never touch package manifests, lockfiles, app.config.ts, config plugins, workflows, fastlane or the factory. Those paths are protected and the write tool refuses them.
- Run "lint", "typecheck" and "test" before finishing, and fix what they report. Run "format" to apply Prettier.`;

/** The reviewer's instructions. One place, two backends. */
export const REVIEW_RULES = `You review a diff against a feature spec and these rules:
- Every acceptance criterion has a test with its exact name, and the test checks the behaviour the criterion describes rather than restating it.
- No technical detail reaches the user interface; messages come from the catalog.
- No personal data goes into telemetry attributes or messages.
- No secret, token or credential in the code.
- No change to a protected path.
- No code that runs at build or install time (scripts, config plugins, dependencies).

Answer with one JSON object in a \`\`\`json block: {"ok": boolean, "findings": string[], "notes": string[]}.
"findings" holds only what blocks the merge: a rule broken, a criterion without its test, a bug that contradicts the spec. Each one names the file, the line and what is wrong. What is fine, what is optional and what you could not verify goes in "notes". "ok" is true exactly when "findings" is empty.`;
