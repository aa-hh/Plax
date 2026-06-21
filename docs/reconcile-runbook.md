# Reconciler runbook — merging parallel agent worktrees

This is the playbook for integrating work from **multiple agents that each ran in
their own git worktree + branch**, then opening one PR to `main`. Hand this file to
a reconciler agent (Agent tool, `isolation: "worktree"` not needed — it operates on
the main checkout), or follow it by hand. The deterministic spine is
`scripts/reconcile-worktrees.sh`; this runbook covers the judgment the script can't.

## The working model (why this exists)

- **One worktree + one branch per agent.** Agents never share a working tree, so
  they can't silently overwrite each other. `git worktree add ../xplay-<agent> -b <agent>-work`.
- When two agents edit the same file, it surfaces as a **3-way merge conflict** at
  integration — resolved once, deliberately — instead of a lost-write.
- Keep conflicts small: each agent **commits small + often**, and **merges `main`
  into its branch frequently** so drift shows up early.
- See memory: `no-git-stash-multi-instance`, `chrome53-css-guardrail`.

## Hard rules (multi-writer safety)

1. **Never** `git add -A`, `git commit -a`, `git stash`, `git reset --hard`, or
   `git checkout -- .` while other sessions are live. Explicit paths only.
2. Don't reconcile until **all agent sessions have finished and committed** their
   branches. The script refuses dirty worktrees for this reason.
3. **Don't drop stashes** you didn't create — they may be another agent's.
4. Publish only via an **integration branch + PR** (never force-push `main`).

## Steps

1. **Confirm every agent branch is committed.** `git worktree list` →
   `git -C <each worktree> status` must be clean. Chase down any session that
   hasn't committed; do not commit on its behalf unless you know the ownership.

2. **Pick merge order.** Smallest / most-foundational branch first (e.g. a shared
   token or config change before the features that build on it). Pass the order:
   `./scripts/reconcile-worktrees.sh -b foundation -b featA -b featB`
   (omit `-b` to auto-detect all worktree branches, but order is then arbitrary).

3. **Run the spine (stops before pushing):**
   `./scripts/reconcile-worktrees.sh -b … `
   It creates `integration/<date>`, merges each branch `--no-ff`, then runs
   `npm run check:css-compat` + `npm test`.

4. **On a conflict the script stops.** Resolve with judgment:
   - Understand BOTH sides — `git log --merge -p <file>` shows the conflicting commits.
   - **Merge intent, don't pick a winner.** If agent A added a CSS rule and agent B
     added a different rule to the same block, keep both. If they changed the *same*
     declaration, decide which is correct (read each agent's commit message / nearby
     code) — when unsure, STOP and ask the human.
   - Shared hotspots here are `src/styles/app.css` (changes usually live in different
     sections → keep both) and `package.json` (different scripts/deps → keep both).
   - After resolving: `git add <files> && git commit --no-edit`, then re-run the
     script with only the **remaining** branches.

5. **Honor the Chrome 53 guardrail.** If `check:css-compat` fails post-merge, a
   merged-in CSS feature is unsupported on Chromium 53 — fix it or add a same-line
   `/* chrome53-ok: <reason> */` (see `scripts/check-chrome53-css.cjs`). Do NOT
   blanket-annotate to make it pass.

6. **Review before publishing.**
   `git log --oneline main..integration/<date>` and `git diff main..integration/<date>`.
   Sanity-check that nothing from an unrelated agent leaked in.

7. **Publish (PR, not direct to main):**
   `./scripts/reconcile-worktrees.sh --integration integration/<date> --publish`
   → pushes the branch and opens a PR via `gh`. A human reviews + merges on GitHub.

## What this does NOT handle

- A single working tree with **uncommitted, intermingled** work from several agents
  (the pre-worktree mess). That needs manual attribution by explicit path — the
  script assumes each stream is already its own committed branch.
- Pushing straight to `main`. By design: combined multi-agent work goes through a PR.
