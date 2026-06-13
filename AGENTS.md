# [AGENTS.md](http://CLAUDE.md)

## What this repository is

A **distribution repository for agent skills**, published in two formats from a single source:

1. **Claude Code plugin marketplace** — consumed via `/plugin marketplace add yamlcrew/skills`. Driven by `.claude-plugin/marketplace.json`.
2. **skills.sh registry** — consumed via `npx skills add yamlcrew/skills`, which reads `skills/<name>/SKILL.md` from the repo root. Compatible with 50+ agents (Cursor, Codex, OpenCode, Gemini CLI, Copilot, …).

There is no application code, build step, or test suite. The "code" is the skill content (Markdown) and one Python sync script.

## Core architecture: source → generated

The single most important thing to understand is the one-way sync relationship:

```
plugins/<plugin-name>/skills/<skill-name>/   ← SOURCE OF TRUTH (edit here)
            │  python plugins2skills.py
            ▼
skills/<skill-name>/                          ← GENERATED MIRROR (do not hand-edit)
```

- `plugins/<plugin-name>/` is a self-contained Claude Code plugin: a `.claude-plugin/plugin.json` manifest plus a `skills/<skill-name>/` directory (each skill = a `SKILL.md` with optional `references/`, `templates/`, `scripts/`).
- `plugins2skills.py` discovers every `plugins/*/skills/*/SKILL.md`, copies each skill directory verbatim into a **flat** `skills/<skill-name>/` at the repo root, and removes orphaned `skills/` directories whose source no longer exists. Note the flattening: the plugin grouping is dropped, so **skill directory names must be globally unique across all plugins.**
- `marketplace.json` (`plugins[]`) is maintained **by hand** — the sync script does not touch it. Adding a plugin requires editing it manually.

### `skills/` is a committed build artifact

`skills/` IS tracked in git and must NOT be gitignored — skills.sh fetches it from the GitHub repo root, so it must be committed. After changing anything under `plugins/`, regenerate and commit `skills/` in the same change, or the skills.sh feed goes stale.

### `skills.sh.json` — skills.sh repo page

`skills.sh.json` at the repo root configures how skills.sh renders this repo's page, grouping skills into labelled sections. Schema: <https://skills.sh/schemas/skills.sh.schema.json>. Required key is `groupings[]` (each: `title`, optional `description`, and `skills[]` — a list of skill `name`s that must match generated `skills/<name>/` directories); `notGrouped` (`"top"` | `"bottom"`, default `"bottom"`) places any skill not listed in a grouping. **Every skill must be listed in exactly one grouping** — when adding/renaming/removing a skill, update this file and verify each name resolves to a real skill. **Reuse an existing grouping**; do not add a new grouping unless none genuinely fits — think hard before creating one (a sprawl of one-skill groups makes the page worse). **If you're unsure which group fits, don't decide alone** — ask the user: name the 3 best-fitting existing groups (in your judgement) and ask whether to use one of them or create a new group.

## Commands

```bash
python plugins2skills.py            # regenerate skills/ from plugins/
python plugins2skills.py --dry-run  # preview the sync (no writes)
```

Validation is manual: ensure `plugin.json` and `marketplace.json` are valid JSON, and that every `SKILL.md` has `name` + `description` frontmatter.

## CI

`.github/workflows/skill-scan.yml` runs [Snyk Agent Scan](https://github.com/snyk/agent-scan) over the published `skills/` directory — the same scanner behind the skills.sh `/security/snyk` findings. It is **report-only** (never fails CI): results go to the job summary and an artifact. Needs a `SNYK_TOKEN` repository secret; without it the job skips. This is the only CI; there is still no build step or test suite.

## Adding or editing a plugin

1. Create/edit under `plugins/<plugin-name>/` (`.claude-plugin/plugin.json` + `skills/<skill-name>/SKILL.md`).
2. Register/update the entry in `.claude-plugin/marketplace.json` → `plugins[]` (manual).
3. Run `python plugins2skills.py` to regenerate `skills/`.
4. Add the skill's `name` to the best-fitting grouping in `skills.sh.json` (reuse an existing group; only add a new grouping as a last resort).
5. Add the plugin to the table in `plugins-list.md`.
6. Record the change in `CHANGELOG.md` under `## [Unreleased]` — **every plugin change is logged here, and the file must follow [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)** (sections `Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`; full template in `plugins.md`). On release, rename `[Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and bump `version` (SemVer `MAJOR.MINOR.PATCH`) in both manifests.
7. Commit `plugins/`, `marketplace.json`, `skills.sh.json`, `CHANGELOG.md`, and the regenerated `skills/` together.

## Conventions

- `description` **must be identical in both manifests** for a plugin: `marketplace.json` → `plugins[].description` and `plugins/<name>/.claude-plugin/plugin.json` → `description`. Keep it one short, concrete, unambiguous sentence stating what the plugin *is* — not marketing copy. This is distinct from a `SKILL.md` `description`, which is a *trigger* (when to load the skill). See `plugins.md` / `skills.md`.
- **Set frontmatter** `name` **in every** `SKILL.md`**.** Without it, marketplace installs fall back to a version-hash directory name that changes on every update.
- **Set** `version` **in** `plugin.json`**.** Without it, every commit SHA is treated as a new version by the marketplace.
- Authoring guides live in `plugins.md` (plugin format, manifests, hooks, MCP, marketplace) and `skills.md` (SKILL.md format, references, skills.sh). Read the relevant one before designing new structure.