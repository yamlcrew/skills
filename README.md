# skills

Curated agent skills by [yamlcrew ](https://yamlcrew.ai)and [nchekwa](https://nchekwa.com). High-quality, reference-dense skills for AI coding agents.

## Plugins

| Plugin | Description |
| --- | --- |
| [fumadocs-engineer](./plugins/fumadocs-engineer) | Master senior engineer for Fumadocs — the Next.js/React docs framework |

## Install

### skills.sh (Claude Code, Cursor, Codex, OpenCode, Windsurf, Gemini CLI, GitHub Copilot, 50+ agents)

```bash
npx skills add yamlcrew/fumadocs-engineer
```

### Claude Code Plugin Marketplace

```bash
/plugin marketplace add yamlcrew/skills
/plugin install fumadocs-engineer@skills
```

## Repository structure

```
<root>/
├── .claude-plugin/
│   └── marketplace.json              ← Marketplace registry for Claude Code
├── plugins/                          ← Source of truth for all plugins
│   └── fumadocs-engineer/
│       ├── .claude-plugin/
│       │   └── plugin.json           ← Plugin manifest
│       ├── skills/
│       │   └── fumadocs-engineer/
│       │       ├── SKILL.md
│       │       └── references/
│       │           └── *.md
│       └── README.md
├── skills/                           ← Generated (not in git)
├── plugins2skills.py                 ← Sync: plugins/ → skills/
├── plugins.md                        ← Plugin authoring guide
├── skills.md                         ← Skill authoring guide
├── README.md
└── LICENSE
```

## Adding a new plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json` and `skills/`
2. Register in `.claude-plugin/marketplace.json`
3. Run `python plugins2skills.py` to sync
4. Commit and push

See [plugins.md](./plugins.md) and [skills.md](./skills.md) for full guides.

## License

MIT