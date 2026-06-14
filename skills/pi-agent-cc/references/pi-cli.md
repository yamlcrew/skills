# pi CLI reference (for delegation from Claude Code)

Dense reference for driving `pi` headless. Verified against pi **0.79.3** (`@earendil-works/pi-coding-agent`).
Flag availability can change between versions — confirm with `pi --help` if a flag is rejected.

## Provider & model selection

pi runs against whatever provider is configured in `~/.pi/agent/settings.json`, with API keys resolved
from environment variables or pi's auth storage (never stored in `settings.json`). No Claude OAuth is
involved.

**Default to the user's configured model; do not override it.** Model resolution precedence:

1. `--provider <name>` + `--model <pattern>` on the command (explicit override) — **only when the user asks**.
2. `defaultProvider` + `defaultModel` (+ `defaultThinkingLevel`) in the resolved settings
   (`~/.pi/agent/settings.json`, merged with any project `.pi/settings.json`) — the user's default,
   used by the TUI and by `pi -p` when `--provider`/`--model` are omitted.
3. If nothing is configured, pi falls back to its built-in default provider (`google`).

So a bare `pi -p "<prompt>"` (no `--model`) already runs on the user's exact default. Confirm what
that is without leaking secrets (`settings.json` is config-only — no API keys):

```bash
grep -E '"(defaultProvider|defaultModel|defaultThinkingLevel)":' ~/.pi/agent/settings.json
# → "defaultProvider": "zai-coding-plan"
#   "defaultModel": "glm-5.2"
#   "defaultThinkingLevel": "medium"
```

If there is no default and you need to pick, show the user the model list and ask — do not guess:

```bash
pi --list-models                 # table of every available provider/model
pi --list-models anthropic       # fuzzy-search filter to one provider
```

**Provider/plan ≠ interchangeable (billing).** The same model can exist under multiple providers
billed differently — e.g. `zai-coding-plan/*` (Z.AI **Coding Plan** subscription endpoint) vs a
standard `zai/*` pay-per-token API. Use the provider id the user configured; never swap it for the
"same" model — that silently moves spend to another plan.

`--model` takes the **`provider/model`** format, a bare pattern, or a pattern with a thinking suffix:

```bash
pi -p --model zai-coding-plan/glm-5.2 "…"     # explicit provider/model
pi -p --model sonnet "…"                      # fuzzy pattern (pi resolves provider)
pi -p --model sonnet:high "…"                 # pattern + thinking level
pi -p --provider openai --model gpt-4o "…"    # split form
```

Only ids/patterns that resolve against `pi --list-models` are valid in the current environment. Pass
`--model`/`--provider` only to honor an explicit user request — otherwise omit them.

`--thinking <level>` (`off|minimal|low|medium|high|xhigh`) sets the reasoning effort independently of
the model.

## `pi -p` — the flags that matter for delegation

| Flag | Purpose |
|---|---|
| `-p`, `--print` | Non-interactive: process the prompt and exit. Required for delegation (bare `pi` opens the TUI). |
| `@<file>` (positional) | Attach one or more files/images to the message; pi merges all `@`-paths in. Order-independent. |
| `--mode text\|json\|rpc` | `text` (default) prints the final answer to stdout; `json` emits JSONL events; `rpc` is a stdin/stdout JSONL protocol. |
| `--provider <name>` | Override the default provider — **only when the user asks**. Must be a provider in `pi --list-models`. |
| `--model <pattern>` | Override the default model (`provider/id`, pattern, or `pattern:thinking`). Omit to use the configured default. |
| `--thinking <level>` | Reasoning effort (`off`/`minimal`/`low`/`medium`/`high`/`xhigh`). |
| `--tools <list>` | Allowlist of tool names to enable (built-in + extension + custom). Others disabled. |
| `--exclude-tools <list>` | Denylist of tool names to disable. |
| `--no-tools` / `-nt` | Disable all tools. `--no-builtin-tools` (`-nbt`) disables built-ins only, keeping extension/custom tools. |
| `--no-extensions` / `-ne` | Disable extension discovery (explicit `-e` paths still load). |
| `--no-skills` / `-ns` | Disable skill discovery and loading. |
| `--no-prompt-templates` / `-np` | Disable prompt-template discovery. |
| `--no-context-files` / `-nc` | Disable `AGENTS.md`/`CLAUDE.md` discovery. |
| `--approve` / `-a` | Trust project-local resources (`.pi`, `.agents/skills`) for this run. |
| `--no-approve` / `-na` | Ignore project-local resources for this run. |
| `--continue` / `-c` | Continue the most recent session in this directory. |
| `--resume` / `-r` | Pick a session to resume. `--session <id\|path>` / `--session-id <id>` target a specific one. |
| `--name <text>` / `-n` | Set the session's display name. |
| `--no-session` | Ephemeral: don't persist the session. |
| `--api-key <key>` | Override the API key (usually unnecessary — prefer env/auth config). |

