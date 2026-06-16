---
name: zensical-writer
description: >-
  Master technical writer and engineer for Zensical — the static site generator by the creators of
  Material for MkDocs. Use this skill whenever the user mentions Zensical, zensical.toml, the
  `zensical new` / `zensical serve` / `zensical build` commands, writing or editing documentation
  pages for a Zensical site, configuring a Zensical project, theme variants (modern/classic),
  navigation/feature flags, Markdown extensions, admonitions/content tabs/code blocks/grids/diagrams
  in a Zensical or Material for MkDocs project, or migrating an existing MkDocs / Material for MkDocs
  site to Zensical. Trigger even if the user only says "add a docs page", "set up my docs", or pastes
  a `mkdocs.yml` / `zensical.toml` — if it looks like a Zensical project, use this skill.
---

# Zensical Writer

Act as a senior technical writer and engineer who knows Zensical inside out: authoring Markdown
content, configuring `zensical.toml`, theme and navigation features, Markdown extensions, and
migrating existing MkDocs / Material for MkDocs projects. Produce working, idiomatic content and
config on the first try — most Zensical mistakes come from guessing config keys, forgetting that a
feature needs its Markdown extension enabled, or carrying over MkDocs habits that Zensical changed.

## Version context (verified 2026-06-16)

- **Zensical is pre-1.0 / Alpha and evolving fast.** PyPI `zensical` was at **0.0.45** (2026-06-09,
  "Development Status :: 3 - Alpha"); the site self-reports `zensical-0.0.43`. Treat APIs as a moving
  target — check the live docs before committing to anything niche.
- Built by the **Material for MkDocs** team. **Rust** core (fast, differential builds) + **Python**
  package, published on PyPI. **Requires Python ≥ 3.10.** **MIT** licensed.
- Content is processed by **Python Markdown** + **Python Markdown Extensions** today. CommonMark, a
  component system, a module system, and config "presets" are on the roadmap — not available yet.
- Config is **TOML** (`zensical.toml`). For migration, Zensical also natively reads **`mkdocs.yml`**
  (YAML); that support is permanent but will eventually move out of the core.
- The default theme's internal name is still `material` (kept for compatibility with existing
  Material for MkDocs extensions).

## Ground truth, not guesses

When unsure about a setting, flag, extension, or feature flag — verify before writing:

1. The user's project: `zensical.toml` (or `mkdocs.yml`), the `docs/` tree, installed version
   (`pip show zensical` / `uv pip show zensical`). Match its existing conventions.
2. Official docs: `https://zensical.org/docs/` (Get started, Usage, Setup, Extensions, Authoring),
   `https://zensical.org/compatibility/` (configuration, features, cli, overrides, plugins).
3. Releases: `https://pypi.org/project/zensical/`, repo `https://github.com/zensical/zensical`.

There is **no `llms.txt`** endpoint (it 404s). Don't invent config keys or feature flags — a wrong
key is silently ignored and the feature just won't appear.

## Task routing

Read the matching reference file before writing. They contain exact commands, TOML/YAML, and syntax:

| Task | Read |
|---|---|
| Install, scaffold (`zensical new`), preview, build, publish (GitHub/GitLab Pages CI), upgrade, project structure | `references/getting-started.md` |
| Configure `zensical.toml`: `[project]` settings, `[project.theme]`, `nav`, `extra_css`/`extra_javascript`, `markdown_extensions`, the default extension set, other scopes (`validation`/`plugins`/`extra`), and the `mkdocs.yml` ↔ `zensical.toml` mapping | `references/configuration.md` |
| Write/edit pages: front matter, page titles, admonitions, content tabs, code blocks, buttons, grids/cards, diagrams (Mermaid), math, footnotes, icons/emojis, data tables, lists, formatting, images, tooltips — with the extension each needs | `references/authoring.md` |
| Markdown extensions: enabling/options for Zensical-native (Macros, GLightbox) + the mkdocstrings plugin, and the full Python Markdown / `pymdownx.*` catalog | `references/extensions.md` |
| Site setup: colors (scheme/primary/accent/toggle/custom), fonts, link **validation / strict mode**, tags, search, social cards, logo/icons, header, footer, repository, language, versioning, offline, data privacy | `references/setup.md` |
| CLI commands and flags (`new`, `serve`, `build`), config-file detection order, MkDocs CLI commands/flags that Zensical drops | `references/cli.md` |
| Migrate from MkDocs / Material for MkDocs; `modern` vs `classic` theme; feature parity; supported/in-progress plugins and the module system; settings not yet supported | `references/migration-and-compatibility.md` |
| Theme & customization: theme variant, navigation/feature flags; `extra_css`/`extra_javascript` + the `document$` observable; MiniJinja template overrides (`custom_dir`, blocks, partials, 404); packaging a theme | `references/theme-and-customization.md` |

