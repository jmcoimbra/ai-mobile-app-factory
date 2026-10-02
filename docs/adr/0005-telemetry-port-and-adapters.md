# 0005: telemetry goes through a port with Sentry-protocol and OTLP adapters

- Status: Accepted
- Date: 2026-10-02

## Context

The app needs crash reporting, traces and usage metrics, over open standards
where they fit, with a backend that can be replaced and with no personal data
in any event.

OpenTelemetry is the open standard for traces and metrics, and its coverage
of React Native is partial. Its own documentation says the JavaScript
packages "work for React Native" and "are not explicitly supported for that
environment". Its client platform pages list Android, iOS and Web. Native
crashes on iOS and Android are outside what the JavaScript SDK captures.

Options read for crash reporting:

| Client | License | Native crashes | Expo | Where the data can go |
|---|---|---|---|---|
| `@sentry/react-native` | MIT | Yes, on both platforms | Config plugin, documented by Expo | Any server speaking the Sentry protocol: Sentry (its server is under the Functional Source License) or GlitchTip (MIT) |
| `@embrace-io/react-native` | Apache 2.0 | Yes, as an OpenTelemetry log | Config plugin; OTLP export needs manual native edits | Any OTLP over HTTP endpoint |
| OpenTelemetry JS alone | Apache 2.0 | No | No statement | Any OTLP endpoint |

## Decision

The app talks to a **telemetry port** in `packages/telemetry`. Adapters sit
behind it, and the app never imports a vendor SDK directly.

- **Crashes and errors: the Sentry protocol**, through `@sentry/react-native`.
  The DSN is the swap point. Pointing it at GlitchTip moves the data to an
  MIT-licensed server with no code change.
- **Traces and usage events: OTLP over HTTP**, through the OpenTelemetry
  JavaScript packages. The endpoint is the swap point. This adapter is marked
  experimental, matching the status OpenTelemetry gives React Native.
- **Default: a no-op adapter.** With no DSN and no endpoint configured, the
  app sends nothing.
- **A PII guard runs inside the port**, before any adapter.
  - Attributes outside an allowlist of keys are dropped.
  - Free text is not sent by default: an error travels as its code, its
    type and its stack frames, without the message.
  - When an adopter turns messages on, they pass a redactor for e-mail
    addresses, phone numbers and long digit runs. Pattern redaction misses
    names and addresses, which is why it is off by default and never the
    only control.
  - The only identifier is a session id, random per launch and not stored.
    A persistent installation id is an opt-in an adopter makes with their
    privacy notice in hand.

**Discarded as the crash client: Embrace.** It is the option closest to pure
OpenTelemetry, and its OTLP export on Expo still needs hand edits to native
files that `prebuild --clean` would discard.

## Consequences

- Each flavor has its own DSN and endpoint, read from the environment at
  build time.
- The Sentry SDK needs a native build. The app runs as a development build
  and never in Expo Go once this adapter is on.
- Sentry's own OTLP ingestion is in open beta and takes traces and logs. It
  is a possible single backend later and is not relied on here.

## Sources, read on 2026-10-02

- https://opentelemetry.io/docs/demo/services/react-native-app/
- https://opentelemetry.io/docs/platforms/client-apps/
- https://opentelemetry.io/docs/languages/js/
- https://raw.githubusercontent.com/getsentry/sentry-react-native/main/LICENSE.md
- https://raw.githubusercontent.com/getsentry/sentry/master/LICENSE.md
- https://docs.sentry.io/platforms/react-native/features.md
- https://docs.sentry.io/platforms/react-native/guides/expo.md
- https://docs.sentry.io/concepts/otlp/
- https://glitchtip.com/sdkdocs/react-native
- https://embrace.io/docs/react-native/
- https://raw.githubusercontent.com/embrace-io/embrace-react-native-sdk/main/packages/core/README.md
- https://docs.expo.dev/monitoring/services/
