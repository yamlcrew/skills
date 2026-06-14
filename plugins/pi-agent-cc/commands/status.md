---
description: Show the pi environment and any currently running pi processes
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(ps:*), Bash(pi:*)
---

Show the local pi setup and which `pi` runs are currently active.

## Steps

1. Run the environment probe:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-info.mjs" --running
   ```
2. Present the JSON readably:
   - If `installed` is false → tell the user pi isn't on PATH (show the `hint`) and stop.
   - Otherwise summarize: version, **default provider + model** (and thinking level), configured
     packages/extensions/skills, enabled model patterns, and the `toolStallWarning`.
   - List `running` pi processes as `[pid] etime — cmd`. If empty, say "no pi runs active".
3. Note that finished **background** runs are not tracked here (ultra-thin): their output lives in the
   Claude background-task buffer, and `/pi-agent-cc:cancel <pid>` stops an active one.
