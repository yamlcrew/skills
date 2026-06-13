---
name: opencode-agent-cc
description: >-
  Use when you want a second opinion, an alternative-model perspective, or to offload a
  code review, analysis, or explanation task to the OpenCode CLI (`opencode`) from inside
  Claude Code. Also use when an `opencode run` invocation hangs, returns no output, fails to
  pick a model, or you are unsure which provider/model OpenCode has configured. Triggers:
  "ask opencode", "second opinion", "delegate to opencode", "consult another model",
  "opencode run hangs".
---

# Delegating to OpenCode from Claude Code

Run the standalone **OpenCode** CLI (`opencode`) headless from a `Bash` tool call to get a second
take on a task — then relay its output. This approach uses whatever provider OpenCode is already
authenticated with, no OAuth required.

## The one rule: use the model the user already configured

**Respect the user's default. Never pick or override the model yourself.** The user has a
configured default provider+model (the one their `opencode` TUI uses) — delegations must run on
*exactly* that provider and model, not one you chose.

By default, **do not pass `--model` at all** — bare `opencode run` uses the configured default, so
parity is guaranteed by construction. Before the first delegation, confirm what that default is
(secret-safe — prints only the model fields, never API keys):

```bash
opencode debug config 2>/dev/null | grep -E '"(model|small_model)":'
# e.g. "model": "zai-coding-plan/glm-5.1"   ← the provider+model every run will use
```

- **A `model` is shown** → run `opencode run` with **no** `--model`; it uses that exact default.
- **No `model` configured** → do **not** guess. Run `opencode models`, show the user the list, and
  **ask which `provider/model` to use.**
- **User explicitly asked for a specific/different model** → only then pass `--model <provider/model>`,
  and only an id that appears in `opencode models`.

### ⚠️ Provider/plan affects billing — never swap it

The same model can be served by different providers/plans that are billed differently — e.g.
`zai-coding-plan/*` (Z.AI **Coding Plan** subscription) vs a standard `zai/*` pay-per-token API
provider. They are *not* interchangeable. Use the **exact provider id** from the user's config;
never substitute a different provider or plan for the "same" model, or you silently move spend onto
a different billing path.

## Core pattern — read-only consultation

`run` is the headless subcommand (bare `opencode` launches an interactive TUI that will appear to
hang). Pass the prompt as a single quoted argument — **no `--model`**, so it runs on the user's
configured default:

```bash
opencode run "Review the function processOrder in \
src/orders/process.ts for race conditions. Verdict, then each issue with line numbers \
and a fix. Do not modify files."
```

Attach files natively with `-f/--file` instead of `cat | …`. **Put the quoted prompt before `-f`** —
`-f` is a greedy array flag and will swallow a trailing prompt as a filename:

```bash
opencode run "Find potential deadlocks in this file." -f src/worker.ts
```

Wrap automation-style calls in `timeout` so a stuck call can never block indefinitely:

```bash
timeout 300 opencode run "…"
```

## Write tasks hang without this flag

OpenCode ships built-in agents (see `opencode agent list`): **`plan`** is read-only and **`build`**
is write-capable. A read-only task (review, analysis, explanation) needs nothing special — use
`--agent plan`. A task that asks OpenCode to **edit files or run commands** uses `--agent build`, but
will block on an interactive permission prompt that never arrives headless, so authorize up front:

```bash
opencode run --agent build --dangerously-skip-permissions "Apply the refactor to src/x.ts"
# read-only investigation instead:
opencode run --agent plan "Diagnose why src/x.ts leaks memory; do not edit."
```

`--dangerously-skip-permissions` auto-approves everything not explicitly denied — use it only for
tasks you intend to be write-capable. A custom `--agent <name>` with fixed permissions is a scoped alternative.

## Quick reference

| Need | Command |
|---|---|
| Confirm the user's default model | `opencode debug config 2>/dev/null \| grep -E '"(model\|small_model)":'` |
| List valid `provider/model` ids (to ask the user) | `opencode models` |
| One-off headless consult (default model) | `opencode run "<prompt>"` |
| Attach file(s) | `opencode run "<prompt>" -f path` (prompt before `-f`) |
| Machine-readable output | `opencode run --format json "<prompt>"` |
| Read-only review / analysis | `opencode run --agent plan "<prompt>"` |
| Let OpenCode write/edit | `opencode run --agent build --dangerously-skip-permissions "<prompt>"` |
| Many calls in one session | start `opencode serve`, then `opencode run --attach <url> "…"` |
| Override model (only if user asked) | `opencode run --model <p/m> "<prompt>"` (id must be in `opencode models`) |

For the full flag table, headless-server (`serve`/`--attach`) mode, model-selection notes,
troubleshooting, and an optional reusable subagent definition, read
`references/opencode-cli.md`.

## Common mistakes

- **Overriding the user's model** → don't pass `--model` by default; bare `opencode run` uses their configured default. Confirm it with `opencode debug config | grep model`; if none is set, ask the user — never pick one.
- **Switching provider/plan** → `zai-coding-plan/*` and a standard `zai/*` provider bill differently. Use the exact provider id the user configured; don't substitute it for the "same" model.
- **Running bare `opencode`** → it opens the TUI and looks hung; always use `opencode run`.
- **Unquoted prompt** → the shell splits it; OpenCode sees only the first word. Quote the whole prompt.
- **Write task hangs** → add `--dangerously-skip-permissions` or use `--agent`; the prompt saying "don't edit" is not a substitute for read-only intent on write tasks.
- **`-f/--file` swallows the prompt** → `-f` is greedy; with `-f file "<prompt>"` the prompt is parsed as a filename (`Error: File not found: …`). Put the quoted prompt **before** `-f`: `run "<prompt>" -f file`.
- **Relative file path resolves wrong** → run from the repo root or pass absolute paths / `--dir`.
- **Confusing `opencode` with the unrelated PyPI package** → confirm with `opencode --version`.
- **Trusting OpenCode's factual claims** → a consulted model can be confidently wrong (e.g. insisting a real CLI flag is "hallucinated"). Verify any CLI/factual claim it makes against `opencode --help` before acting on it.
- **Run loops/stalls on an MCP tool** → OpenCode auto-loads configured MCP servers and may defer to one instead of answering. For pure-analysis consults, tell it to "answer directly from your own knowledge, do not call any tools"; the `timeout` wrapper bounds the stall.

## Workflow

1. First delegation of the session → `opencode debug config 2>/dev/null | grep -E '"(model|small_model)":'` to confirm the user's default model. If none is configured, run `opencode models` and **ask the user** which `provider/model` to use — don't pick one. Never swap to a different provider/plan (billing differs).
2. Build a single, self-contained prompt (name the exact file/function; state read-only or write intent). For pure-analysis consults, add "answer directly, do not call any tools" so OpenCode doesn't loop on a configured MCP server.
3. Run `opencode run "<prompt>" [-f file] [--dangerously-skip-permissions]` (no `--model` → inherits the user's default), wrapped in `timeout` (prompt before `-f`). Pass `--model` only if the user explicitly asked for a specific model.
4. Relay OpenCode's output to the user. For several calls in one session, see the `serve`/`--attach` section in `references/opencode-cli.md`.
