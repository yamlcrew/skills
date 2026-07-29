# Plugins — How-To Guide

> **Plugin roots in this repo**: `skills/<plugin-name>/` — each one is both a plugin root and a skills.sh skill directory
> **Reference**: [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)

A plugin is a self-contained directory that extends Claude Code with custom functionality. Plugins bundle skills, agents, hooks, MCP servers, and scripts into a single distributable unit. This guide covers the Claude Code plugin format and how to create plugins for this repository.

---

## Plugin directory structure

```
plugin-name/                          # Plugin root = one directory
├── .claude-plugin/
│   └── plugin.json                   # Manifest (optional but recommended)
├── agents/                           # Subagents (optional)
│   └── reviewer.md
├── commands/                         # Slash commands as .md files (optional)
│   └── deploy.md
├── hooks/
│   └── hooks.json                    # Event handlers (optional)
├── skills/                           # Skills — subdirectories with SKILL.md
│   └── skill-name/
│       ├── SKILL.md
│       ├── references/
│       ├── templates/
│       └── scripts/
├── scripts/                          # Helper scripts (optional)
│   └── format-code.sh
├── .mcp.json                         # MCP server configuration (optional)
├── .lsp.json                         # LSP server configuration (optional)
└── README.md
```

## `.claude-plugin/plugin.json` — Manifest

The manifest defines the plugin's identity. It's optional (Claude Code auto-discovers components by directory structure), but **strongly recommended** for marketplace distribution.

```json
{
  "name": "my-plugin",
  "description": "What this plugin does — shown in the plugin manager",
  "author": {
    "name": "Your Name",
    "url": "https://github.com/your-handle"
  },
  "homepage": "https://github.com/your-handle/your-repo",
  "repository": "https://github.com/your-handle/your-repo",
  "license": "MIT"
}
```

### Fields

