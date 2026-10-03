# Runbook: cutting a release

How a version goes from merged pull requests to a tag, and the two manual
approvals on the way. The first release is a one-time setup covered in
[first-store-submission.md](first-store-submission.md); this runbook is for
every release after it.

## 1. The release pull request

Every push to `main` runs the `Release pull request` workflow. release-please
reads the Conventional Commits since the last tag and keeps one pull request
open, titled `chore(main): release X.Y.Z`, with the next version and the
changelog. Nothing in it is edited by hand. To change what goes in, merge or
revert pull requests on `main`.

## 2. Approve its CI runs

The release pull request cannot merge until its required checks pass, and
its checks do not start on their own.

release-please opens and updates the pull request with the workflow's
`GITHUB_TOKEN`. GitHub documents that a pull request created or updated that
way starts its `pull_request` workflow runs in an approval-required state,
and that a person with write access has to approve them
([GitHub docs](https://docs.github.com/en/actions/concepts/security/github_token)).
This happens on every update of the release pull request, so once per merge
to `main` while it stays open.

To approve in the browser: open the release pull request, and in the merge
box choose **Approve workflows to run**.

To approve from the command line:

```bash
# The runs waiting for approval on the release branch
gh run list --repo <owner>/<repo> --branch release-please--branches--main \
  --json databaseId,conclusion,createdAt \
  --jq '.[] | select(.conclusion == "action_required") | "\(.databaseId) \(.createdAt)"'

# Approve one of them
gh api --method POST repos/<owner>/<repo>/actions/runs/<run id>/approve
```

The workflow also starts CI by `workflow_dispatch` on the release branch.
Those runs are not held, but measured on the 0.1.0 release they did not
clear the merge box on their own: the pull request stayed blocked until the
held `pull_request` runs were approved and passed. Approve the held runs
even when a dispatched run is already green.

Approving runs CI on code release-please wrote: the version bump and the
changelog. It changes nothing in the app.

## 3. Merge the release pull request

When the required checks are green, review the version and the changelog,
then squash-merge. The merge is the approval of the release.

On that merge, the workflow tags `vX.Y.Z` on `main` and publishes the GitHub
release with the changelog. Check both:

```bash
gh release view vX.Y.Z --repo <owner>/<repo>
git fetch --tags && git merge-base --is-ancestor vX.Y.Z origin/main && echo "tag on main"
```

The app's version fields derive from the tag. For `v0.1.0` they are
`version` 0.1.0, `buildNumber` 1000 and `versionCode` 1000
([ADR 0004](../adr/0004-versioning-from-tags.md)).

## 4. Ship the tag

A tag does not reach a store by itself. Start a release run of the factory
for each store and flavor; it asks for its own approvals and the upload job
waits for a reviewer in the `store-submission` environment
([ADR 0008](../adr/0008-store-credentials-behind-a-protected-environment.md)):

```bash
npm run factory -w @maf/factory -- release vX.Y.Z --store play --flavor public
```

That command is a dry run: it builds, signs with a throwaway key and uploads
nothing. A real upload needs `FACTORY_ALLOW_STORE_SUBMIT=true` on the
factory process and the store credentials in the `store-submission`
environment, as [first-store-submission.md](first-store-submission.md) sets
up.

## Removing the manual approval

The approval in step 2 exists because release-please uses `GITHUB_TOKEN`.
Giving the workflow a GitHub App installation token instead makes its pull
request events start CI like a person's would, with no approval. That trades
a click per release for an app to create, install and keep its private key
in the repository secrets. This repository keeps the click.
