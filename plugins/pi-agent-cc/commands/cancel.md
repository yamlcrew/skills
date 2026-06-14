---
description: Cancel a running pi process by PID
argument-hint: '[pid]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(ps:*), Bash(kill:*)
---

Stop an active `pi` run by its PID.

Arguments: `$ARGUMENTS`

## Steps

1. Get the live list of pi processes:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-info.mjs" --running
   ```
2. If no PID was given: show the `running` entries (`[pid] etime — cmd`) and ask which to cancel. If the
   list is empty, report that there is nothing to cancel and stop.
3. If a PID was given: **verify it appears in the `running` list above** before doing anything. Never run
   `kill` on a PID that is not a confirmed pi process from this list.
4. Terminate it: `kill <pid>`. Re-check with the probe; if it is still alive after a moment, escalate
   with `kill -9 <pid>`.
5. Report what was cancelled (pid + cmd) and confirm it is gone.
