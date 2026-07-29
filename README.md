# skills

Curated agent skills by [yamlcrew ](https://yamlcrew.ai)and [nchekwa](https://nchekwa.com). High-quality, reference-dense skills for AI coding agents. List of skills via `skills.sh` :

```
https://www.skills.sh/yamlcrew/skills
```

## Plugins

See the full list in [plugins-list.md](./plugins-list.md).

## Install

### skills.sh (Claude Code, Cursor, Codex, OpenCode, Windsurf, Gemini CLI, GitHub Copilot, 50+ agents)

 

```
npx skills add yamlcrew/skills --list
```

```bash
npx skills add yamlcrew/skills
```

### Claude Code Plugin Marketplace

```bash
/plugin marketplace add yamlcrew/skills
/plugin install <plugin-name>@yamlcrew
```

## Repository structure

Each `skills/<name>/` directory is both the **skill** (published to skills.sh) and the **plugin root**
(installed by the Claude Code marketplace). There is no separate `plugins/` tree and no generated copy.

```
<root>/
├── .claude-plugin/
│   └── marketplace.json              ← Marketplace registry for Claude Code
├── skills/                           ← One directory per skill = one plugin
│   └── <name>/
│       ├── .claude-plugin/
│       │   └── plugin.json           ← Plugin manifest
│       ├── SKILL.md                  ← In the plugin root → loaded as the plugin's skill
│       ├── references/*.md
│       ├── scripts/                  ← optional
│       ├── commands/                 ← optional, Claude Code only
│       └── agents/                   ← optional, Claude Code only
├── skills.sh.json                    ← skills.sh repo-page grouping
├── plugins.md                        ← Plugin authoring guide
├── skills.md                         ← Skill authoring guide
├── plugins-list.md                   ← Catalog of available plugins
├── CHANGELOG.md                      ← Keep a Changelog 1.1.0
├── CLAUDE.md                         ← Guidance for Claude Code in this repo
├── README.md
└── LICENSE
```

Everything inside `skills/<name>/` is shipped through both channels — including `scripts/`,
`commands/` and `agents/`. Plugin manifests deliberately carry no `version`, so the commit SHA is
the version and every push reaches installed users.

## Adding a new skill

1. Create `skills/<name>/` with `.claude-plugin/plugin.json` and `SKILL.md` side by side
2. Register in `.claude-plugin/marketplace.json` with `"source": "./skills/<name>"`
3. Add the skill to a grouping in `skills.sh.json` and to the table in [plugins-list.md](./plugins-list.md)
4. Log the change in [CHANGELOG.md](./CHANGELOG.md) under `[Unreleased]`
5. Commit and push

See [plugins.md](./plugins.md) and [skills.md](./skills.md) for full guides.

## License

MIT