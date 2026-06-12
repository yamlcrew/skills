# OpenCode CLI reference (for delegation from Claude Code)

Dense reference for driving `opencode` headless. Verified against OpenCode CLI **v1.17.3**. Flag
availability can change between versions — confirm with `opencode run --help` if a flag is rejected.

## Provider & model selection

OpenCode runs against whatever provider is authenticated in
`~/.local/share/opencode/auth.json` — no Claude OAuth involved.

**Default to the user's configured model; do not override it.** Model resolution precedence:

1. `--model provider/model` on the command (explicit override) — **only when the user asks for it**.
2. `"model"` in the resolved config (`~/.config/opencode/opencode.json`, merged with any project
   `./opencode.json`) — the user's default, used by the TUI and by `opencode run` when `--model`
   is omitted.
3. `"small_model"` — used only for lightweight internal work (titles/summaries), not the answer.

So a bare `opencode run "<prompt>"` (no `--model`) already runs on the user's exact default. Confirm
what that is without leaking secrets:

```bash
opencode debug config 2>/dev/null | grep -E '"(model|small_model)":'   # prints only the model fields
# → "model": "zai-coding-plan/glm-5.1"
```

If no `model` is configured, do **not** guess — show the user `opencode models` and ask which to use.

```bash
opencode auth list                 # configured providers (alias: opencode providers / ls)
opencode auth login [url]          # add a provider interactively
opencode auth logout [provider]    # remove one
opencode models                    # all valid provider/model ids (to show the user)
opencode models <provider>         # filter to one provider, e.g. opencode models zai-coding-plan
opencode models --verbose          # include cost / metadata
opencode models --refresh          # refresh cache from models.dev
```

**Provider/plan ≠ interchangeable (billing).** The same model can exist under multiple providers
billed differently — e.g. `zai-coding-plan/*` (Z.AI Coding Plan subscription endpoint
`…/api/coding/paas/v4`) vs a standard `zai/*` pay-per-token API. Use the provider id the user
configured; never swap it for the "same" model — that silently moves spend to another plan.

`--model` (alias `-m`) takes the **`provider/model`** format, e.g. `zai-coding-plan/glm-5.1`,
`anthropic/claude-opus-4-6`, `google/gemini-2.5-pro`. Only ids returned by `opencode models` are
valid in the current environment. Pass it only to honor an explicit user request for a specific
model — otherwise omit it.

`--variant` selects provider-specific reasoning effort (e.g. `high`, `max`, `minimal`).

## `opencode run` — the flags that matter for delegation

| Flag | Purpose |
|---|---|
| `-m, --model <provider/model>` | Override the default model — **only when the user asks**. Must exist in `opencode models`. Omit to use the user's configured default. |
| `-f, --file <path...>` | Attach one or more files to the message (native; avoid `cat \| …`). Greedy array — place the quoted message **before** `-f`, else a trailing prompt is read as a filename. |
| `--format default\|json` | `json` emits raw JSON events — use for programmatic capture. |
| `--agent <name>` | Run as a pre-configured agent (its tools/permissions apply). |
| `--dangerously-skip-permissions` | Auto-approve all non-denied permissions. Required for headless **write** tasks. |
| `--dir <path>` | Working directory (path on the remote server when `--attach`ing). |
| `--title <text>` | Session title (defaults to a truncated prompt). |
| `-c, --continue` / `-s, --session <id>` | Continue the last / a specific session. |
| `--fork` | Fork the session when continuing (with `--continue`/`--session`). |
| `--share` | Share the session. |
| `--attach <url>` | Send the run to an already-running `opencode serve` instead of cold-starting. |
| `-p, --password` / `-u, --username` | Basic auth for an attached server (default to `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME`). |
| `--print-logs`, `--log-level` | Diagnostics to stderr. |

Bare `opencode` (no subcommand) launches the interactive TUI — never use it for delegation.

## Capturing output verbatim

```bash
opencode run "<prompt>" 2>&1 | tee /tmp/opencode-out.txt   # human-readable (default model)
opencode run --format json "<prompt>" > /tmp/opencode.json # structured events
```

The first non-log lines on stdout in default format are OpenCode's answer; relay them.

## Write-capable delegation

Read-only tasks (review, analysis, explanation) need no extra flags. For tasks that edit files or
run commands, choose one:

1. `--dangerously-skip-permissions` — fastest, approves everything not explicitly denied. Use only
   when you intend the run to modify the workspace.
2. A scoped agent — create once, reuse with fixed permissions:

```bash
opencode agent create        # interactive creator
opencode agent list          # list available agents
opencode run --agent <name> "Apply the change to src/x.ts"
```

Without one of these, a write task blocks on a permission prompt that never arrives headless and
appears to hang.

## Headless server mode (many calls in one session)

Avoid repeated cold starts by running one server and attaching each call to it.

```bash
opencode serve --hostname 127.0.0.1 --port 4096            # start (foreground; backgrounds with &)
OPENCODE_SERVER_PASSWORD=secret opencode serve --port 4096 # optional HTTP basic auth
```

```bash
opencode run --attach http://127.0.0.1:4096 "Summarize the repo structure"
opencode run --attach http://127.0.0.1:4096 "Propose 3 high-impact refactors"
```

`serve` defaults `--hostname` to `127.0.0.1` and `--port` to `0` (random). If a port is taken,
pick another (`--port 4097`) and attach to the same URL.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `opencode: command not found` | Not on `$PATH`. Check the global bin dir (`npm prefix -g`) is on `$PATH`. |
| Command hangs, no output | Either bare `opencode` (TUI) — use `run`; or a write task without `--dangerously-skip-permissions`/`--agent`. |
| Errors/stalls on the model | You passed a `--model` id not in `opencode models`, or its provider isn't authenticated. Omit `--model` to use the configured default, or pass a listed id. |
| Prompt misparsed | Quote the whole prompt as one argument; escape inner quotes/backticks. |
| File not found | Use `-f` with a correct path, run from repo root, or pass `--dir`. |
| Port in use (serve) | `opencode serve --port 4097`, then `--attach http://127.0.0.1:4097`. |

## Optional: reusable Claude Code subagent

Instead of (or in addition to) this skill, you can register a dedicated Claude Code subagent that
forwards to OpenCode. Create `~/.claude/agents/opencode-consult.md`:

```markdown
---
name: opencode-consult
description: >-
  Delegate a consultation, code review, or analysis task to the OpenCode CLI for a
  second opinion or an alternative-model perspective.
tools:
  - Bash
---

Forward consultation requests to the OpenCode CLI.

1. Confirm the user's default model: `opencode debug config 2>/dev/null | grep -E '"(model|small_model)":'`.
   If none is configured, run `opencode models` and ask the user which `provider/model` to use — do not pick one.
2. Run headless on that default (no `--model`): `opencode run "<task>"` (add `-f <file>` after the prompt to attach files).
   Pass `--model <provider/model>` only if the user explicitly asked for a specific model; never switch provider/plan.
3. For write tasks add `--dangerously-skip-permissions`. For repeated calls, start
   `opencode serve` once and use `opencode run --attach <url> "<task>"`.
4. Return OpenCode's output verbatim.
```

Invoke it from a Claude Code session with `/agent:opencode-consult <task>`.
