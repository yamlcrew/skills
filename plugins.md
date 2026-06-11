# Plugins — How-To Guide

> **Source of truth**: `plugins/<plugin-name>/`
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
  "version": "1.0.0",
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
| `version` | Recommended | If set, users only get updates when you bump this field. If omitted, every git commit counts as a new version |
| `author` | Optional | Attribution |
| `homepage` | Optional | Link to project page |
| `repository` | Optional | Link to source repo |
| `license` | Optional | SPDX license identifier |

### Version management

- **With `version`**: users receive updates only when you bump the version string
- **Without `version`**: if distributed via git, every commit SHA is treated as a new version
- Always bump `version` when you want users to receive an update

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

If the plugin has **no `skills/` directory**, a lone `SKILL.md` at the plugin root is loaded as a single skill. Set frontmatter `name` to control the invocation name — without it, Claude Code falls back to the install directory name (which is a version hash for marketplace plugins and changes on every update).

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
      "version": "1.0.0",
      "author": { "name": "Author" },
      "source": "./plugins/plugin-name",
      "category": "development"
    }
  ]
}
```

**`source` field**: relative path from repo root to the plugin directory. Claude Code looks for `.claude-plugin/plugin.json` inside that directory.

**Categories**: `development`, `productivity`, `learning`, `security`, etc.

### Adding a marketplace

Users add your marketplace by running:

```bash
/plugin marketplace add <github-owner>/<github-repo>
```

Example: `/plugin marketplace add nchekwa/nchekwa-skills`

### Installing a plugin

```bash
/plugin install <plugin-name>@<marketplace-name>
```

Example: `/plugin install fumadocs-engineer@nchekwa-skills`

### Auto-updating

Marketplaces support auto-updating — Claude Code periodically refreshes the manifest and updates installed plugins when a new version is detected.

## How this repo is organized

```
nchekwa-skills/
├── .claude-plugin/
│   └── marketplace.json              ← Marketplace registry
├── plugins/                          ← Source of truth for all plugins
│   └── fumadocs-engineer/
│       ├── .claude-plugin/
│       │   └── plugin.json           ← Plugin manifest
│       ├── skills/
│       │   └── fumadocs-engineer/
│       │       ├── SKILL.md
│       │       └── references/
│       └── README.md
├── skills/                           ← Generated (plugins2skills.py), in .gitignore
│   └── fumadocs-engineer/
│       ├── SKILL.md
│       └── references/
├── plugins2skills.py                 ← Sync script: plugins/ → skills/
├── plugins.md                        ← This guide
├── skills.md                         ← Skills authoring guide
├── README.md
└── LICENSE
```

### Adding a new plugin

1. Create `plugins/<plugin-name>/` with the structure above
2. Add `.claude-plugin/plugin.json` with name, description, version
3. Add `skills/<skill-name>/SKILL.md` inside the plugin
4. Register in `.claude-plugin/marketplace.json` under `plugins[]`
5. Run `python plugins2skills.py` to generate `skills/` for skills.sh
6. Commit and push

## Sources

- [Claude Code Plugins](https://code.claude.com/docs/en/plugins) — creating plugins
- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference) — full technical spec
- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — distributing plugins
- [Marketplace JSON schema](https://json.schemastore.org/claude-code-marketplace.json) — JSON Schema validation
