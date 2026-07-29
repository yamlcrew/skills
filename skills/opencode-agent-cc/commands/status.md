---
description: Show the OpenCode environment and any currently running opencode processes
argument-hint: ''
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(ps:*), Bash(opencode:*)
---

Show the local OpenCode setup and which `opencode` runs are currently active.

## Steps

1. Run the environment probe:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-cc.mjs" doctor
   ```
2. Present the JSON readably:
   - If `installed` is false → tell the user OpenCode isn't on PATH (show the `hint`) and stop.
   - Otherwise summarize: version, **default model** (and small model), configured providers, MCP servers,
     and the `mcpWarning`.
   - List `running` opencode processes as `[pid] etime — cmd`. If empty, say "no opencode runs active".
   - If `managedServer` is present, report it (`url`, `pid`, `pidAlive`) — that is the single headless
     server the task CLI manages. `opencode-cc.mjs server` gives the fuller view (responding, uptime,
     busy sessions); `warnings` is worth relaying verbatim, e.g. a configured model that no longer exists.
3. Note that finished **background** runs are not tracked here (ultra-thin): their output lives in the
   Claude background-task buffer, and `/opencode-agent-cc:cancel <pid>` stops an active one.
