# Migration & compatibility

Zensical is built by the Material for MkDocs team as the path forward for that ecosystem. It aims to
build existing MkDocs / Material for MkDocs projects with minimal changes, then evolve from there.

## Status (verified 2026-06-16)

- **Pre-1.0 / Alpha** (PyPI "Development Status :: 3 - Alpha"), latest `0.0.45` (2026-06-09); public
  release was **2025-11-05**. The `0.0.x` versioning is *technical* (the API still changes) — it's
  considered production-ready **if the features you need are supported**, and user-facing config/CLI
  is kept stable. No 1.0 ETA.
- **Requires Python ≥ 3.10.** MIT licensed (no Insiders / open-core; Zensical Spark is optional paid
  support, not gated features). Rust core + Python package.
- Templating is **MiniJinja** (Rust, Jinja-compatible). Markdown is **Python Markdown** (CommonMark
  is on the roadmap, not shipped).
- Feature parity with Material for MkDocs — including former Insiders features — is still in progress;
  the docs' compatibility pages are updated as it lands.

## Drop-in migration

- Zensical reads **`mkdocs.yml`** natively and adapts it. Existing Markdown, template overrides, and
  CSS/JS extensions generally work unchanged because the generated HTML structure matches Material for
  MkDocs in both theme variants.
- For an identical Material for MkDocs look, set the **classic** theme:

  ```toml
  [project.theme]
  variant = "classic"
  ```

  The default `modern` variant is a fresh design on the same HTML structure.
- `mkdocs.yml` support is **permanent** (a transition mechanism), but will eventually move out of the
  core into an optional package; new projects should prefer `zensical.toml`.

## Configuration compatibility

- `site_name` is the only required setting (because MkDocs requires it; planned to become optional).
- **Not yet supported** `mkdocs.yml` keys: `remote_branch`, `remote_name`, `exclude_docs`,
  `draft_docs`, `not_in_nav`, `hooks`.
- `docs_dir` cannot be `.` yet. Don't keep both `README.md` and `index.md` in one folder.
- Default Markdown extensions differ from MkDocs (Zensical enables a richer set; reset with
  `markdown_extensions = {}` if a build breaks). See `configuration.md`.
- A future module-based config format will be introduced with automatic conversion tools; `mkdocs.yml`
  stays supported via a compatibility layer.

## Features

Zensical supports the Material for MkDocs authoring feature set, including: Abbreviations,
Admonitions, Annotations, Attribute Lists, BetterEm, Buttons, Caption, Caret/Mark/Tilde, Code blocks
(highlighting, copy, select, annotate), Content tabs, Critic, Data tables, Definition lists, Details,
Diagrams (Mermaid), Footnotes, Grids, Highlight, Icons & Emojis, Images, InlineHilite, Keys, Markdown
in HTML, Math (MathJax/KaTeX), SmartSymbols, Snippets, SuperFences, Tabbed, Table of contents, Tables,
Tasklist, Tooltips; plus navigation features (instant loading, progress, tabs, breadcrumbs, TOC
integration, search). The compatibility/features page is the live source of truth as parity grows.

## Plugins → modules

MkDocs/Material **plugins do not run directly** in Zensical. Instead, plugin functionality is being
re-implemented as native Zensical **modules**, and listed plugins are auto-matched so most existing
projects build unchanged. (The module authoring API is, for now, surfaced through Zensical Spark.)

The team has committed to **29 plugins** across two tiers:

- **Tier 1 (highest priority):** autorefs, awesome-nav, glightbox, literate-nav, macros,
  markdown-exec, meta, mike, minify, mkdocstrings, offline, redirects, search, section-index, tags.
- **Tier 2:** audio, blog, exclude, gen-files, git-authors, git-committers,
  git-revision-date-localized, optimize, privacy, rss, social, static-i18n, table-reader, video.

Some are being **superseded rather than ported** — e.g. navigation plugins like `literate-nav` and
`awesome-nav` give way to native "modular navigation". Always confirm a given plugin's status on
`https://zensical.org/compatibility/plugins/` before promising it works.

## Zensical-native extensions

Beyond Python Markdown / pymdownx, Zensical ships its own Markdown extensions under
`zensical.extensions.*`: **Macros** (Jinja2 templating), **GLightbox** (image lightbox), the **emoji**
generators (`zensical.extensions.emoji.*`), and an instant **preview** extension
(`zensical.extensions.preview`). Note **mkdocstrings** is a separate **plugin** (config under
`[project.plugins.*]`, installed via `pip install mkdocstrings-python`, preliminary support) — not a
Markdown extension. Full detail in `extensions.md`.

## Practical migration notes (from the FAQ)

- **Don't rush `mkdocs.yml` → `zensical.toml`** for an existing project. The TOML format mirrors
  `mkdocs.yml` (everything moved under `[project]`); the team will provide conversion tooling and a
  prompt once the format actually changes. New projects can start with `zensical.toml`.
- `mkdocs.yml` will be read **indefinitely** (moving to an optional compatibility package).
- **Material for MkDocs is supported for ≥12 months** from the 2025-11-05 release, with feature parity
  targeted within that window.
- The **`classic`** variant is maintained (bug fixes) but new design effort goes into `modern`.
- "**Modules**" (not "plugins"): in Zensical *everything* is a module, including the Markdown renderer
  and templating — which is how a future Rust/CommonMark parser can replace Python Markdown.
- **Any Python Markdown extension works** if you install it into the environment and configure it
  under `markdown_extensions` (same parser as MkDocs). See `extensions.md`.
- **Performance:** because Python Markdown runs inside the Rust runtime, cold-start (CI) builds may
  not be dramatically faster yet; the big win is **differential builds + caching** while editing.
- **PDF output** is on the backlog (not available yet). Mermaid is the only supported diagram tool.

## Roadmap (don't rely on yet)

CommonMark + GitHub-flavored Markdown, a component system, a module system, and config presets are
announced but not generally available. Migration tooling is promised for each transition. Verify on
`https://zensical.org/about/roadmap/` before building on any of these.