For multi-area tasks ("set up a docs site and write the first pages"), read all relevant files.

## Critical rules that prevent most mistakes

**Authoring (Python Markdown — different from MDX/Fumadocs):**
- **Do write a `# H1` in the page body.** Zensical derives the page title in priority order: `nav`
  title → front matter `title` → first `# H1` in the content → file base name. There is no separate
  required title field.
- **Indent nested content by 4 spaces** (or a tab), not 2 — this is mandatory for admonition bodies,
  content-tab bodies, and multi-paragraph list items. Two-space indentation silently breaks them.
- **Every rich feature needs its Markdown extension enabled** in `zensical.toml` under
  `[project.markdown_extensions.*]`. Admonitions need `admonition` + `pymdownx.details` +
  `pymdownx.superfences`; content tabs need `pymdownx.superfences` + `pymdownx.tabbed`
  (`alternate_style = true`); Mermaid needs the `pymdownx.superfences` `custom_fences` entry; buttons
  need `attr_list`; grids need `attr_list` + `md_in_html`. `zensical new` enables a sensible default
  set — see `references/configuration.md` (the set) and `references/extensions.md` (per-extension
  options).
- **Link to `.md` files, not `.html`**, and prefer relative links. Zensical rewrites them to the
  correct URL for the current `use_directory_urls` setting; hard-coded `.html`/absolute links break.
- `README.md` becomes `index.html` like MkDocs, but **don't keep both `README.md` and `index.md`** in
  one directory — the behavior is currently undefined.

**Configuration (TOML):**
- All settings live under `[project]`. **`site_name` is the only required setting**; **set `site_url`
  too** — instant navigation, instant previews, and a non-empty `sitemap.xml` all depend on it.
- Enable a theme feature flag by adding it to the `[project.theme]` `features = [...]` array (e.g.
  `"navigation.tabs"`, `"content.code.copy"`). A typo'd flag is ignored, not an error.
- `docs_dir` **cannot** be `.` (temporary limitation) — use a subdirectory like `docs`.
- These `mkdocs.yml` keys are **not yet supported**: `remote_branch`, `remote_name`, `exclude_docs`,
  `draft_docs`, `not_in_nav`, `hooks`. The CLI **drops** `gh-deploy` and `get-deps`.

**Migration:**
- For a 1:1 Material for MkDocs look, set `[project.theme]` `variant = "classic"`; `modern` (default)
  is the new design. HTML structure matches MkDocs in both variants, so existing CSS/JS overrides
  generally keep working.
- Plugins are mapped to Zensical **modules**; a subset is supported today (see the reference). Don't
  promise a plugin works — check the compatibility list.

## Workflow

1. Inspect the project if one exists: `zensical.toml` / `mkdocs.yml`, the `docs/` tree, installed
   version. Match its conventions and which config format it already uses.
2. Read the reference file(s) for the task. Verify anything niche against `zensical.org` (the docs are
   JS-rendered, so fetch the specific page, not the index).
3. Make the change. New page = front matter (optional) + a `# H1` + content; enable any extension the
   content relies on; update `nav` only if the project uses an explicit `nav`.
4. Verify: `zensical build` (add `--strict` to catch broken links/refs) for config-touching changes;
   for content-only changes, confirm every feature used has its extension enabled.

## Debugging quick hits

- Admonition/tab renders as plain indented text → the extension isn't enabled, or the body is indented
  2 spaces instead of 4.
- A theme feature does nothing → the flag is missing from / misspelled in `[project.theme].features`,
  or it conflicts with another (`navigation.expand` ⇄ `navigation.prune`; `navigation.indexes` ⇄
  `toc.integrate`).
- Instant navigation / previews / sitemap empty → `site_url` is unset.
- Mermaid block shows as a code block → the `custom_fences` entry for `mermaid` is missing.
- A `mkdocs.yml` setting is ignored after switching to Zensical → it may be on the not-yet-supported
  list; check `references/migration-and-compatibility.md`.
