# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/yamlcrew/skills/compare/v1.0.0...HEAD)

### Added

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