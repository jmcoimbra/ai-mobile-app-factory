# 0004: versions derive from SemVer tags created by release-please

- Status: Accepted
- Date: 2026-10-02

## Context

The app has three version fields: the user-facing `version`, the iOS
`buildNumber` and the Android `versionCode`. Editing them by hand is how two
stores end up with different builds under one name.

## Decision

- Commits follow Conventional Commits. Pull requests are squash-merged, so
  the pull request title is the commit.
- **release-please** reads the history, opens a release pull request with the
  changelog and the next SemVer version, and tags `vX.Y.Z` when that pull
  request is merged. The merge is the human approval of a release.
- The release workflow starts from the tag and passes it to the build as
  `APP_VERSION`. `app.config.ts` computes the three fields from it through
  `packages/app-version`. Nothing in the repository stores a build number.
- `versionCode = major * 1_000_000 + minor * 1_000 + patch`, and
  `buildNumber` is the same number as a string. Minor and patch stay below
  1000, which keeps the result under the Google Play ceiling of 2100000000
  for any major below 2100.
- A build outside a release (a pull request preview, a local run) is
  `0.0.0` with build number 1 and is never submitted.

**Discarded: semantic-release.** It releases on every qualifying push with no
pull request to approve, and a store release here needs that approval.

## Consequences

- The same tag never yields two store builds. A rebuild with no code change
  takes a new patch tag.
- Both flavors of one release carry the same version and build number. They
  differ by bundle identifier.
- Expo documents computing these fields from an environment variable in a
  dynamic config. The config stays synchronous, as Expo requires.

## Sources, read on 2026-10-02

- https://raw.githubusercontent.com/googleapis/release-please/main/README.md
- https://raw.githubusercontent.com/googleapis/release-please/main/LICENSE
- https://raw.githubusercontent.com/semantic-release/semantic-release/master/README.md
- https://docs.expo.dev/workflow/configuration/
- https://docs.expo.dev/build-reference/app-versions/
- https://developer.android.com/studio/publish/versioning