| Field | Required | Purpose |
|---|---|---|
| `name` | **Yes** | Unique identifier and skill namespace. Skills are prefixed: `/my-plugin:skill-name` |
| `description` | **Yes** | Shown in plugin manager when browsing or installing |
| `version` | Optional | Format allows it: if set, users only get updates when you bump this field; if omitted, every git commit counts as a new version. **This repo omits it deliberately** — see [Version management](#version-management) |
| `author` | Optional | Attribution |
| `homepage` | Optional | Link to project page |
| `repository` | Optional | Link to source repo |
| `license` | Optional | SPDX license identifier |

> **Keep `description` identical and unambiguous across both manifests.** The same text must appear in two places: `.claude-plugin/marketplace.json` → `plugins[].description` and `skills/<plugin-name>/.claude-plugin/plugin.json` → `description`. Write one short, concrete sentence that leaves no doubt what the plugin *is* — not marketing copy. When you change one, change the other.

### Version management

- **With `version`**: Claude Code caches by version string, so users receive updates only when you bump it — suited to published plugins with stable release cycles
- **Without `version`**: every commit SHA is treated as a new version, so every push reaches installed users — suited to plugins under active development
- **This repo sets no `version`**, neither in `plugin.json` nor in marketplace entries. A hand-maintained version that nobody bumps freezes installed users on the first release — which is what happened here, 26 commits with all 8 plugins pinned to `1.0.0`. These plugins are reference documentation under active development, with no API surface to version
- The top-level `version` in `.claude-plugin/marketplace.json` is the **marketplace** version, a different thing — that one stays
- Consequence: `claude plugin validate` reports one `No version specified` warning per plugin, so CI runs it **without** `--strict`

## Components

### Skills (`skills/`)

Skills are the primary way to add capabilities. Each skill is a subdirectory with `SKILL.md`:

```
skills/
├── code-reviewer/
│   └── SKILL.md
└── fumadocs-engineer/
    ├── SKILL.md
    ├── references/
    │   └── components.md
    └── scripts/
        └── validate.sh
```

If the plugin has **no `skills/` directory** and no `skills` field in its manifest, a lone `SKILL.md` at the plugin root is loaded as a single skill. **That is the mechanism every plugin in this repo relies on** — see [How this repo is organized](#how-this-repo-is-organized). Set frontmatter `name` to control the invocation name — without it, Claude Code falls back to the install directory name (which is a version hash for marketplace plugins and changes on every update).

See [skills.md](./skills.md) for the full skill authoring guide.

### Agents (`agents/`)

Subagents are specialized workers Claude can invoke automatically:

```
agents/
└── reviewer.md
```

```markdown
---
name: reviewer
description: Reviews code for quality, security, and performance issues
model: sonnet
effort: medium
maxTurns: 20
disallowedTools: Write, Edit
---

You are a senior code reviewer. Analyze the provided code and...
```

**Supported frontmatter fields**: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation` (only `"worktree"` value).

**Security restrictions**: `hooks`, `mcpServers`, and `permissionMode` are **not allowed** in plugin agents.

### Commands (`commands/`)

Slash commands are simple markdown files. Each file creates a `/command-name` shortcut:

```
commands/
└── deploy.md
```

```markdown
---
description: Deploy the current branch to staging
---

Deploy the current branch to the staging environment:
1. Run all tests with `npm test`
2. Build the project with `npm run build`
3. Deploy using `npm run deploy:staging`
```

Commands and skills produce the same result (`/name` invocation). Skills are preferred because they support directories with supporting files, frontmatter for invocation control, and auto-loading by Claude.

### Hooks (`hooks/hooks.json`)

Event handlers that run automatically on Claude Code lifecycle events:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh"
      }]
    }]
  }
}
```

**Available events**:

| Event | When it fires |
|---|---|
| `SessionStart` | Session begins or resumes |
| `Setup` | `--init-only` / `--init` / `--maintenance` mode |
| `UserPromptSubmit` | User submits a prompt (before processing) |
| `PreToolUse` | Before a tool call executes (can block) |
| `PostToolUse` | After a tool call completes |
| `Stop` | Claude stops generating |
| `SubagentStop` | A subagent stops |
| `SessionEnd` | Session ends |
| `Notification` | A notification is sent |
| `PreCompact` | Before context compaction |

**Hook types**: `command`, `http`, `mcp_tool`, `prompt`, `agent`

**Variable**: `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's installation directory.

### MCP Servers (`.mcp.json`)

MCP servers start automatically when the plugin is enabled and appear as standard MCP tools:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["\"${CLAUDE_PLUGIN_ROOT}\"/scripts/server.js"]
    }
  }
}
```

### LSP Servers (`.lsp.json`)

Code intelligence servers for language-specific features:

```json
{
  "servers": {
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"]
    }
  }
}
```

## Marketplace distribution

### Marketplace registry (`.claude-plugin/marketplace.json`)

A marketplace is a GitHub repo with a `.claude-plugin/marketplace.json` that lists available plugins:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-marketplace.json",
  "name": "my-marketplace",
  "version": "1.0.0",
  "description": "Description of the marketplace",
  "owner": {
    "name": "Your Name",
    "url": "https://github.com/your-handle"
  },
  "plugins": [
    {
      "name": "plugin-name",
      "description": "What this plugin does",
      "author": { "name": "Author" },
      "source": "./skills/plugin-name",
      "category": "development"
    }
  ]
}
```

**`source` field**: relative path from repo root to the plugin directory. Claude Code looks for `.claude-plugin/plugin.json` inside that directory and treats the directory itself as the plugin root. In this repo that directory is `./skills/<plugin-name>`.

**Categories**: `development`, `productivity`, `learning`, `security`, etc.

### Adding a marketplace

Users add your marketplace by running:

```bash
/plugin marketplace add <github-owner>/<github-repo>
```

Example: `/plugin marketplace add yamlcrew/skills`

### Installing a plugin

```bash
/plugin install <plugin-name>@<marketplace-name>
```

Example: `/plugin install fumadocs-engineer@yamlcrew`

### Auto-updating

Marketplaces support auto-updating — Claude Code periodically refreshes the manifest and updates installed plugins when a new version is detected. Since the manifests here carry no `version`, the commit SHA is the version and every pushed commit is an update.

## How this repo is organized

```
<root>/
├── .claude-plugin/
│   └── marketplace.json              ← Marketplace registry
├── skills/                           ← One directory per plugin; each is also a skills.sh skill
│   └── fumadocs-engineer/            ← Plugin root
│       ├── .claude-plugin/
│       │   └── plugin.json           ← Plugin manifest
│       ├── SKILL.md                  ← In the plugin root → the plugin's single skill
│       ├── references/
│       ├── commands/                 ← Optional (Claude Code only)
│       └── agents/                   ← Optional (Claude Code only)
├── plugins.md                        ← This guide
├── skills.md                         ← Skills authoring guide
├── skills.sh.json                    ← skills.sh repo page groupings
├── README.md
└── LICENSE
```

There is no separate plugin tree and no build or sync step — one directory serves both distribution channels:

- **skills.sh** scans `skills/` one level deep, so `skills/<name>/SKILL.md` is found natively
- **Claude Code** resolves the marketplace entry's `"source": "./skills/<name>"` as the plugin root; with no `skills/` subdirectory there, the root `SKILL.md` loads as the plugin's single skill, and `commands/`, `agents/` and `hooks/` sit exactly where the loader expects them

This works because the repo is strictly **one plugin = one skill** — the directory name is the plugin name, the marketplace entry name and the skill name. Both channels publish the **whole** directory: a skills.sh install writes `references/`, `scripts/`, `commands/`, `agents/`, `prompts/` and `.claude-plugin/plugin.json` to disk, so `commands/` and `agents/` reach non-Claude agents as inert files. And because `plugin.json` travels with the skill, Claude Code auto-detects a skills.sh install under `~/.claude/skills/<name>/` as a local plugin `<name>@skills-dir` with no marketplace step; a marketplace install of the same plugin takes precedence and auto-disables that copy, so there is no double-load.

### Adding a new plugin

1. Create `skills/<plugin-name>/` — this directory is the plugin root
2. Add `.claude-plugin/plugin.json` with name and description (no `version`)
3. Add `SKILL.md` beside it, with frontmatter `name` and `description` — skills.sh silently drops a skill whose `description` is missing, and `claude plugin validate` does not flag it
4. Register in `.claude-plugin/marketplace.json` under `plugins[]` with `"source": "./skills/<plugin-name>"`
5. Add the skill's name to a grouping in `skills.sh.json` and a row to `plugins-list.md` — **CI fails if a skill is ungrouped**
6. Record the change in `CHANGELOG.md` under `## [Unreleased]` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format) — every plugin change is logged here
7. Commit and push

## Changelog

Every plugin change **must** be recorded in `CHANGELOG.md`, and the file **must follow** the [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format. Add entries under `## [Unreleased]` as you work; on release, rename that heading to `## [x.y.z] - YYYY-MM-DD` (SemVer `MAJOR.MINOR.PATCH`) and open a fresh `## [Unreleased]`. There is no manifest `version` to match — see [Version management](#version-management); the changelog is the human-readable record of what changed, not the distribution mechanism.

Use **only** these six change-type sections, in this order, omitting any that are empty:

| Section | Use for |
|---|---|
| `Added` | New features. |
| `Changed` | Changes in existing functionality. |
| `Deprecated` | Soon-to-be-removed features. |
| `Removed` | Now-removed features. |
| `Fixed` | Bug fixes. |
| `Security` | Vulnerability fixes. |

### Template

````markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A feature that has landed but is not yet released.

## [1.1.0] - 2026-07-01

### Added

- A new capability.

### Changed

- Reworded a plugin description.

### Deprecated

- Old config key; removal planned for 2.0.0.

### Removed

- A legacy reference file.

### Fixed

- Broken import path in a SKILL.md example.

### Security

- Patched a command-injection risk in a helper script.

## [1.0.0] - 2026-06-11

### Added

- Initial release.

[Unreleased]: https://github.com/yamlcrew/skills/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/yamlcrew/skills/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yamlcrew/skills/releases/tag/v1.0.0
````

## Sources

- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) — creating plugins
- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference) — full technical spec
- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — distributing plugins
- [Marketplace JSON schema](https://json.schemastore.org/claude-code-marketplace.json) — JSON Schema validation
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) — changelog format
