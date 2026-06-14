---
name: pi-agent-cc
description: >-
  Use when you want a second opinion, an alternative-model perspective, or to offload a
  code review, analysis, or explanation task to the pi CLI (`pi -p`) from inside
  Claude Code. Also use when a `pi -p` invocation hangs, returns no output, fails to
  pick a model, or you are unsure which provider/model pi is configured to use. Triggers:
  "ask pi", "second opinion", "delegate to pi", "consult pi", "pi -p hangs".
---

# Delegating to pi from Claude Code

Run the **pi** CLI headless with `pi -p` ("print mode": process the prompt and exit) from a `Bash`
tool call to get a second take on a task — then relay its output. This is the pi analog of the
`opencode-agent-cc` skill; it uses whatever provider/model pi is already configured with, no extra
auth setup. pi is the same agent this harness runs — so a delegation is a *fresh* pi session with a
potentially different model, giving you an independent perspective on the same repository.

## The one rule: use the model the user already configured

**Respect the user's default. Never pick or override the model yourself.** The user has a configured
default provider+model (the one their pi TUI uses) — delegations must run on *exactly* that provider
and model, not one you chose.

By default, **do not pass `--provider` or `--model` at all** — bare `pi -p` uses the configured
default, so parity is guaranteed by construction. Before the first delegation, confirm what that
default is (secret-safe — `settings.json` holds config only, never API keys):

```bash
grep -E '"(defaultProvider|defaultModel|defaultThinkingLevel)":' ~/.pi/agent/settings.json
# e.g. "defaultProvider": "zai-coding-plan", "defaultModel": "glm-5.2"   ← what every run will use
```

- **A default is shown** → run `pi -p` with **no** `--model`/`--provider`; it uses that exact default.
- **No settings file / no default** → pi falls back to its built-in default provider (`google`). This
  still works, but it may not be what the user expects. Run `pi --list-models`, show the user the
  list, and **ask which `provider/model` to use** rather than silently using the fallback.
- **User explicitly asked for a specific/different model** → only then pass `--model <provider/model>`
  (or `--provider <p> --model <m>`), and only an id that appears in `pi --list-models`.

### Provider/plan affects billing — never swap it

The same model can be served by different providers/plans that are billed differently — e.g.
`zai-coding-plan/*` (Z.AI **Coding Plan** subscription) vs a standard `zai/*` pay-per-token API
provider. They are *not* interchangeable. Use the **exact provider id** from the user's config;
never substitute a different provider or plan for the "same" model, or you silently move spend onto
a different billing path.

## Core pattern — read-only consultation

`-p` / `--print` is the headless flag (bare `pi` launches an interactive TUI that will appear to
hang). Pass the prompt as a single quoted argument — **no `--model`**, so it runs on the user's
configured default:

```bash
pi -p "Review the function processOrder in src/orders/process.ts for race conditions. \
Verdict, then each issue with line numbers and a fix. Do not modify files."
```

