#!/usr/bin/env bash
# Create or update the ruleset that guards main, from .github/rulesets/main.json.
# Needs the GitHub CLI authenticated as a repository admin.
#   usage: tooling/apply-ruleset.sh <owner>/<repo>
set -euo pipefail

repo="${1:?usage: tooling/apply-ruleset.sh <owner>/<repo>}"
file=".github/rulesets/main.json"
name=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['name'])" "$file")
id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")

if [ -n "$id" ]; then
  gh api --method PUT "repos/$repo/rulesets/$id" --input "$file" --jq '.name + " updated: " + .enforcement'
else
  gh api --method POST "repos/$repo/rulesets" --input "$file" --jq '.name + " created: " + .enforcement'
fi
