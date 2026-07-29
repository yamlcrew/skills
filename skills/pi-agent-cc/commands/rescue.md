---
description: Delegate investigation or a write-capable fix to the pi rescue subagent
argument-hint: '[--background|--wait] [--model <provider/model>] [task]'
allowed-tools: Task, Bash(pi:*), Bash(timeout:*)
---

Hand a substantial task to pi for a **write-capable rescue** (it may edit files and run commands).

Arguments: `$ARGUMENTS`

## Steps

1. If no task text is given, ask the user what pi should investigate or fix, then continue.
2. Separate routing flags from the task text:
   - `--background` → run the subagent as a background task. `--wait` (or neither) → foreground.
   - `--model <provider/model>` → pass through only if the user named one (the subagent enforces that
     it must resolve against `pi --list-models`). Otherwise the configured default is used — do not
     add `--model`/`--provider`.
   These flags are routing controls — do not include them in the task text.
3. Delegate to the `pi-agent-cc:pi-rescue` subagent (via the Task tool) with the task text and any
   preserved `--model` / read-only intent. The subagent runs exactly one `pi -p` and returns its output.
   - Background: dispatch the subagent as a background task and tell the user to check
     `/pi-agent-cc:status`, then read the result when it finishes.
4. Return the subagent's output **verbatim**, with no added commentary.

Note: rescue is write-capable by default — pi may modify the repository. For read-only diagnosis,
include "read-only" / "diagnose only" in the task (the subagent then restricts tools itself).
