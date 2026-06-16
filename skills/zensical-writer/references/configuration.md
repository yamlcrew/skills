# Configuration (`zensical.toml`)

A Zensical project is configured with a **`zensical.toml`** file (TOML). For migration, Zensical also
reads **`mkdocs.yml`** (YAML) natively. Use `zensical.toml` for new projects; this reference shows
both forms.

> **Why TOML:** whitespace is mostly stylistic (no YAML-style indentation traps) and all strings are
> quoted (no `no`/`off` → boolean surprises).

All settings currently live under the **`[project]`** scope. More scopes will appear as Zensical
evolves (with automatic refactorings provided).

## `[project]` settings

| Setting | Type | Default | Notes |
|---|---|---|---|
| `site_name` | string | — | **Required.** Used in the HTML head and page headers. |
| `site_url` | string | — | Canonical URL. **Strongly recommended** — required for instant navigation, instant previews, and a non-empty `sitemap.xml`. |
| `site_description` | string | — | Fallback `<meta>` description when a page has none. |
| `site_author` | string | — | `<meta name="author">`. |
| `copyright` | string | — | Footer notice; plain text or an HTML fragment. |
| `docs_dir` | string | `docs` | Source directory, relative to the config file. **Cannot be `.`** (temporary limitation — use a subdir). |
| `site_dir` | string | `site` | Build output directory, relative to the config file. |
| `use_directory_urls` | bool | `true` | `true` → `usage.md` ⇒ `/usage/`; `false` → `/usage.html`. Forced to `false` for offline builds. |
| `dev_addr` | string | `localhost:8000` | Bind address for `zensical serve` (IP:PORT). |
| `watch` | array | — | Extra paths to watch in preview; a change triggers a full rebuild. |
| `nav` | array | — | Explicit navigation (see below). Omit to auto-build from the folder tree. |
| `extra` | table | — | Arbitrary key/values for templates. |
| `extra_css` | array | — | Extra stylesheets (paths relative to `docs_dir`, or URLs). |
| `extra_javascript` | array | — | Extra scripts (string paths, or inline tables with `path`/`type`/`async`/`defer`). |
| `markdown_extensions` | table | (default set) | Python Markdown / pymdownx extensions (see below). |

```toml
[project]
site_name = "My Zensical project"
site_url = "https://example.com"
site_description = "Lorem ipsum dolor sit amet."
site_author = "John Doe"
copyright = "&copy; 2025 Jane Doe"
docs_dir = "docs"
site_dir = "site"
use_directory_urls = true
dev_addr = "localhost:8000"
watch = ["data.csv", "fragments"]

[project.extra]
key = "value"
```

`mkdocs.yml` equivalent: the same keys at the top level (`site_name: ...`, `extra:` as a nested map,
etc.).

## Navigation (`nav`)

Paths are relative to `docs_dir`. A string that can't resolve to a Markdown page is treated as an
external URL.

```toml
[project]
nav = [
  { "Home" = "index.md" },
  { "About" = [
    "about/index.md",
    "about/vision.md",
    "about/team.md"
  ] },
  { "GitHub" = "https://github.com/zensical/zensical" }
]
```

```yaml
# mkdocs.yml
nav:
  - Home: index.md
  - About:
    - about/index.md
    - about/vision.md
    - about/team.md
  - GitHub: https://github.com/zensical/zensical
```

A bare `"index.md"` lets Zensical extract the title from the page. For **section index pages**, enable
the `navigation.indexes` feature flag and put an `index.md` (or `README.md`) first in the section.

## Theme

```toml
[project.theme]
variant = "modern"        # "modern" (default, new design) | "classic" (matches Material for MkDocs)
features = [
  "navigation.tabs",
  "navigation.sections",
  "content.code.copy"
]
custom_dir = "overrides"  # template override directory (see theme-and-customization.md)
name = "my_theme"         # only when using a packaged theme extension
```

```yaml
# mkdocs.yml
theme:
  variant: classic
  features:
    - navigation.tabs
```

Feature flags are documented in `theme-and-customization.md`. A misspelled flag is silently ignored.

## Extra CSS / JavaScript

```toml
[project]
extra_css = ["stylesheets/extra.css"]
extra_javascript = ["javascripts/extra.js"]
```

Place the files under `docs/` (e.g. `docs/stylesheets/extra.css`). For module/async/defer scripts use
the inline-table form (an array of tables):

```toml
[[project.extra_javascript]]
path = "javascripts/extra.js"
type = "module"      # or: async = true / defer = true
```

