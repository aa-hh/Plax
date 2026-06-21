#!/usr/bin/env bash
#
# reconcile-worktrees.sh — merge several per-agent worktree branches onto one
# integration branch, gate on tests, then (only with --publish) push + open a PR.
#
# Built for the "one git worktree + one branch per agent" workflow. It is the
# DETERMINISTIC spine; conflict *resolution* is human/agent judgment — this
# script stops and hands off when a merge conflicts (see docs/reconcile-runbook.md).
#
# Usage (run from the MAIN repo root, on a clean main):
#   ./scripts/reconcile-worktrees.sh                 # auto-detect worktree branches, reconcile, test, STOP before push
#   ./scripts/reconcile-worktrees.sh -b a -b b -b c  # explicit branch order (merge a, then b, then c)
#   ./scripts/reconcile-worktrees.sh --base main     # base branch (default: main)
#   ./scripts/reconcile-worktrees.sh --publish       # after green tests: push integration branch + open PR
#
# Safety:
#   • Refuses to run if the current worktree is dirty.
#   • Refuses to merge a branch whose worktree has uncommitted changes.
#   • Never runs `git add -A`, `git stash`, or `git reset --hard`.
#   • Never pushes or opens a PR without --publish.
#   • On conflict it STOPS (no auto-resolution) and tells you exactly what to do.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BASE="main"
PUBLISH=0
BRANCHES=()
INTEGRATION=""

while [ $# -gt 0 ]; do
  case "$1" in
    -b|--branch) BRANCHES+=("$2"); shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --integration) INTEGRATION="$2"; shift 2 ;;
    --publish) PUBLISH=1; shift ;;
    -h|--help) sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1 (try --help)" >&2; exit 2 ;;
  esac
done

[ -n "$INTEGRATION" ] || INTEGRATION="integration/$(date +%Y%m%d-%H%M)"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Preconditions ───────────────────────────────────────────────────────────
[ -z "$(git status --porcelain)" ] || die "Current worktree is dirty. Commit/park your work first — this script won't touch uncommitted changes."

say "Fetching and refreshing $BASE"
git fetch --all --prune
git checkout "$BASE"
git pull --ff-only || die "Could not fast-forward $BASE. Resolve $BASE first."

# ── Discover branches to merge ──────────────────────────────────────────────
# Auto-detect = every branch checked out in a worktree, except BASE itself.
if [ ${#BRANCHES[@]} -eq 0 ]; then
  say "Auto-detecting per-worktree branches"
  while IFS= read -r line; do
    case "$line" in
      "branch refs/heads/$BASE") : ;;
      branch\ refs/heads/*) BRANCHES+=("${line#branch refs/heads/}") ;;
    esac
  done < <(git worktree list --porcelain)
fi

[ ${#BRANCHES[@]} -gt 0 ] || die "No agent branches found. Pass them explicitly with -b <branch>."

# Verify each branch's worktree (if any) is committed — never merge half-done work.
say "Branches to merge onto $INTEGRATION (in order):"
for b in "${BRANCHES[@]}"; do
  git rev-parse --verify --quiet "refs/heads/$b" >/dev/null || die "Branch '$b' does not exist."
  wt="$(git worktree list --porcelain | awk -v b="refs/heads/$b" '
    /^worktree /{w=$2} $0=="branch "b{print w}')"
  if [ -n "$wt" ] && [ -n "$(git -C "$wt" status --porcelain)" ]; then
    die "Worktree for '$b' ($wt) has uncommitted changes. Commit them in that session first."
  fi
  printf '   • %s%s\n' "$b" "${wt:+   ($wt)}"
done

# ── Build the integration branch ────────────────────────────────────────────
say "Creating $INTEGRATION from $BASE"
git checkout -B "$INTEGRATION" "$BASE"

for b in "${BRANCHES[@]}"; do
  say "Merging $b"
  if ! git merge --no-ff --no-edit "$b"; then
    cat >&2 <<EOF

✗ CONFLICT merging '$b'. The script stops here ON PURPOSE.
  Conflicted files:
$(git diff --name-only --diff-filter=U | sed 's/^/    /')

  Resolve them (see docs/reconcile-runbook.md), then:
     git add <resolved files>
     git commit --no-edit
     ./scripts/reconcile-worktrees.sh -b <remaining branches…> $( [ "$PUBLISH" -eq 1 ] && echo --publish )
  (re-run with only the branches not yet merged; $INTEGRATION already has the earlier ones)
EOF
    exit 1
  fi
done

# ── Gate on the project checks ──────────────────────────────────────────────
say "Running Chrome 53 CSS guardrail"
npm run --silent check:css-compat || die "Chrome 53 CSS guardrail failed on the merged result. Fix before publishing."

say "Running test suite"
npm test || die "Tests failed on the merged result. Fix before publishing."

# ── Publish (only with --publish) ───────────────────────────────────────────
if [ "$PUBLISH" -eq 0 ]; then
  cat <<EOF

✓ Reconciled $INTEGRATION and all checks passed — but NOT pushed.
  Review:   git log --oneline $BASE..$INTEGRATION
            git diff $BASE..$INTEGRATION
  Publish:  ./scripts/reconcile-worktrees.sh --integration $INTEGRATION --publish
            (or push + open the PR yourself)
EOF
  exit 0
fi

say "Pushing $INTEGRATION and opening a PR"
git push -u origin "$INTEGRATION"
if command -v gh >/dev/null 2>&1; then
  gh pr create --base "$BASE" --head "$INTEGRATION" \
    --title "Reconcile agent branches → $BASE" \
    --body "Integration of: $(printf '%s, ' "${BRANCHES[@]}" | sed 's/, $//'). Guardrail + tests green. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
else
  echo "gh CLI not found — branch pushed. Open the PR manually for $INTEGRATION → $BASE."
fi
echo "✓ Done."
