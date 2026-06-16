# Site setup

Setup topics beyond the core `[project]` settings (in `configuration.md`) and navigation (in
`theme-and-customization.md`). Most map to a `[project.theme]` or `[project.*]` scope. Each shows the
`zensical.toml` form; the `mkdocs.yml` form is the same keys nested under `theme:` / top level.

## Colors

### Scheme (light/dark)

`default` = light, `slate` = dark.

```toml
[project.theme.palette]
scheme = "default"
```

### Primary & accent

Primary = links (and header/sidebar in `classic`); accent = interactive (hover, buttons, scrollbar).

```toml
[project.theme]
palette.primary = "indigo"
palette.accent = "indigo"
```

Valid primary colors: red, pink, purple, deep-purple, indigo, blue, light-blue, cyan, teal, green,
light-green, lime, yellow, amber, orange, deep-orange, brown, grey, blue-grey, black, white. Accent:
the same minus the greys/black/white.

### Palette toggle (and system preference)

For a light/dark toggle, `palette` becomes a **list** (`[[project.theme.palette]]`). Add a `media`
query to follow the OS, or a bare `(prefers-color-scheme)` entry for an automatic-mode toggle.

```toml
[[project.theme.palette]]
media = "(prefers-color-scheme: light)"
scheme = "default"
toggle.icon = "lucide/sun"
toggle.name = "Switch to dark mode"

[[project.theme.palette]]
media = "(prefers-color-scheme: dark)"
scheme = "slate"
toggle.icon = "lucide/moon"
toggle.name = "Switch to light mode"
```

`toggle.icon` must reference a bundled icon or the build fails; `toggle.name` is the tooltip/`title`.
Each palette entry can set its own `primary`/`accent`.

### Custom colors

Set `primary`/`accent` to `"custom"`, then override CSS variables in an `extra_css` stylesheet:

```css
:root > * {
  --md-primary-fg-color:        #EE0F0F;
  --md-primary-fg-color--light: #ECB7B7;
  --md-primary-fg-color--dark:  #90030C;
}
```

Define a **named scheme** by wrapping vars in `[data-md-color-scheme="name"] { … }` and setting
`scheme = "name"`. Tune `slate` via `--md-hue` (0–360).

## Fonts

Integrates with Google Fonts:

```toml
[project.theme]
font.text = "Inter"
font.code = "JetBrains Mono"
```

Disable Google Fonts (privacy → system fallback) with `font = false`. Add custom `@font-face` in an
`extra_css` and apply via `--md-text-font` / `--md-code-font` CSS variables (not raw `font-family`,
which kills the fallback).

## Validation (link checking) & strict mode

Zensical validates internal links/footnotes/anchors at build time. **Enabled by default.** Toggle
checks individually under `[project.validation]`, or disable all with `validation = false`:

```toml
[project.validation]
unresolved_references = true
unresolved_footnotes = true
unused_definitions = true
unused_footnotes = true
shadowed_definitions = true
shadowed_footnotes = true
invalid_links = true          # link to a non-existent page
invalid_link_anchors = true   # link to a non-existent anchor
```

By default issues are **warnings**. Run `zensical build --strict` to fail the build (exit 1) — use in
CI. Escape an intentional bracket phrase with `\[` to avoid false positives. (Caveats: regex-based
until the CommonMark migration; autorefs currently report as unresolved; avoid nested brackets in link
text.)

## Tags

Supported by default — add via front matter; they render at page bottom and are filterable in search.
(Tag **index/listing** pages aren't supported yet — feature-parity in progress.)

```yaml
---
tags:
  - HTML5
  - JavaScript
---
```

Optional tag icons: map tags → identifiers under `[project.extra.tags]`, then identifiers → icons
under `[project.theme.icon.tag]`:

```toml
[project.theme.icon.tag]
default = "lucide/hash"
html = "fontawesome/brands/html5"

[project.extra.tags]
HTML5 = "html"
```

Hide tags on a page with front matter `hide: [tags]`.

## Search

Built-in client-side search (supported plugin → module). Pages are indexed automatically; tags feed
into search. Control per-page indexing via front matter `search: { exclude: true }`. For exact
options, see `https://zensical.org/docs/setup/site-search/`.

## Social cards

**Not ready yet** — Zensical is working toward feature parity with Material for MkDocs' social-cards.
Don't promise auto-generated OG images; check the compatibility/features page for current status.

## Other Setup pages (fetch on demand)

These have concrete config but are less commonly needed — read the specific page under
`https://zensical.org/docs/setup/` when required:

- **Logo & icons** — `[project.theme]` `logo`, `favicon`, `icon.*`; adding custom icon sets
  (`custom_icons`).
- **Header** — `[project.theme].features`: `header.autohide`, `announce.dismiss`.
- **Footer** — footer nav (prev/next) via `navigation.footer`; social links under `[project.extra]`
  `social`; `[project.extra].generator = false` to drop "Made with Zensical".
- **Repository** — `repo_url`, `repo_name`, `edit_uri`, `[project.theme].icon.repo`.
- **Language / i18n** — `[project.theme]` `language`; `[project.theme].font` per direction; RTL.
- **Versioning** — `mike`-style version selector (`[project.extra].version`).
- **Data privacy** — built-in privacy handling / consent (`[project.extra].consent`).
- **Offline usage** — build for `file://` (forces `use_directory_urls = false`).
- **Site analytics**, **comment system** — provider snippets via template overrides.

Verify these against the live docs — they evolve as feature parity progresses.
