---
description: Delegate an async task to OpenCode, or check/read an existing task (SDK-based)
argument-hint: '[run|status|wait|result|summary|list|cancel] [id] [prompt] [--model p/m] [--title t] [-f file] [--wait]'
allowed-tools: Bash(node:*), Bash(timeout:*), AskUserQuestion
---

Delegate work to OpenCode **asynchronously** with the bundled `opencode-task.mjs` SDK CLI — fire a task,
check whether it is still processing, then read its result or a generated summary later. The headless
server is started and reused for you; every task is an OpenCode session on it.

Arguments: `$ARGUMENTS`

**Requires** the OpenCode SDK: `npm install -g @opencode-ai/sdk` (the script resolves it automatically;
if it is missing the script prints this hint and exits non-zero). It uses the user's **configured default
model** unless `--model provider/model` is given — do not add `--model` unless the user named one.

## Routing

The script lives at `${CLAUDE_PLUGIN_ROOT}/scripts/opencode-task.mjs`. Invoke subcommands with the Bash
tool (wrap long waits in `timeout`):

- No args, `list`, or `status` → `node …/opencode-task.mjs list` (table of tasks) / `status <id>` (one).
- `run "<prompt>"` → submit async; returns a session id. Options: `--wait` (foreground, prints result),
  `--model provider/model`, `--title <t>`, `-f <file>` (attach as context; repeatable), `--dir <path>`.
- `wait <id>` → block until it finishes, then print the result (`--timeout <sec>` to bound it).
- `result <id>` → print a finished task's full output (`--raw` for piping, `--verbose` for reasoning).
- `summary <id>` → generate a concise bullet summary of a task's outcome.
- `cancel <id>` → abort a running task.

## Steps

1. **Prereq check:** run `node "${CLAUDE_PLUGIN_ROOT}/scripts/opencode-task.mjs" list`. If it errors with
   the SDK install hint, relay that and stop (`npm install -g @opencode-ai/sdk`).
2. Route by the first argument (see Routing). For `run` with no prompt, `AskUserQuestion` for what OpenCode
   should do, then build one self-contained prompt (name the exact files/functions; state read-only vs
   write intent). Never insert `--model` unless the user explicitly requested a specific model.
3. For a task that may be slow, submit it **async** (no `--wait`), then tell the user the returned session
   id and how to follow it: `status <id>` / `wait <id>` / `result <id>`. For a quick task, add `--wait`.
4. Return the script's output. Relay OpenCode's answer **verbatim** — do not paraphrase or editorialize.

Note: this is a general-purpose async delegation path on the SDK/server. For the read-only review and
adversarial-review flows use `/opencode-agent-cc:review` and `/opencode-agent-cc:adversarial-review`; for a
write-capable rescue use `/opencode-agent-cc:rescue`.