Attach files natively with `@file` (pi merges every `@`-prefixed path into the message — order does
not matter, unlike OpenCode's greedy `-f`):

```bash
pi -p "Find potential deadlocks in this file." @src/worker.ts
```

**Make a consult read-only** by restricting tools. pi has no `--agent plan` concept; instead, gate
tools directly. The clean read-only surface (read + search + git via shell, no edits, and no
extension/MCP tools that could stall the run) is an *allowlist*:

```bash
pi -p --tools read,grep,find,ls,bash "Read-only review. Inspect the change with git and read the \
files yourself. Do not modify anything." 
```

For a **hard** read-only pass (no shell either — no `git diff`, but no way to touch the tree), drop
`bash`: `--tools read,grep,find,ls`.

Wrap automation-style calls in `timeout` so a stuck call can never block indefinitely:

```bash
timeout 600 pi -p "…"
```

### Keep the consulted pi from stalling on tools

pi auto-loads configured extensions, skills, prompt templates, and packages on every run
(e.g. `context-mode`, `pi-mcp-extension`). A consulted pi can defer to one of those tools instead of
reasoning, or loop on one. For a pure-analysis consult, the `--tools read,grep,find,ls,bash`
allowlist above already excludes extension tools. If you keep the full tool set instead, add
`--no-extensions --no-skills --no-prompt-templates` to the command, or tell pi in the prompt to
"answer directly from your own knowledge, do not call any tools." The `timeout` wrapper bounds any
stall regardless.

## Write tasks need no special permission flag

Unlike OpenCode, **pi print mode never shows a permission or trust prompt** — `-p`, `--mode json`,
and `--mode rpc` run tools with the full permissions of the pi process and no built-in sandbox. So a
write-capable task is simply a bare `pi -p` (all tools enabled); there is no
`--dangerously-skip-permissions` equivalent to add:

```bash
timeout 600 pi -p "Apply the refactor to src/x.ts and run the tests."
# read-only investigation instead:
timeout 600 pi -p --tools read,grep,find,ls,bash "Diagnose why src/x.ts leaks memory; do not edit."
```

**Project trust.** In a repo with `.pi/` or `.agents/skills` resources, non-interactive mode skips
them unless there is a saved trust decision. Add `--approve` (alias `-a`) to load project resources
for the run, or `--no-approve` (`-na`) to explicitly ignore them. `AGENTS.md`/`CLAUDE.md` context
files load regardless, unless you pass `--no-context-files`.

```bash
pi -p --approve "Fix the bug using the project's own conventions and tooling."   # load project resources
pi -p --no-approve --no-context-files "Review this file fresh, ignoring repo conventions."  # clean slate
```

## Capturing output verbatim

In default text print mode, pi writes the assistant's **final answer to stdout** and all
startup/extension/tool noise to stderr — so `pi -p "<prompt>"` stdout is relay-ready as-is. Always
discard stderr when capturing, or it pollutes the answer:

```bash
pi -p "<prompt>" 2>/dev/null                 # stdout = the answer; relay verbatim
pi --mode json "<prompt>" 2>/dev/null        # structured JSONL events for programmatic capture
```

For machine-readable results, `--mode json` emits one JSON object per line (`message_end` carries the
final assistant message; `agent_end` the full message list):

```bash
pi --mode json "List the files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```

## Quick reference

| Need | Command |
|---|---|
| Confirm the user's default model | `grep -E '"(defaultProvider\|defaultModel\|defaultThinkingLevel)":' ~/.pi/agent/settings.json` |
| List valid `provider/model` ids (to ask the user) | `pi --list-models` |
| One-off headless consult (default model) | `pi -p "<prompt>"` |
| Attach file(s) | `pi -p "<prompt>" @path` |
| Read-only review/analysis (clean, no stall) | `pi -p --tools read,grep,find,ls,bash "<prompt>"` |
| Hard read-only (no shell) | `pi -p --tools read,grep,find,ls "<prompt>"` |
| Machine-readable output | `pi --mode json "<prompt>"` |
| Let pi write/edit (no extra flag needed in `-p`) | `pi -p "<prompt>"` |
| Load project `.pi`/`.agents` resources | add `--approve` |
| Ignore project + context files (clean slate) | add `--no-approve --no-context-files` |
| Chain calls sharing history | `pi -p --continue "<follow-up>"` (see references/pi-cli.md) |
| Override model (only if user asked) | `pi -p --model <p/m> "<prompt>"` (id must be in `pi --list-models`) |

For the full flag table, JSON event mode, session chaining (`--continue`/`--session`), model-selection
notes, troubleshooting, and an optional reusable subagent definition, read
`references/pi-cli.md`.

## Common mistakes

- **Overriding the user's model** → don't pass `--model`/`--provider` by default; bare `pi -p` uses their configured default. Confirm it from `~/.pi/agent/settings.json`; if you want a different one, ask the user — never pick one yourself.
- **Switching provider/plan** → `zai-coding-plan/*` and a standard `zai/*` provider bill differently. Use the exact provider id the user configured; don't substitute it for the "same" model.
- **Running bare `pi`** → it opens the TUI and looks hung; always use `pi -p` (or `--mode json`/`--mode rpc`) for delegation.
- **Unquoted prompt** → the shell splits it; pi sees only the first word. Quote the whole prompt.
- **Assuming `-p` is read-only** → it is not. Print mode runs all tools with full permissions and never prompts. Restrict with `--tools read,grep,find,ls[,bash]` for a read-only pass; never assume "don't edit" in the prompt is enough on its own.
- **Writing in a "review" task** → use the read-only tool allowlist; a bare `pi -p` can and will edit files.
- **Capturing stderr with the answer** → extension/startup warnings (e.g. `[context-mode] …`) go to stderr; capture with `2>/dev/null` or you relay noise as the answer.
- **Consult stalls on an extension/MCP tool** → pi auto-loads extensions/skills/packages. For pure analysis, use the `--tools read,grep,find,ls,bash` allowlist (excludes extension tools) or pass `--no-extensions --no-skills --no-prompt-templates`; always wrap runs in `timeout`.
- **`--model` id rejected** → it must appear in `pi --list-models` for the current environment. Omit `--model` to use the configured default, or pass a listed id.
- **Trusting pi's factual claims** → a consulted model can be confidently wrong (e.g. insisting a real CLI flag is "hallucinated"). Verify any CLI/factual claim it makes against `pi --help` before acting on it.

## Workflow

1. First delegation of the session → `grep -E '"(defaultProvider|defaultModel|defaultThinkingLevel)":' ~/.pi/agent/settings.json` to confirm the user's default model. If there is no settings file and no default, run `pi --list-models` and **ask the user** which `provider/model` to use — don't pick one, and never swap to a different provider/plan (billing differs).
2. Build a single, self-contained prompt (name the exact file/function; state read-only or write intent). For pure-analysis consults, restrict tools (`--tools read,grep,find,ls,bash`) or add `--no-extensions --no-skills --no-prompt-templates` so pi reasons directly instead of looping on a configured extension.
3. Run `pi -p "<prompt>" [@file]` (no `--model` → inherits the user's default), capturing stdout with `2>/dev/null`, wrapped in `timeout`. Pass `--model <provider/model>` only if the user explicitly asked for a specific model.
4. Relay pi's stdout to the user verbatim. For several related calls in one train of thought, chain them with `--continue`/`--session` (see `references/pi-cli.md`).
