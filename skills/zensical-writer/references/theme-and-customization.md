# Theme & customization

## Theme variant

```toml
[project.theme]
variant = "modern"   # default, new design
# variant = "classic"  # matches Material for MkDocs exactly
```

Both variants share the same HTML structure, so CSS/JS overrides work across both. Switch to
`classic` when matching an existing Material for MkDocs look.

## Navigation & feature flags

Enable features by listing them in `[project.theme].features` (a misspelled flag is silently
ignored). The navigation/TOC flags:

| Flag | Effect |
|---|---|
| `navigation.instant` | SPA-style navigation via XHR (needs `site_url`). |
| `navigation.instant.prefetch` | Prefetch a page on link hover (experimental). |
| `navigation.instant.progress` | Top progress bar for slow loads. |
| `navigation.tracking` | Update the URL anchor as you scroll. |
| `navigation.tabs` | Top-level sections as header tabs (≥1220px). |
| `navigation.tabs.sticky` | Keep tabs visible when scrolling. |
| `navigation.sections` | Top-level sections as sidebar groups. |
| `navigation.expand` | Expand all sidebar subsections by default. |
| `navigation.prune` | Render only visible nav items (big sites; **not** with `navigation.expand`). |
| `navigation.indexes` | Attach a page to a section (section index; **not** with `toc.integrate`). |
| `navigation.path` | Breadcrumbs above the page title. |
| `navigation.top` | Back-to-top button. |
| `toc.follow` | Auto-scroll the TOC to the active anchor. |
| `toc.integrate` | Render the TOC inside the left sidebar (**not** with `navigation.indexes`). |

Content feature flags used elsewhere: `content.code.copy`, `content.code.select`,
`content.code.annotate`, `content.tabs.link`, `content.tooltips`, `content.footnote.tooltips`.

```toml
[project.theme]
features = [
  "navigation.instant",
  "navigation.tabs",
  "navigation.sections",
  "toc.follow",
  "content.code.copy"
]
```

Colors, fonts, validation/strict mode, tags, search, social cards, logo/icons, header, footer,
repository, language, versioning, offline, and data privacy are covered in `setup.md`.

## Additional CSS / JavaScript

Place assets under `docs/` and register them:

```toml
[project]
extra_css = ["stylesheets/extra.css"]
extra_javascript = ["javascripts/extra.js"]
```

For modules / `async` / `defer`, use the array-of-tables form:

```toml
[[project.extra_javascript]]
path = "javascripts/extra.js"
type = "module"   # or async = true / defer = true
```

`.mjs` is auto-detected as a module; if you set `async`/`defer` you must also set `type`.

**Run init code at the right time** — subscribe to the `document$` observable so it re-runs under
instant navigation (which doesn't reload the page):

```javascript
document$.subscribe(function () {
  // initialize third-party libraries here
})
```

(`component$` is also available for per-component hooks, e.g. re-typesetting math in annotations.)

## Template overrides (MiniJinja)

Zensical renders the page scaffold with **MiniJinja** (Rust, Jinja-compatible). The default page
template is `main.html`, which extends `base.html` and pulls in `partials/`.

> **Gotcha:** MiniJinja is pure Rust — it **cannot call Python functions**. Overrides that relied on
> Python callables in MkDocs won't work; use a MiniJinja [filter] or [test] instead, or request one if
> it's broadly useful. (Symlinks are also only followed *within* directories already part of the
> build, for security.)

  [filter]: https://docs.rs/minijinja/latest/minijinja/filters/index.html#functions
  [test]: https://docs.rs/minijinja/latest/minijinja/tests/index.html#functions

Point `custom_dir` at an overrides directory (resolved relative to the config file):

```toml
[project.theme]
custom_dir = "overrides"
```

Any file you place in `custom_dir` overrides the Zensical file of the same name/path.

### Override blocks (recommended)

Override `main.html` (not `base.html`, which changes more often) and redefine a block; use
`{{ super() }}` to extend rather than replace:

```html
{% extends "base.html" %}

{% block extrahead %}
  {% if page and page.meta and page.meta.robots %}
    <meta name="robots" content="{{ page.meta.robots }}" />
  {% endif %}
{% endblock %}
```

Available blocks include: `analytics`, `announce`, `config`, `container`, `content`, `extrahead`,
`fonts`, `footer`, `header`, `hero`, `htmltitle`, `libs`, `outdated`, `scripts`, `site_meta`,
`site_nav`, `styles`, `tabs`.

### Override partials & error page

Replace a partial by mirroring its path in `custom_dir`, e.g. `overrides/partials/footer.html`. Add a
custom 404 at `overrides/404.html` (Zensical ships a default).

### Custom per-page template

Create a uniquely named template in `custom_dir`, then select it in a page's front matter:

```yaml
---
template: my_homepage.html
---
```

## Packaging a theme

Share a theme extension as a Python package discovered via the `mkdocs.themes` entry point (kept for
Material for MkDocs compatibility):

```toml
# pyproject.toml (excerpt)
[project]
name = "my-theme"
version = "0.1.0"
dependencies = ["zensical>=0.0.37"]

[project.entry-points."mkdocs.themes"]
my_theme = "my_theme"
```

An optional `mkdocs_theme.yml` in the theme dir sets defaults and `extends` (set `extends: material`
to build on Zensical's default theme). Unlike MkDocs, `mkdocs_theme.yml` is optional and is also read
from `custom_dir`. Users select it with `[project.theme]` `name = "my_theme"`.
