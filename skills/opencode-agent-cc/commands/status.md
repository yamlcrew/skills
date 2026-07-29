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
   node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-info.mjs" --running
   ```
2. Present the JSON readably:
   - If `installed` is false → tell the user OpenCode isn't on PATH (show the `hint`) and stop.
   - Otherwise summarize: version, **default model** (and small model), configured providers, MCP servers,
     and the `mcpWarning`.
   - List `running` opencode processes as `[pid] etime — cmd`. If empty, say "no opencode runs active".
3. Note that finished **background** runs are not tracked here (ultra-thin): their output lives in the
   Claude background-task buffer, and `/opencode-agent-cc:cancel <pid>` stops an active one.
