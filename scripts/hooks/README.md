# Tracked Claude Code hooks

`.claude/` is gitignored, so hooks placed there don't travel with the repo. These
hooks live here (tracked) so every clone/worktree has the script; each environment
just points its **local** `.claude/settings.json` at them.

## registry-guard.py

PreToolUse(`Write`) hook that **denies a full-file `Write` to
`docs/design-system/component-registry.md`** — the shared design source of truth,
which has been lost twice to wholesale rewrites. Forces `Edit` of individual
entries (to add a component, `Edit`-append a new `### <name>` section). Pairs with
the CI guard `test/component-registry.test.js`, which fails `npm test` if the
registry is truncated.

### Enable it in a worktree (one-time)

Add this block to that worktree's `.claude/settings.json` under `hooks.PreToolUse`:

```json
{
  "matcher": "Write",
  "hooks": [
    {
      "type": "command",
      "command": "\"$CLAUDE_PROJECT_DIR/scripts/hooks/registry-guard.py\"",
      "timeout": 10,
      "statusMessage": "Registry write guard…"
    }
  ]
}
```

Then `chmod +x scripts/hooks/registry-guard.py` (already executable in git). No
restart needed beyond Claude Code re-reading settings.

> The committed test (`test/component-registry.test.js`) is the primary,
> branch-agnostic safeguard — it runs in everyone's `npm test`. This hook is an
> additional local guard for environments that opt in.
