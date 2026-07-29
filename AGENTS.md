# [AGENTS.md](http://CLAUDE.md)

## What this repository is

A **distribution repository for agent skills**, published in two formats from one directory:

1. **Claude Code plugin marketplace** — consumed via `/plugin marketplace add yamlcrew/skills`. Driven by `.claude-plugin/marketplace.json`.
2. **skills.sh registry** — consumed via `npx skills add yamlcrew/skills`, which reads `skills/<name>/SKILL.md` from the repo root. Compatible with 50+ agents (Cursor, Codex, OpenCode, Gemini CLI, Copilot, …).

There is no application code, build step, or test suite. The "code" is the skill content (Markdown) plus a few helper scripts shipped inside individual skills.

## Core architecture: one directory serves both channels

`skills/<name>/` is simultaneously **the skill directory** (what skills.sh publishes) and **the plugin root** (what the Claude Code marketplace installs). There is no `plugins/` tree and no sync step — edit in place.

```
skills/<name>/
├── .claude-plugin/
│   └── plugin.json      ← plugin manifest (makes this dir a Claude Code plugin)
├── SKILL.md             ← in the plugin root → loaded as the plugin's skill
├── references/*.md
├── scripts/             ← optional
├── commands/            ← optional, Claude Code only
├── agents/              ← optional, Claude Code only
└── prompts/             ← optional
```

Why this works on both sides:

- **skills.sh** scans `skills/` one level deep, so `skills/<name>/SKILL.md` is found natively.
- **Claude Code** resolves the marketplace entry's `"source": "./skills/<name>"` as the plugin root. A plugin with no `skills/` subdirectory and no `skills` field in its manifest loads the root `SKILL.md` as its single skill; `commands/`, `agents/` and `hooks/` sit exactly where the loader expects them.

This is a **one-plugin-one-skill** repo, and the collapse relies on it: the skill directory name is also the plugin name and the marketplace entry name. Introducing a plugin with two skills would not fit this layout — raise it before trying.

### Everything under `skills/<name>/` is published

Both channels ship the **entire** directory, not just `SKILL.md` and `references/`. A verified `npx skills add` install writes `scripts/`, `commands/`, `agents/`, `prompts/` and `.claude-plugin/plugin.json` to disk alongside the skill. So:

- `commands/` and `agents/` are Claude-Code-specific formats that other agents receive as inert files. That is acceptable noise, not an error — but do not put anything private, large, or secret under a skill directory.
- Because `plugin.json` travels with the skill, Claude Code also auto-detects a skills.sh install under `~/.claude/skills/<name>/` as a local plugin `<name>@skills-dir`, with no marketplace step. Installing the same plugin from the marketplace takes precedence and auto-disables the `@skills-dir` copy, so there is no double-load.

### `skills.sh.json` — skills.sh repo page

`skills.sh.json` at the repo root configures how skills.sh renders this repo's page, grouping skills into labelled sections. Schema: <https://skills.sh/schemas/skills.sh.schema.json>. Required key is `groupings[]` (each: `title`, optional `description`, and `skills[]` — a list of skill `name`s that must match `skills/<name>/` directories); `notGrouped` (`"top"` | `"bottom"`, default `"bottom"`) places any skill not listed in a grouping. **Every skill must be listed in exactly one grouping** — when adding/renaming/removing a skill, update this file and verify each name resolves to a real skill (CI enforces this). **Reuse an existing grouping**; do not add a new grouping unless none genuinely fits — think hard before creating one (a sprawl of one-skill groups makes the page worse). **If you're unsure which group fits, don't decide alone** — ask the user: name the 3 best-fitting existing groups (in your judgement) and ask whether to use one of them or create a new group.

## Commands

There is no build or sync step. To validate locally what CI checks:

```bash
claude plugin validate .                  # marketplace manifest
for d in skills/*/; do claude plugin validate "./$d"; done
npx skills add . --list                   # must report one skill per skills/<name>/ directory
```

