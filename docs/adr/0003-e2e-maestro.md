# 0003: Maestro runs the on-device E2E tests

- Status: Accepted
- Date: 2026-10-02

## Context

E2E tests have to drive the built app on an Android emulator and an iOS
simulator in CI. Maestro and Detox were compared.

|                      | Maestro                                                                                                                   | Detox                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| License              | Apache 2.0                                                                                                                | MIT                                                                                                                         |
| Latest release       | CLI 2.11.0, 2026-09-29                                                                                                    | 20.51.4, 2026-06-16                                                                                                         |
| Expo                 | Expo's unit testing page recommends "E2E tests with Maestro", and Expo's former Detox page redirects to the Maestro guide | "Expo integration with Detox is entirely a community-driven effort. There is no special support for Expo projects in Detox" |
| React Native version | Tests the built binary, with no package inside the app                                                                    | Documented as compatible with React Native 0.77 to 0.84. Expo SDK 57 ships 0.86                                             |
| In-app footprint     | None                                                                                                                      | A native test client compiled into the app                                                                                  |

## Decision

Use Maestro, with the open-source CLI on GitHub-hosted runners.

**Discarded: Detox.** Its documented React Native range stops below the
version Expo SDK 57 ships, and it has no Expo support of its own.

## Consequences

- Flows are YAML files in `apps/reference/e2e/`. They select elements through
  the accessibility tree, so a screen that is hard for Maestro to drive is
  usually also hard for a screen reader.
- Maestro Cloud and its GitHub Action are paid. This repository runs the free
  CLI against an emulator the workflow starts.
- Physical iOS devices are not supported by Maestro. iOS runs on the
  simulator.
- The Android run is a required check from the first slice. The iOS run
  reports without blocking until it proves stable.

## Sources, read on 2026-10-02

- https://github.com/mobile-dev-inc/Maestro/blob/main/LICENSE
- https://raw.githubusercontent.com/mobile-dev-inc/Maestro/main/README.md
- https://docs.maestro.dev/get-started/supported-platform/react-native.md
- https://maestro.dev/pricing
- https://docs.expo.dev/develop/unit-testing/
- https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- https://raw.githubusercontent.com/wix/Detox/master/README.md
- https://raw.githubusercontent.com/wix/Detox/master/docs/introduction/partials/_getting-started-expo.md
