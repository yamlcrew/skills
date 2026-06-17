# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/yamlcrew/skills/compare/v1.0.0...HEAD)

### Added

- **lazy-senior-dev** plugin — "lazy senior dev" mode that forces the simplest, shortest solution that works (YAGNI → stdlib → native → installed dep → one line → minimum). A command-and-subagent rework of the upstream [ponytail](https://github.com/DietrichGebert/ponytail) skill by Dietrich Gebert (MIT), with **no always-on session hooks** — it activates on the `/lazy-senior-dev:*` commands or when its skill description matches. Includes:
  - A single `lazy-senior-dev` skill: a `SKILL.md` router (the ladder, rules, intensity, safety boundaries, mode-routing table) plus `references/` — `review.md`, `audit.md`, `debt.md`, and `examples.md` (seven before/after worked examples: date picker, sorting, email validation, caching, API endpoint, local UI state vs Redux, retry vs circuit-breaker). Four modes: build (`lite`/`full`/`ultra`), diff review, whole-repo audit, and `lsd:` debt ledger.
  - `lazy-senior-dev` subagent — dispatched by the commands; loads and follows the one skill and runs only the named mode. In review/audit/debt modes it is read-only (must not `Write`/`Edit`/mutate), so the report-only guarantee holds at the tool level, not just in prose.
  - Slash commands: `lazy` (run a task at intensity `lite`/`full`/`ultra`), `review` (diff over-engineering review), `audit` (whole-repo audit), `debt` (`lsd:` ledger) — all delegating to the subagent via `Task` — plus `help` (one-shot reference card, no dispatch). All `disable-model-invocation: true`.
  - The deliberate-shortcut comment marker is `lsd:` (renamed from upstream `ponytail:`); the `debt` scan covers `#`/`//`/`<!--`/`--`/`;` comment prefixes. The always-on/statusline/config framing from upstream was dropped since there are no hooks.
- **zensical-writer** plugin — senior technical-writer/engineer skill for [Zensical](https://zensical.org), the static site generator by the Material for MkDocs team. Routing `SKILL.md` plus eight reference docs:
  - `references/getting-started.md` — install (pip/uv/conda/Docker), `zensical new`/`serve`/`build`, project scaffold, GitHub/GitLab Pages CI, upgrade.
  - `references/configuration.md` — `zensical.toml` (`[project]`, `[project.theme]`, `nav`, `extra_css`/`extra_javascript`, the `zensical new` default `markdown_extensions` set, and the `validation`/`plugins`/`extra` scopes) with `mkdocs.yml` equivalents.
  - `references/authoring.md` — Python-Markdown authoring: front matter, admonitions, content tabs, code blocks, buttons, grids, Mermaid diagrams, math, data tables, formatting, icons/emojis, images, lists, tooltips, footnotes — and the extension each requires.
  - `references/extensions.md` — Zensical-native extensions (Macros, GLightbox), the mkdocstrings plugin, and the full Python Markdown / `pymdownx.*` catalog with options.
  - `references/setup.md` — colors (scheme/primary/accent/toggle/custom), fonts, link validation / strict mode, tags, search, social cards, and the remaining Setup topics.
  - `references/cli.md` — `new`/`build`/`serve` flags, config-file detection order, and the MkDocs CLI commands/flags Zensical drops.
  - `references/migration-and-compatibility.md` — MkDocs/Material migration, modern vs classic theme, plugin tiers → native modules, settings not yet supported, Alpha status (v0.0.45, Python ≥ 3.10).
  - `references/theme-and-customization.md` — theme variant, navigation/feature flags, `document$` observable, MiniJinja template overrides, theme packaging.
- CI workflow `.github/workflows/skill-scan.yml` — runs [Snyk Agent Scan](https://github.com/snyk/agent-scan) (`uvx snyk-agent-scan@latest --skills skills`) on the published `skills/` content. Report-only (never fails CI); writes findings to the job summary and uploads them as an artifact. Requires a `SNYK_TOKEN` repository secret; skips gracefully when absent.
- **pi-agent-cc** plugin — delegate to the headless pi CLI (`pi -p`) from Claude Code, respecting the user's configured provider and model. The pi analog of `opencode-agent-cc`. Includes:
  - `pi-agent-cc` skill (with `references/pi-cli.md`) — how to drive `pi -p` headless, enforce read-only via a `--tools read,grep,find,ls,bash` allowlist vs write-capable bare `pi -p` (print mode never prompts, no sandbox), and never override the user's default model/plan.
  - `pi-rescue` subagent — write-capable thin forwarder that hands a task to `pi -p` and returns its output verbatim.
  - Slash commands: `review`, `adversarial-review` (read-only, via the tool allowlist), `rescue` (write-capable), `status`, and `cancel`.
  - `scripts/pi-info.mjs` — secret-safe Node detector reporting the pi binary, version, configured default provider/model/thinking level, packages/extensions/skills, available models, and live headless pi processes.
  - `prompts/adversarial-review.md` and `prompts/rescue.md` — portable prompt templates.
- **opencode-agent-cc** plugin — delegate to the headless OpenCode CLI from Claude Code, respecting the user's configured provider and model. Includes:
  - `opencode-agent-cc` skill (with `references/opencode-cli.md`) — how to drive `opencode run` headless, choose the read-only `plan` vs write `build` agent, and never override the user's default model/plan.
  - `opencode-rescue` subagent — write-capable thin forwarder that hands a task to `opencode run` and returns its output verbatim.
  - Slash commands: `review`, `adversarial-review` (read-only, via the `plan` agent), `rescue` (write-capable), `status`, and `cancel`.
  - `scripts/opencode-info.mjs` — secret-safe Node detector reporting opencode location, version, paths, configured default model, providers (baseURL only), models, and MCP servers.
  - `prompts/adversarial-review.md` and `prompts/rescue.md` — portable prompt templates.

### Fixed

- **opencode-agent-cc** skill — removed an invisible `U+FE0F` (emoji variation selector) from the `⚠️` heading in `SKILL.md`, which Snyk Agent Scan flagged as W021 (hidden/invisible Unicode). The heading now uses a plain `⚠`.

## [1.0.0](https://github.com/yamlcrew/skills/releases/tag/v1.0.0) - 2026-06-11

### Added

- Initial release of the **yamlcrew** Claude Code plugin marketplace, also published to the [skills.sh](https://skills.sh) registry.
- **fumadocs-engineer** plugin — senior-engineer skill for the Fumadocs (Next.js) documentation framework, with reference docs covering UI components, MDX authoring, project setup, search, CLI, and framework integrations.
- `plugins2skills.py` — sync script that generates the committed root `skills/` mirror from `plugins/`.
- Authoring guides: `plugins.md` (plugin/manifest format) and `skills.md` (SKILL.md format).
- `skills.sh.json` — skills.sh repo-page grouping configuration.
- `AGENTS.md` — guidance for Agents working in this repository.