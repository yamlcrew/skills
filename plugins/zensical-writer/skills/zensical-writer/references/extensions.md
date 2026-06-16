# Extensions

Rich authoring features come from **Markdown extensions** enabled under
`[project.markdown_extensions.*]`. Three families:

1. **Python Markdown** — the base, built-in.
2. **Python Markdown Extensions** (`pymdownx.*`) — installed with Zensical.
3. **Zensical extensions** (`zensical.extensions.*`) — Zensical's own additions.

`zensical new` enables a sensible default set (full TOML in `configuration.md`). If your config
defines **no** extensions, Zensical applies that built-in default. Reset to MkDocs' minimal defaults
with `markdown_extensions = {}`.

> For most extensions, only options that affect Zensical's output are "officially supported"; other
> upstream options "may yield unexpected results — use at your own risk." Each extension's authoring
> usage is in `authoring.md`.

## Zensical extensions

Enabled like any other extension, under the `zensical.extensions.*` table.

### Macros — `zensical.extensions.macros`

Jinja2 templating in Markdown: variables, macros, filters, control flow, includes. `status: new`.

```toml
[project.markdown_extensions.zensical.extensions.macros]
module_name = "macros"          # Python module exposing define_env(env); default "main"
modules = ["my_package.macros"]  # extra modules (pluglets)
include_yaml = ["data/vars.yml"] # merge YAML into template vars (or a {name = path} table)
include_dir = "includes"          # Jinja2 loader dir for {% include %}
render_by_default = true          # false → only pages with front matter render_macros: true
on_error_fail = false             # true → render errors fail the build
on_undefined = "keep"             # or "strict"
# j2_* options customize Jinja delimiters; j2_extensions = ["jinja2.ext.do"]
```

Define variables/macros/filters in the module:

```python
def define_env(env):
    env.variables["version"] = "1.0"          # {{ version }}
    @env.macro
    def greet(name): return f"Hello, {name}!"  # {{ greet("World") }}
    @env.filter
    def shout(text): return text.upper()       # {{ "x" | shout }}
```

Built-in template vars include `config`, `page`, `git` (commit/tag/author/date…), `environment`,
`now()`, and `read_*` / `pd_read_*` macros that render external CSV/JSON/YAML/Excel as Markdown tables
(needs `pip install pandas tabulate`). Per-page: front matter `render_macros: true|false`. External
files read by macros must be added to `watch` to trigger preview rebuilds.

### GLightbox — `zensical.extensions.glightbox`

Image zoom / lightbox galleries. `status: new`.

```toml
[project.markdown_extensions.zensical.extensions.glightbox]
auto = true            # false → only images with the on-glb class are wrapped
auto_themed = false    # group light/dark images into separate galleries
width = "auto"         # overlay width (CSS units or auto)
height = "auto"
skip_classes = []      # image classes to exclude
auto_caption = false   # use alt as caption when no data-title
caption_position = "bottom"  # bottom | top | left | right
```

Per-image control via Attribute Lists: `data-src`, `data-title`, `data-description`,
`data-caption-position`, `data-gallery`; `off-glb` / `on-glb` classes.

### mkdocstrings — a **plugin**, not a Markdown extension

API reference from source docstrings. **Preliminary support (since 0.0.11)** — backlinks not yet
supported. Configured under the **`[project.plugins.*]`** scope, and installed separately:

```sh
pip install mkdocstrings-python   # or: uv add mkdocstrings-python
```

```toml
[project.plugins.mkdocstrings.handlers.python]
inventories = ["https://docs.python.org/3/objects.inv"]
paths = ["src"]

[project.plugins.mkdocstrings.handlers.python.options]
docstring_style = "google"
inherited_members = true
show_source = false
```

Macros render natively inside Python docstrings. Source paths outside the project folder aren't
watched for rebuilds. Full options: mkdocstrings docs / its Python handler docs.

## Python Markdown extensions

| Extension | Table | Purpose |
|---|---|---|
| Abbreviations | `abbr` | `*[TERM]: definition` tooltips (see tooltips). |
| Admonition | `admonition` | Call-outs (`!!! note`). |
| Attribute Lists | `attr_list` | Add classes/attrs to elements: `{ .class #id key=val }`. Powers buttons, grids, icon colors, image align, tooltips. |
| Definition Lists | `def_list` | `term` / `:   definition`. |
| Footnotes | `footnotes` | `[^1]` references + definitions. |
| Markdown in HTML | `md_in_html` | Parse Markdown inside HTML via the `markdown` attribute (grids, figure captions). |
| Table of Contents | `toc` | Generates the TOC. Options: `permalink = true`, `title`, `permalink_title`, `toc_depth` (e.g. `3`; `0` removes TOC), `slugify`. |
| Tables | `tables` | Pipe tables. |

## Python Markdown Extensions (`pymdownx.*`)

| Extension | Table | Purpose / key options |
|---|---|---|
| Arithmatex | `pymdownx.arithmatex` | Math; `generic = true` + a MathJax/KaTeX script (see authoring → Math). |
| Caption | `pymdownx.blocks.caption` | Captions for any block (`/// caption … ///`), incl. images/tables. |
| Caret / Mark / Tilde | `pymdownx.caret` / `.mark` / `.tilde` | `^^ins^^` / `^sup^`, `==mark==`, `~~del~~` / `~sub~`. |
| Details | `pymdownx.details` | Collapsible admonitions (`???`). |
| Emoji | `pymdownx.emoji` | Icons & emojis. **Use Zensical's generators** (so icons inline as SVG): `emoji_index = "zensical.extensions.emoji.twemoji"`, `emoji_generator = "zensical.extensions.emoji.to_svg"`; `options.custom_icons = ["overrides/.icons"]`. |
| Highlight | `pymdownx.highlight` | Code highlighting (used by SuperFences). Options: `anchor_linenums`, `line_spans = "__span"`, `pygments_lang_class = true`, `auto_title`, `linenums`, `linenums_style` (`table` or `pymdownx-inline`). |
| InlineHilite | `pymdownx.inlinehilite` | Inline highlight `` `#!py code` `` (builds on Highlight). |
| Keys | `pymdownx.keys` | `++ctrl+alt+del++`. |
| SmartSymbols | `pymdownx.smartsymbols` | `(c)`→©, fractions, etc. |
| Snippets | `pymdownx.snippets` | Embed files (`--8<--`); `auto_append = ["includes/abbreviations.md"]` for a site-wide glossary. |
| SuperFences | `pymdownx.superfences` | Arbitrary nesting + `custom_fences` (Mermaid). Required by tabs, diagrams, code. |
| Tabbed | `pymdownx.tabbed` | Content tabs; `alternate_style = true` (only supported style), `combine_header_slug`, `slugify`. |
| Tasklist | `pymdownx.tasklist` | `- [x]` lists; `custom_checkbox = true` (recommended), `clickable_checkbox` (discouraged). |
| BetterEm / MagicLink | `pymdownx.betterem` / `.magiclink` | Better bold/italic parsing; auto-link URLs. |

`critic` works but is discouraged for large projects (use Git for change tracking). Other pymdownx
extensions generally work but aren't advertised.

> Anchors note: enable nicer tab/TOC slugs with a `slugify` sub-table, e.g.
> `[project.markdown_extensions.pymdownx.tabbed.slugify]` → `object = "pymdownx.slugs.slugify"`,
> `kwds = { case = "lower" }`.
