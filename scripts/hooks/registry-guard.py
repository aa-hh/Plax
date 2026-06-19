#!/usr/bin/env python3
# PreToolUse (Write) hook — block a full-file Write of the component registry.
#
# docs/design-system/component-registry.md is the shared source of truth and has
# been lost twice to wholesale rewrites (it gets replaced from scratch instead of
# edited entry-by-entry). This hook denies a Write whose target is the registry,
# forcing Edit of individual entries. To add a component, Edit-append a new "### "
# section. (Edit is unaffected; only full-file Write is blocked.)
import sys, json, re

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)

if (d.get("tool_name") or "") != "Write":
    sys.exit(0)

fp = ((d.get("tool_input") or {}).get("file_path") or "")
if not re.search(r"docs/design-system/component-registry\.md$", fp):
    sys.exit(0)

reason = (
    "Blocked: full-file Write to the component registry (the shared source of "
    "truth). It has been lost twice to wholesale rewrites. Change it with Edit on a "
    "specific entry; to add a component, Edit-append a new '### <name>' section. "
    "Never replace the whole file from the agent — if a full rebuild is truly "
    "needed, do it manually outside the agent and commit it."
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }
}))
sys.exit(0)
