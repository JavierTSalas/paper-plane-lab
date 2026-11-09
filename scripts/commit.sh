#!/usr/bin/env bash
# Serialised, path-scoped commit helper for parallel work in one checkout.
# Usage: scripts/commit.sh "message" <path> [<path>...]
set -euo pipefail
msg="$1"; shift
if [ "$#" -eq 0 ]; then echo "usage: scripts/commit.sh \"message\" <path>..." >&2; exit 2; fi
cd "$(git rev-parse --show-toplevel)"
exec 9>"${TMPDIR:-/tmp}/ppl-git.lock"
flock -w 120 9
git add -- "$@"
if git diff --cached --quiet -- "$@"; then echo "nothing to commit for: $*"; exit 0; fi
git commit -q -m "$msg" \
  -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PQDLC2SUrFfXaFAdRMqbkh" -- "$@"
git log --oneline -1
