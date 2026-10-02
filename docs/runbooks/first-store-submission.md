# Runbook: the first submission to a store

What a maintainer does once per store and flavor before the factory's
release run can upload anything. Nothing here is automated on purpose: each
step creates an account, a key or a permission that a person owns.

## 1. Accounts

| Store                     | What to have                                                                                                                                                                                          | Reference |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Google Play               | A developer account (25 USD, once). An organization account needs a D-U-N-S number. A personal account created after 2023-11-13 must run a closed test with 12 testers for 14 days before production. | ADR 0006  |
| App Store                 | An Apple Developer Program membership (99 USD a year). An organization needs a D-U-N-S number.                                                                                                        | ADR 0006  |
| Corporate flavor, Android | A managed Google Play enterprise on the organization's side, and its organization ID.                                                                                                                 | ADR 0006  |
| Corporate flavor, iOS     | An Apple Business account on the organization's side, and its organization ID.                                                                                                                        | ADR 0006  |

## 2. Identifiers

Replace the placeholders with the identifiers registered in the stores, as
repository variables (Settings, Secrets and variables, Actions, Variables):

- `APP_ID_PUBLIC`, for example `com.yourcompany.app`
- `APP_ID_CORPORATE`, for example `com.yourcompany.app.staff`

The two must differ: a Play app restricted to organizations stays private
for good, and an App Store app cannot switch distribution method after
approval (ADR 0006).

## 3. The protected environment

```bash
tooling/apply-environment.sh <owner>/<repo> [<reviewer>]
```

This creates the `store-submission` environment with the repository owner
(or the person or team named) as required reviewer and deployments allowed from `v*` tags only. Add the
secrets below to that environment, never to the repository. A team sets
"prevent self-review" on (ADR 0008).

| Secret                                                                                                  | What it is                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64_PUBLIC`, `ANDROID_UPLOAD_KEYSTORE_BASE64_CORPORATE`                     | One upload keystore per flavor, base64. Each generated once with `keytool` and backed up in the password manager. |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD_PUBLIC`, `ANDROID_UPLOAD_KEY_ALIAS_PUBLIC`, and the `_CORPORATE` pair | Their passwords and key aliases.                                                                                  |
| `PLAY_SERVICE_ACCOUNT_JSON`                                                                             | A Play Console service account with release permission, as JSON.                                                  |
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8`                   | An App Store Connect API key with the App Manager role; the `.p8` as base64.                                      |
| `MATCH_GIT_URL`, `MATCH_GIT_BASIC_AUTHORIZATION`, `MATCH_PASSWORD`                                      | The private repository where `match` keeps the iOS signing identities, its token, and the passphrase.             |

## 4. The first upload is manual on Google Play

The Play Developer API only changes an app that already has one upload.
Create the app in the Play Console, upload the first bundle by hand, and
let Play register the package name for developer verification. From the
second build on, the release run does it.

## 5. The ruleset and the first release

```bash
tooling/apply-ruleset.sh <owner>/<repo>
```

Then merge the release pull request that release-please keeps open. Its
merge creates the tag. Start the release run from that tag:

```bash
npm run factory -w @maf/factory -- release v0.1.0 --store play --flavor public
```

It stops at the submission approval. Answer it, and approve the
`store-submission` job in GitHub when it asks. Without
`FACTORY_ALLOW_STORE_SUBMIT=true` on the factory process, every run is a
dry run: the workflow builds, signs with a throwaway key and uploads
nothing, which is the way to rehearse the whole path before a key exists.
