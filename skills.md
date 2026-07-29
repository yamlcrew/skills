# Skills — How-To Guide

> **Source of truth**: `skills/<skill-name>/SKILL.md` — committed to git and read directly, since skills.sh reads it from the repo root
> **Also the plugin root**: the same directory holds `.claude-plugin/plugin.json`, so one directory serves both channels — nothing is generated and there is no sync step

Skills are reusable instruction sets for AI coding agents. A skill is a directory containing a `SKILL.md` file that teaches an agent how to perform a specific task. This guide covers the [Agent Skills](https://agentskills.io/) open standard used by skills.sh and compatible with 50+ AI agents.

---

## What is a skill?

A skill turns a multi-step procedure, checklist, or reference document into a reusable capability that an AI agent can invoke on demand. Unlike `CLAUDE.md` content (always loaded), a skill's body loads **only when invoked** — so large reference material costs nothing until needed.

## Directory structure

```
skills/
└── <skill-name>/
    ├── .claude-plugin/       # This repo — plugin manifest (see plugins.md)
    │   └── plugin.json
    ├── SKILL.md              # Required — the skill instructions
    ├── references/           # Optional — dense reference docs the skill loads
    │   ├── topic-a.md
    │   └── topic-b.md
    ├── templates/            # Optional — file templates the skill uses
    │   └── config.yaml
    └── scripts/              # Optional — helper scripts the skill runs
        └── validate.sh
```

**Only `SKILL.md` is required** by the skill standard; in this repository the skill directory is also a plugin root, so it carries `.claude-plugin/plugin.json` as well. Everything else is supporting material that the skill references by relative path.

## SKILL.md format

A `SKILL.md` file has two parts: **YAML frontmatter** (required) and a **Markdown body**.

### Frontmatter fields

```yaml
---
name: my-skill                    # Invocation name (used as /my-skill)
description: >-
  One-line description of when to use this skill.
  This is what the agent reads to decide whether to load the skill.
---
```

| Field | Required | Purpose |
|---|---|---|
| `name` | **Required** | Controls the invocation name (`/name`). Without it, a marketplace install falls back to a version-hash directory name that changes on every update. |
| `description` | **Required** | Tells the agent **when** to use this skill. Be specific about triggers — mentions of specific frameworks, file types, error patterns, etc. |

> **Never ship a `SKILL.md` without `description`.** skills.sh **silently drops** a skill whose frontmatter has no `description` — it vanishes from the registry with no error, and `claude plugin validate` does not flag it either. The only thing that catches it is counting the skills skills.sh discovers, which is why CI asserts that count.

> **Don't confuse this with the plugin `description`.** A `SKILL.md` `description` is a *trigger* (when to load the skill). A plugin's `description` is its *identity* (what it is) and lives in two manifests that must match exactly: `.claude-plugin/marketplace.json` → `plugins[].description` and `skills/<skill-name>/.claude-plugin/plugin.json` → `description`. Keep that pair identical and unambiguous — one short, concrete sentence. When you change one, change the other.

### Body structure

```markdown
---
name: fumadocs-engineer
description: >-
  Use this skill whenever the user mentions Fumadocs, fumadocs-ui, 
  fumadocs-mdx, or building a documentation site on Next.js.
---

# Skill Title

Act as a senior engineer who knows [topic] inside out.

## Version context

State the current version and breaking changes clearly.

## Task routing

| Task | Read |
|---|---|
| Task description | `references/file.md` |
| Another task | `references/other.md` |

## Critical rules

- Rule 1 with specific, actionable guidance.
- Rule 2 that prevents the most common bugs.

## Workflow

1. Step one: inspect the project.
2. Step two: read the relevant reference.
3. Step three: make the change.
4. Step four: verify.
```

### Best practices for SKILL.md

1. **Frontmatter `description` is your trigger** — write it so the agent knows *exactly* when to activate. Include framework names, file patterns, error messages, and synonyms.

2. **Version-awareness** — state the current version in the body. Agents hallucinate outdated patterns from training data; explicit version context prevents this.

3. **Task routing table** — if your skill has multiple reference files, list them in a table so the agent loads only what's relevant. This keeps context lean.

4. **Critical rules section** — list the 5-10 rules that prevent 90% of bugs. These should be specific, actionable, and about import paths, breaking changes, and common mistakes.

5. **Ground truth over guessing** — tell the agent where to verify APIs (official docs URLs, llms.txt endpoints) instead of inventing them.

6. **Keep SKILL.md itself concise** — put dense reference material in `references/` files. The main SKILL.md should be a routing + rules document, not an encyclopedia.

## Reference files (`references/`)

Reference files contain the dense, factual content the skill needs:

```
references/
├── components.md         # All UI components with exact imports, props, examples
├── project-setup.md      # Configuration, file structure, build setup
└── cli.md                # CLI commands and their options
```

### What goes in a reference file

- Exact import paths (`import { X } from 'package/subpath'`)
- Complete prop tables with types and defaults
- Working code examples (copy-pasteable)
- Configuration snippets
- Breaking changes from previous versions
- Edge cases and gotchas

### What does NOT go in a reference file

- High-level guidance (that belongs in SKILL.md body)
- Opinions or preferences
- Marketing content

## Templates (`templates/`)

Starter files the skill can scaffold:

```
templates/
└── page.mdx              # Template for a new documentation page
```

Referenced in SKILL.md as: "Copy `templates/page.mdx` as a starting point for new pages."

## Scripts (`scripts/`)

Executable helpers the skill can run:

```
scripts/
└── validate.sh            # Validates the project configuration
```

Referenced in SKILL.md as: "Run `scripts/validate.sh` to check the project setup."

## skills.sh compatibility

The [skills.sh](https://skills.sh) registry (`npx skills`) reads `skills/<name>/SKILL.md` from the **repository root** — it scans `skills/` one level deep, so a skill directory placed there is discovered natively. In this repository that same directory is *also* the Claude Code plugin root: each `.claude-plugin/marketplace.json` entry points at `"source": "./skills/<skill-name>"`, and a plugin with no `skills/` subdirectory and no `skills` field in its manifest loads the root `SKILL.md` as its single skill.

This means:
- **Source of truth** is `skills/<skill-name>/`, read directly by both channels. Nothing is generated, there is no sync step, and the directory is **committed to git** (skills.sh fetches it from the GitHub repo root, so it must be tracked, not ignored)
- **The whole directory is published**, not just `SKILL.md` and `references/`. A skills.sh install copies `scripts/`, `commands/`, `agents/`, `prompts/` and `.claude-plugin/plugin.json` to disk alongside the skill — `commands/` and `agents/` are Claude-Code-specific formats that other agents receive as inert files. Don't put anything private or bulky in a skill directory
- Because `plugin.json` travels with the skill, Claude Code also auto-detects a skills.sh install under `~/.claude/skills/<name>/` as a local plugin `<name>@skills-dir`, with no marketplace step. A marketplace install of the same plugin takes precedence and auto-disables the `@skills-dir` copy, so there is no double-load
- Running `npx skills add user/repo` picks up every `skills/<skill-name>/` directory. Check locally with `npx skills add . --list`, which must report one skill per directory

## skills.sh.json — repo page grouping

`skills.sh.json` at the **repository root** configures how skills.sh renders this repo's page, sorting skills into labelled sections. Validate against [`skills.sh.schema.json`](https://skills.sh/schemas/skills.sh.schema.json).

```json
{
  "$schema": "https://skills.sh/schemas/skills.sh.schema.json",
  "notGrouped": "bottom",
  "groupings": [
    {
      "title": "Documentation",
      "description": "Skills for documentation and content creation",
      "skills": ["fumadocs-engineer"]
    }
  ]
}
```

| Field | Required | Purpose |
|---|---|---|
| `$schema` | Optional | Schema URL for editor validation (preferred over the legacy `schema` field). |
| `notGrouped` | Optional | `"top"` or `"bottom"` (default `"bottom"`) — where skills not listed in any grouping appear. |
| `groupings` | **Required** | 1–50 sections shown on the repo page. |
| `groupings[].title` | **Required** | Section heading (1–120 chars). |
| `groupings[].description` | Optional | One sentence explaining the group (≤500 chars). |
| `groupings[].skills` | **Required** | 1–500 skill names. Each must match a `skills/<skill-name>/` directory (the `SKILL.md` `name`). |

**Keep it in sync.** Every skill must be listed in exactly one grouping. Whenever you add, rename, or remove a skill, update `skills.sh.json` and verify each listed name still resolves to a real `skills/<name>/` directory.

**Don't create groups casually.** Place a new skill in the existing group that fits. Adding a new grouping is a last resort — think hard first; a sprawl of one-skill groups makes the repo page worse, not better.

**When in doubt, ask.** If you're unsure which group a skill belongs to, don't decide alone — contact the user: name the 3 best-fitting existing groups (in your judgement) and ask whether to add the skill to one of them or create a new group.

## Security scanning

Skills should be scanned for security issues (hidden Unicode, prompt-injection markers, etc.) **before publishing**. Run [Snyk Agent Scan](https://github.com/snyk/agent-scan) locally against the `skills/` directory:

```bash
uvx snyk-agent-scan@latest ./skills/
```

To scan a single skill, point it at that skill's directory or `SKILL.md`:

```bash
uvx snyk-agent-scan@latest ./skills/fumadocs-engineer/SKILL.md
```

This is the same scanner that powers the skills.sh `/security/snyk` findings (e.g. `W021` hidden-Unicode) and runs in CI via `.github/workflows/skill-scan.yml`. Scanning locally catches problems before the commit instead of after the push.

## Publishing to skills.sh

1. Write your skill in `skills/<skill-name>/` — `SKILL.md` in the directory root, plus `.claude-plugin/plugin.json` and the `.claude-plugin/marketplace.json` entry that make it a plugin too (see `plugins.md`)
2. Add the skill's `name` to a grouping in `skills.sh.json` (reuse an existing group)
3. Commit and push — the commit SHA is the version, so there is no `version` field to bump
4. Users install with: `npx skills add <github-user>/<repo>`

The skill must have a valid `SKILL.md` with frontmatter `name` and `description`. Verify with `npx skills add . --list` before pushing: a missing `description` costs you the whole skill, silently.

## File naming conventions

| Item | Convention | Example |
|---|---|---|
| Skill directory | `kebab-case` | `fumadocs-engineer/` |
| SKILL.md | Always `SKILL.md` | `SKILL.md` |
| Reference files | `kebab-case.md` | `project-setup.md` |
| Templates | Match target filename | `page.mdx` |
| Scripts | `kebab-case.sh` or `.py` | `validate.sh` |

## Sources

- [Agent Skills open standard](https://agentskills.io/) — cross-agent skill format
- [skills.sh](https://skills.sh) — skill discovery and installation
- [skills.sh.json schema](https://skills.sh/schemas/skills.sh.schema.json) — repo page configuration
- [Claude Code Skills docs](https://code.claude.com/docs/en/skills) — Claude-specific extensions
