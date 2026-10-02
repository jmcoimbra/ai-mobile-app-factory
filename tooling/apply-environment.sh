#!/usr/bin/env bash
# Create or update the store-submission environment: required reviewer is
# the repository owner, deployments allowed from release tags only.
# Needs the GitHub CLI authenticated as a repository admin.
#   usage: tooling/apply-environment.sh <owner>/<repo>
set -euo pipefail

repo="${1:?usage: tooling/apply-environment.sh <owner>/<repo>}"
owner="${repo%%/*}"
owner_id=$(gh api "users/$owner" --jq .id)

gh api --method PUT "repos/$repo/environments/store-submission" \
  --input - <<JSON | jq -r '"environment " + .name + " with " + (.protection_rules | length | tostring) + " protection rule(s)"'
{
  "reviewers": [{ "type": "User", "id": $owner_id }],
  "prevent_self_review": false,
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON

existing=$(gh api "repos/$repo/environments/store-submission/deployment-branch-policies" --jq '.branch_policies[] | select(.name == "v*") | .id')
if [ -z "$existing" ]; then
  gh api --method POST "repos/$repo/environments/store-submission/deployment-branch-policies" \
    -f name='v*' -f type=tag --jq '"deployments allowed from tags matching " + .name'
else
  echo "deployments already allowed from tags matching v*"
fi
