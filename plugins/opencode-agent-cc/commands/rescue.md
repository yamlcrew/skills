---
description: Delegate investigation or a write-capable fix to the OpenCode rescue subagent
argument-hint: '[--background|--wait] [--model <provider/model>] [--agent build|plan] [task]'
allowed-tools: Task, Bash(opencode:*), Bash(timeout:*)
---

Hand a substantial task to OpenCode for a **write-capable rescue** (it may edit files and run commands).

Arguments: `$ARGUMENTS`

## Steps

1. If no task text is given, ask the user what OpenCode should investigate or fix, then continue.
2. Separate routing flags from the task text:
   - `--background` → run the subagent as a background task. `--wait` (or neither) → foreground.
   - `--model <provider/model>` → pass through only if the user named one (the subagent enforces that it
     must exist in `opencode models`). Otherwise the configured default is used — do not add `--model`.
   - `--agent build|plan` → pass through if given. Default is the subagent's write-capable `build`.
   These flags are routing controls — do not include them in the task text.
3. Delegate to the `opencode-agent-cc:opencode-rescue` subagent (via the Task tool) with the task text and
   any preserved `--model` / `--agent` / read-only intent. The subagent runs exactly one `opencode run`
   and returns its output.
   - Background: dispatch the subagent as a background task and tell the user to check
     `/opencode-agent-cc:status`, then read the result when it finishes.
4. Return the subagent's output **verbatim**, with no added commentary.

Note: rescue is write-capable by default — OpenCode may modify the repository. For read-only diagnosis,
include "read-only" / "diagnose only" in the task (or pass `--agent plan`).
