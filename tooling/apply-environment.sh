#!/usr/bin/env bash
# Create or update the store-submission environment: one required reviewer,
# deployments allowed from release tags only.
# Needs the GitHub CLI authenticated as a repository admin.
#   usage: tooling/apply-environment.sh <owner>/<repo> [<reviewer login>]
# The reviewer defaults to the owner when the owner is a person. A repository
# owned by an organization needs the login of a person or a team.
set -euo pipefail

repo="${1:?usage: tooling/apply-environment.sh <owner>/<repo> [<reviewer login>]}"
owner="${repo%%/*}"
reviewer="${2:-}"

owner_type=$(gh api "users/$owner" --jq .type)
if [ -z "$reviewer" ]; then
  if [ "$owner_type" != "User" ]; then
    echo "$owner is an organization: name a person or a team as reviewer" >&2
    exit 2
  fi
  reviewer="$owner"
fi

if [[ "$reviewer" == */* ]]; then
  # org/team-slug
  reviewer_type="Team"
  reviewer_id=$(gh api "orgs/${reviewer%%/*}/teams/${reviewer#*/}" --jq .id)
else
  reviewer_type="User"
  reviewer_id=$(gh api "users/$reviewer" --jq .id)
fi

gh api --method PUT "repos/$repo/environments/store-submission" \
  --input - <<JSON | jq -r '"environment " + .name + " with " + (.protection_rules | length | tostring) + " protection rule(s)"'
{
  "reviewers": [{ "type": "$reviewer_type", "id": $reviewer_id }],
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