`.mjs` files are auto-detected as modules, but if you set `async`/`defer` you must also set `type`
explicitly. See the `document$` observable note in `theme-and-customization.md` for init code.

## Markdown extensions

Rich authoring features are **off unless their extension is enabled** under
`[project.markdown_extensions.*]`. Each table header is an extension; keys beneath it are its options.

`zensical new` writes this **default set** (recommended — covers most of the Authoring guide):

```toml
[project.markdown_extensions.abbr]
[project.markdown_extensions.admonition]
[project.markdown_extensions.attr_list]
[project.markdown_extensions.def_list]
[project.markdown_extensions.footnotes]
[project.markdown_extensions.md_in_html]
[project.markdown_extensions.toc]
permalink = true
[project.markdown_extensions.pymdownx.arithmatex]
generic = true
[project.markdown_extensions.pymdownx.betterem]
[project.markdown_extensions.pymdownx.caret]
[project.markdown_extensions.pymdownx.details]
[project.markdown_extensions.pymdownx.emoji]
emoji_generator = "zensical.extensions.emoji.to_svg"
emoji_index = "zensical.extensions.emoji.twemoji"
[project.markdown_extensions.pymdownx.highlight]
anchor_linenums = true
line_spans = "__span"
pygments_lang_class = true
[project.markdown_extensions.pymdownx.inlinehilite]
[project.markdown_extensions.pymdownx.keys]
[project.markdown_extensions.pymdownx.magiclink]
[project.markdown_extensions.pymdownx.mark]
[project.markdown_extensions.pymdownx.smartsymbols]
[project.markdown_extensions.pymdownx.superfences]
custom_fences = [
  { name = "mermaid", class = "mermaid", format = "pymdownx.superfences.fence_code_format" }
]
[project.markdown_extensions.pymdownx.tabbed]
alternate_style = true
combine_header_slug = true
[project.markdown_extensions.pymdownx.tasklist]
custom_checkbox = true
[project.markdown_extensions.pymdownx.tilde]
```

`mkdocs.yml` equivalent (note the `!!python/name:` tags YAML needs, which TOML avoids):

```yaml
markdown_extensions:
  - abbr
  - admonition
  - attr_list
  - def_list
  - footnotes
  - md_in_html
  - toc:
      permalink: true
  - pymdownx.arithmatex:
      generic: true
  - pymdownx.betterem
  - pymdownx.caret
  - pymdownx.details
  - pymdownx.emoji:
      emoji_index: !!python/name:material.extensions.emoji.twemoji
      emoji_generator: !!python/name:material.extensions.emoji.to_svg
  - pymdownx.highlight:
      anchor_linenums: true
      line_spans: __span
      pygments_lang_class: true
  - pymdownx.inlinehilite
  - pymdownx.keys
  - pymdownx.mark
  - pymdownx.smartsymbols
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
  - pymdownx.tabbed:
      alternate_style: true
      combine_header_slug: true
  - pymdownx.tasklist:
      custom_checkbox: true
  - pymdownx.tilde
```

Notes:
- Zensical's default extension set differs from MkDocs (which only enables `meta`, `toc`, `tables`,
  `fenced_code`). If a build breaks, reset to the MkDocs defaults with an empty map:
  `markdown_extensions = {}` (TOML) / `markdown_extensions: {}` (YAML).
- If your config file defines **no** extensions at all, Zensical applies a built-in sensible default.
  A config "preset" mechanism is on the roadmap.
- Which feature needs which extension is listed per feature in `authoring.md`.

## Other config scopes

Beyond `[project]` and `[project.markdown_extensions.*]`, these scopes exist:

- **`[project.theme.palette]`** — colors and the light/dark scheme. For a toggle it becomes a **list**
  (`[[project.theme.palette]]`). Fonts live at `[project.theme]` `font.text`/`font.code`. Full detail
  in `setup.md`.
- **`[project.validation]`** — build-time link/footnote/anchor checks (on by default; `--strict` makes
  them fail the build). See `setup.md`.
- **`[project.plugins.*]`** — plugin config, e.g. `[project.plugins.mkdocstrings.handlers.python]`.
  See `extensions.md`.
- **`[project.extra.*]`** — `[project.extra.status]` (page-status ids), `[project.extra.tags]` (tag →
  identifier), plus theme repo/social keys (`repo_url`, etc. — `setup.md`).

## Settings not yet supported

These `mkdocs.yml` keys are **not (yet)** supported in Zensical: `remote_branch`, `remote_name`,
`exclude_docs`, `draft_docs`, `not_in_nav`, `hooks`. See `migration-and-compatibility.md`.
