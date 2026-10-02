# 0007: RFC 9457 problem details is the error contract

- Status: Accepted
- Date: 2026-10-02

## Context

The app and the API need one shape for errors. Without it, each screen
invents its own handling, technical text reaches the user, and a retry gets
attached to a request that is unsafe to repeat.

## Decision

- **The wire format is RFC 9457 problem details**
  (`application/problem+json`), with one extension member: `code`, a stable
  machine-readable string such as `checklist.task_not_found`.
- `packages/error-contract` owns the schema, the list of codes and the
  mapping from a response to an `AppError`. A body that is missing or that
  fails the schema becomes a generic `AppError` with the HTTP status kept.
- **The message a user reads comes from a catalog keyed by `code`.** The
  `detail` member is technical and goes to telemetry. It is never rendered.
- **Retry with backoff applies to idempotent requests only.** RFC 9110
  defines `PUT`, `DELETE` and the safe methods as idempotent. Those are
  retried up to three times, with exponential backoff and jitter, on a
  network failure or on 429, 502, 503 and 504, honouring `Retry-After`.
  `POST` and `PATCH` are never retried automatically.
- **Error boundaries** wrap the root layout and each route. A boundary shows
  the catalog message and a retry action, and reports the error through the
  telemetry port.

## Consequences

- A write the app needs to repeat safely is modelled as a `PUT` of the full
  resource state.
- Adding an error code means adding its user message in the same change. A
  test fails when the catalog misses a code.

## Sources, read on 2026-10-02

- https://www.rfc-editor.org/rfc/rfc9457.txt
- https://www.rfc-editor.org/rfc/rfc9110.txt (section 9.2.2)
