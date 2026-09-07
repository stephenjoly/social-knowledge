#!/usr/bin/env bash
# Read-only: no fetch, checkout, file mutation, or network access.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
printf 'Repository: %s\n' "$PWD"
printf 'Branch: %s\n' "$(git symbolic-ref --short -q HEAD || printf 'DETACHED')"
printf 'Commit: %s\n' "$(git rev-parse --short HEAD)"
git status --short | awk 'NR <= 20 { print } END { printf "Changed paths: %d (showing at most 20)\n", NR }'
git worktree list
for ref in origin/staging origin/main; do
  if git rev-parse --verify --quiet "$ref" >/dev/null; then
    printf '%s cached tip: ' "$ref"
    git log -1 --format='%h %cs %s' "$ref"
    printf 'HEAD-only / %s-only commits: ' "$ref"
    git rev-list --left-right --count "HEAD...$ref"
  else
    printf 'WARN: %s unavailable. Fetch before choosing a base.\n' "$ref"
  fi
done
printf '\nRefs above are cached; preflight does not fetch.\n'
printf 'New work: fetch, then branch from origin/staging; feature PRs target staging.\n'
for tool in node npm git; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: available\n' "$tool"
  else
    printf '%s: unavailable\n' "$tool"
  fi
done