Do **not** add `--strict`: see the versioning convention below.

## CI

Two workflows, both gating:

- **`.github/workflows/validate.yml`** — runs `claude plugin validate` (non-strict) over the marketplace and every plugin root, asserts that skills.sh discovers exactly as many skills as there are `skills/<name>/` directories, and checks the `skills.sh.json` groupings. The discovery-count assertion is the important one: **a `SKILL.md` missing its frontmatter `description` is silently dropped by skills.sh and `claude plugin validate` does not flag it, not even with `--strict`.**
- **`.github/workflows/skill-scan.yml`** — runs [Snyk Agent Scan](https://github.com/snyk/agent-scan) over `skills/`, the same scanner behind the skills.sh `/security/snyk` findings. Only error-class findings fail CI — codes starting with `E` (analysis errors) or `X` (scan/runtime failures). Warnings (`W*`) are reported but never fail the build. Because the scanner is LLM-based and non-deterministic (the same content can flag a finding on one run and pass clean on the next), the workflow scans `RUNS` times (default 3) and `.github/scripts/scan_summary.py` fails the job only on **repeatable** errors — those seen in a majority of runs (e.g. ≥2/3); one-off flaky findings are reported but do not fail. The full report goes to the job summary and an artifact. Needs a `SNYK_TOKEN` repository secret; without it the job skips.

There is still no build step or test suite.

## Adding or editing a skill

1. Create/edit `skills/<name>/` — `.claude-plugin/plugin.json` plus `SKILL.md` in the same directory.
2. Register/update the entry in `.claude-plugin/marketplace.json` → `plugins[]` (manual; nothing generates it). Set `"source": "./skills/<name>"`.
3. Add the skill's `name` to the best-fitting grouping in `skills.sh.json` (reuse an existing group; only add a new grouping as a last resort).
4. Add the skill to the table in `plugins-list.md`.
5. Record the change in `CHANGELOG.md` under `## [Unreleased]` — **every change is logged here, and the file must follow [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)** (sections `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`; full template in `plugins.md`).
6. Commit `skills/`, `marketplace.json`, `skills.sh.json` and `CHANGELOG.md` together.

## Conventions

- `description` **must be identical in both manifests** for a plugin: `marketplace.json` → `plugins[].description` and `skills/<name>/.claude-plugin/plugin.json` → `description`. Keep it one short, concrete, unambiguous sentence stating what the plugin *is* — not marketing copy. This is distinct from a `SKILL.md` `description`, which is a *trigger* (when to load the skill). See `plugins.md` / `skills.md`.
- **Set frontmatter `name` and `description` in every `SKILL.md`.** Without `name`, marketplace installs fall back to a version-hash directory name that changes on every update. Without `description`, skills.sh drops the skill from the registry entirely — silently.
- **Do not set `version` in `plugin.json`, and do not put `version` in marketplace entries.** The commit SHA is the version, so every push reaches installed users. This is deliberate: Claude Code caches by version string, so a hand-maintained `version` that nobody bumps freezes every installed user on the first release — which is exactly what happened here across 26 commits with all 8 plugins pinned to `1.0.0`. The documented tradeoff is that an explicit version suits "published plugins with stable release cycles" while a commit SHA suits "plugins under active development"; this repo is the latter, and its content is reference documentation with no API surface to version. `CHANGELOG.md` remains the human-readable record of what changed — it is documentation, not the distribution mechanism. Consequence: `claude plugin validate` emits one `No version specified` warning per plugin, so CI runs it **without** `--strict`.
- Reference scripts from `SKILL.md` via `${CLAUDE_PLUGIN_ROOT}/scripts/…`, never a bare `scripts/…` (which resolves against the user's working directory, not the skill). Note in the skill that agents without that variable should use the path relative to the skill directory.
- Authoring guides live in `plugins.md` (plugin format, manifests, hooks, MCP, marketplace) and `skills.md` (SKILL.md format, references, skills.sh). Read the relevant one before designing new structure.