Built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

Bare `pi` (no `-p`/`--mode`) launches the interactive TUI — never use it for delegation.

## Capturing output verbatim

In default text print mode, pi writes the assistant's **final answer to stdout** and pushes all
startup, extension, and tool chatter to stderr. Capture stdout clean and relay it:

```bash
pi -p "<prompt>" 2>/dev/null > /tmp/pi-out.txt     # stdout = the answer (default model)
pi --mode json "<prompt>" 2>/dev/null > /tmp/pi.json  # structured JSONL events
```

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'   # final message
```

JSON event types of interest: `message_start`/`message_update`/`message_end` (the assistant message;
`message_update` carries `text_delta` chunks for streaming), `tool_execution_start`/`_end`,
`turn_end`, `agent_end` (full message list). The first JSON line is a `{"type":"session",…}` header.

## Read-only vs write-capable delegation

pi has no `--agent plan`/`build` split and **no permission prompt in non-interactive mode** — `-p`,
`--mode json`, and `--mode rpc` run tools with full process permissions and no built-in sandbox. You
control read-only vs write purely through the tool surface:

- **Read-only review/analysis** — restrict tools so the model physically cannot edit. The useful
  read-only surface (inspect files + run `git`, no edits, and no extension/MCP tools that could
  stall the run):

  ```bash
  timeout 600 pi -p --tools read,grep,find,ls,bash "Read-only review. Inspect with git and read the files. Do not modify anything."
  ```

  Hard read-only (no shell — no `git diff`, but the tree is untouchable):

  ```bash
  timeout 600 pi -p --tools read,grep,find,ls "…"
  ```

  `--exclude-tools edit,write` is a weaker form: it keeps `bash` (so shell can still redirect/rm)
  and keeps extension tools loaded — use the allowlist form instead for consults.

- **Write-capable (rescue/fix)** — bare `pi -p` already has every tool and never prompts; no extra
  flag is needed (contrast OpenCode's `--dangerously-skip-permissions`):

  ```bash
  timeout 600 pi -p "Apply the refactor to src/x.ts and run the tests."
  ```

Because non-interactive mode never blocks on trust, a write task cannot hang on a permission prompt —
but it **will** edit files immediately, so only run it bare when you intend writes.

## Avoiding tool-loop stalls

pi auto-loads configured extensions, skills, prompt templates, and packages (e.g. `context-mode`,
`pi-mcp-extension`) on every run. A consulted pi may defer to one of those tools instead of
answering, or loop on one. Three defenses, strongest first:

1. **Allowlist read tools** (`--tools read,grep,find,ls,bash`) — excludes every extension/custom tool
   by construction; ideal for pure-analysis consults.
2. **Disable resource discovery** — `--no-extensions --no-skills --no-prompt-templates` keeps the
   built-in tools but drops extension/skill/prompt machinery.
3. **Instruct in the prompt** — "answer directly from your own knowledge, do not call any tools."

Always wrap runs in `timeout` so a stall is bounded regardless.

## Project trust

In a directory with `.pi/` resources or `.agents/skills`, non-interactive mode **skips** them unless
there is a saved trust decision (`~/.pi/agent/trust.json`) or you pass `--approve`/`-a`. `--no-approve`
/`-na` explicitly ignores them. `AGENTS.md`/`CLAUDE.md` load regardless of trust unless you pass
`--no-context-files`/`-nc`.

```bash
pi -p --approve "…"                 # load project .pi / .agents resources
pi -p --no-approve --no-context-files "…"  # fully clean slate, no project/user context
```

Trust is only an input-loading guard, not a sandbox — it does not restrict what the model asks tools
to do once loaded.

## Chaining calls (shared history)

pi has no long-running headless server (cf. OpenCode `serve`/`--attach`). To keep conversation
context across several `pi -p` invocations, continue the same session — each call still cold-starts
the process, but the message history is shared:

```bash
pi -p --name "Audit orders" "Summarize the order-processing flow."   # starts a named session
pi -p --continue "Now review processOrder for race conditions."      # continues most-recent session
pi -p --session <id|path> "What did we conclude about locking?"      # targets a specific session
```

Use `pi -p --no-session "…"` for a one-shot that is not persisted.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `pi: command not found` | Not on `$PATH`. Check the global bin dir (`npm prefix -g`) is on `$PATH`; reinstall with `npm i -g @earendil-works/pi-coding-agent`. |
| Command hangs, no output | Bare `pi` (TUI) — use `pi -p`. Or the model is looping on a configured extension/MCP tool — add a `--tools read,…` allowlist or `--no-extensions --no-skills --no-prompt-templates`, and keep the `timeout` wrapper. |
| `[context-mode] WARNING: …` in captured output | You captured stderr with the answer. Capture stdout only: `pi -p "…" 2>/dev/null`. The warning is harmless. |
| `--model` id rejected / wrong model used | The id must resolve against `pi --list-models`. Omit `--model` to use the configured default, or pass a listed id/pattern. |
| Errors on the model / no provider | No API key for the configured provider. Check env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, …) or pi auth storage. |
| Prompt misparsed | Quote the whole prompt as one argument; escape inner quotes/backticks. |
| File not found on `@file` | Run from the repo root, or pass an absolute path. `@`-paths are relative to the cwd pi runs in. |
| Unwanted edits during a "review" | You ran bare `pi -p`. Use `--tools read,grep,find,ls,bash` (or `--exclude-tools edit,write`) for read-only. |
| Project skills/extensions not applied | Non-interactive mode skips untrusted project resources. Add `--approve`. |

## Optional: reusable Claude Code subagent

Instead of (or in addition to) this skill, you can register a dedicated Claude Code subagent that
forwards to pi. Create `~/.claude/agents/pi-consult.md`:

```markdown
---
name: pi-consult
description: >-
  Delegate a consultation, code review, or analysis task to the pi CLI for a
  second opinion or an alternative-model perspective.
tools:
  - Bash
---

Forward consultation requests to the pi CLI.

1. Confirm the user's default model: `grep -E '"(defaultProvider|defaultModel|defaultThinkingLevel)":' ~/.pi/agent/settings.json`.
   If there is no default and you need to choose, run `pi --list-models` and ask the user which `provider/model` to use — do not pick one.
2. Run headless on that default (no `--model`): `pi -p "<task>"` (attach files with `@<file>`).
   Pass `--model <provider/model>` only if the user explicitly asked for a specific model; never switch provider/plan.
3. For read-only consults restrict tools: `pi -p --tools read,grep,find,ls,bash "<task>"`. For write tasks, bare `pi -p` already writes — no permission flag is needed in print mode. Capture stdout with `2>/dev/null`.
4. Return pi's stdout verbatim.
```

Invoke it from a Claude Code session with `/agent:pi-consult <task>`.
