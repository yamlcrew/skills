---
name: markdoc
description: >-
  Use when working with Markdoc (markdoc.dev, `@markdoc/markdoc`, `@markdoc/next.js`): authoring or
  debugging `.md`/`.mdoc` content that uses `{% tags %}`, annotations, `$variables`, functions, partials
  or list-style tables; defining a Markdoc schema (custom nodes, tags, attributes, custom attribute types,
  slots); wiring the parse → transform → validate → render pipeline; rendering to HTML, React or a custom
  renderer; or setting up the Next.js plugin. Trigger on `Markdoc.transform`, `RenderableTreeNode`,
  `renderers.react`, `{% partial %}`, `{% callout %}`, a `markdoc/` schema directory, a `.mdoc` file, or
  validation errors like `tag-undefined`, `child-invalid`, `table-syntax`, `missing-closing`.
---

# Markdoc

Act as a senior engineer who knows Markdoc end to end: the authoring syntax, the schema system, the
rendering pipeline, and the Next.js plugin. Most Markdoc bugs are **silent** — a variable that renders
empty, a comment that leaks into the page, an `else` branch that disappears — so write it right the first
time rather than debugging output.

## Version context (verified 2026-09-06)

- **`@markdoc/markdoc` 0.5.9** — Node >= 14.7. React is an optional peer dependency.
- **`@markdoc/next.js` 0.5.0** — App Router and Turbopack supported.
- **markdoc.dev lags the code.** The site documents next.js plugin 0.3.x, omits `slots`, the `image` tag,
  async `transform`, `Markdoc.format` options and `conditionalTags`, and still tells you to enable
  `allowIndentation` (inert in 0.5.9) and `tokenizerOptions` (renamed to `options`). When the docs and the
  source disagree, the source wins — the references here were checked against both, and against executed
  output.

## The mental model

Markdoc is **docs-as-data**, not docs-as-code. It is deliberately *not* a templating language: content
cannot contain arbitrary JavaScript, so a document always parses into a static, machine-readable tree that
can be validated and transformed. That constraint is the feature — it is why writers can ship without a
code review, and why anything dynamic (loops, lookups, computed output) belongs in a `transform` function
or a component, never in the content.

```
source ──parse──▶ Ast.Node ──transform──▶ RenderableTreeNode ──render──▶ HTML / React / anything
                     └────── validate ──▶ ValidateError[]
```

`transform` resolves variables and functions and returns plain JSON — parse and transform on the server,
render on the client.

**When asked to compare or justify the choice** (Stripe's own reasoning, from the FAQ):

| | Markdoc | MDX | AsciiDoc |
|---|---|---|---|
| Model | docs-as-**data** — declarative tags, no embedded code | docs-as-**code** — arbitrary JS/JSX in content | plain-text markup, own AST |
| Trade-off | less power; content stays reviewable by writers, statically analyzable, and cheap to validate | more power and flexibility; content can get as complex as code | extensible and structured, but syntactically idiosyncratic and less familiar than Markdown |
| Tooling cost | small runtime, simple AST | JS parser + larger runtime footprint | Ruby/AsciiDoctor ecosystem |

Markdoc exists because Stripe wanted contributors to ship docs **without** code review. If a requirement
genuinely needs arbitrary logic in the content file, that is an argument for MDX, not for fighting Markdoc.

## Task routing

Read the matching reference before writing code.

| Task | Read |
|---|---|
| Write or fix `.md`/`.mdoc` content: tags, annotations, attributes, variables, functions, conditionals, list tables, partials, slots, comments, frontmatter, fences | `references/syntax.md` |
| Define or debug a schema: config object, custom tags/nodes, attribute types, `matches`/`required`/`errorLevel`, slots, validation error ids, built-in node catalog | `references/schema.md` |
| Call the library: `parse`/`transform`/`validate`/`resolve`/`format`, `Tokenizer` options, `Ast.Node` and `Tag` APIs, the three renderers, writing your own renderer | `references/api.md` |
| Set up a project: `@markdoc/next.js`, React + Express, HTML + Web Components, language server | `references/integrations.md` |
| Build something specific: frontmatter wiring, a full build script, heading anchors, table of contents, syntax highlighting, tabs, switch/case, loops, generating Markdoc from data, CI validation | `references/recipes.md` |

## Critical rules

**Authoring**

- **Only `undefined`, `null` and `false` are falsy.** `0`, `""`, `[]` and `{}` are **truthy** —
  `{% if $count %}` fires on zero. Test explicitly: `{% if not(equals($count, 0)) %}`.
- **`{% else /%}` must be self-closing.** `{% else %}` produces `missing-closing`/`missing-opening` errors
  and the else branch is silently dropped.
- **Variables do not work in Markdown link destinations.** `[Link]({% $url %})` renders as literal text —
  it is not even a link. Use `{% link href=$url %}Link{% /link %}`.
- **Fenced code blocks interpolate Markdoc tags by default.** Any sample containing `{% … %}` needs
  ` ```js {% process=false %} `.
- **Frontmatter is a raw string.** Markdoc never parses it. Parse it yourself and pass it as
  `config.variables` or `{% $frontmatter.title %}` renders **empty, with no error**.
- **Comments need opt-in.** Without `new Tokenizer({ allowComments: true })`, `<!-- x -->` is escaped into
  the output as visible text rather than stripped.
- **Slots need opt-in at parse time:** `Markdoc.parse(source, { slots: true })`.

**Schema**

- **Spread the built-in schema when overriding a node** — `{ ...nodes.heading, attributes: { ...nodes.heading.attributes, … } }`.
  Redeclaring `attributes` wholesale drops `render: false` and leaks internals into the DOM
  (`<h2 level="2">`). The example on markdoc.dev has exactly this bug.
- **Never re-spread `Markdoc.tags`/`Markdoc.nodes` into your config.** `transform` and `validate` merge the
  built-ins automatically; listing a key only replaces that one.
- **`{% table %}` renders through the `table`/`thead`/`tbody`/`tr`/`th`/`td` *nodes*.** To restyle tables,
  override those nodes — not the tag. `colspan`/`rowspan` already emit as `colSpan`/`rowSpan`; no
  post-processing for React is needed.
- **`children` violations are `warning`-level.** Set `errorLevel: 'critical'` on the attributes you
  actually want to fail a build.
- **Inside a `transform`, `node.transformAttributes(config)` omits every `render: false` attribute.**
  Read those through `node.attributes` (already resolved at that point). markdoc.dev's switch/case example
  gets this wrong and renders nothing for any input.
- **Tags written on adjacent lines merge into one `paragraph`.** A parent `transform` that inspects
  `children` for specific tag names needs the children in **block form** — blank lines around each tag —
  or it silently sees a single `p`.

**Pipeline**

- **`Markdoc.validate` does not descend into partials.** A document that includes a broken partial
  validates clean — validate every partial AST separately.
- **`variable-undefined` has two blind spots.** It is only reported when `config.variables` is present at
  all, and **never** for a variable passed to a function — `{% up($nope) %}` and `v=up($nope)` validate
  clean. Don't treat a clean `validate` as proof that every variable resolves.
- **A missing partial is `error`, not `critical`, and renders as nothing.** A build gated only on
  `critical` will ship a page with the include silently gone.
- **`validateFunctions: true` + `returns` on an `{% if %}` condition function = false positive**
  (`attribute-type-invalid` on `primary`). Omit `returns` for condition functions.
- **`lines` and `location.start.line` are 0-based** — add 1 for editor-style output. Pass
  `parse(source, { file })` or every error is attributed to the wrong file.
- **An async `transform`/`validate` anywhere makes `Markdoc.transform`/`Markdoc.validate` return a Promise.**
- **`renderers.reactStatic` throws in the published 0.5.9 bundle** (`resolveTagName must be named tagName`)
  unless you pass your own function literally named `tagName`. See `references/api.md`.

**Next.js**

- Tokenizer options go under **`options`**, not `tokenizerOptions` (markdoc.dev is out of date).
  Comments are on by default *only* while you pass no `options` object at all.
- `$markdoc.frontmatter` is provided by the plugin, not by core Markdoc. In a plain library setup you wire
  `$frontmatter` yourself.

## Workflow

1. **Inspect first.** `package.json` (`@markdoc/markdoc` and `@markdoc/next.js` versions), the `markdoc/`
   or `schema/` directory, `next.config.js`, and how `transform` is currently called. Match existing
   conventions.
2. **Read the reference file(s)** for the task. Do not guess an option name — the whole surface is small
   and documented here.
3. **Write the change.** New tag → schema file + config registration + the component in the `components`
   map (keyed by `render`, not by tag name). New content → check every `{% … %}` against
   `references/syntax.md`.
4. **Verify by running it.** Print `JSON.stringify(Markdoc.transform(ast, config))` to see the renderable
   tree, and `Markdoc.validate(ast, config)` to see errors. Markdoc fails silently far more often than it
   throws — inspect the tree rather than trusting the source to be right.

## Debugging quick hits

| Symptom | Cause |
|---|---|
| Interpolation renders empty | Variable missing from `config.variables` (frontmatter usually not wired). |
| `Undefined tag: 'x'` (`tag-undefined`) | Tag not registered in `config.tags`. |
| `Can't nest 'x' in 'y'` (`child-invalid`) | Node type missing from the schema's `children`. Warning-level — it does not stop the build. |
| `'x' tag should be self-closing` | Content inside a `selfClosing` tag; usually a missing `/` on `{% else /%}`. |
| `Found paragraph where a list was expected` (`table-syntax`) | Content inside a `{% table %}` cell is not indented. |
| `Partial 'x' not found` | `config.partials` key does not match the `file="…"` string exactly. |
| `<!-- … -->` visible on the page | Tokenizer built without `allowComments: true`. |
| Unexpected attribute in the HTML (`level`, `ordered`) | A node override dropped `render: false`. |
| Tags inside a code sample got interpolated | Missing `{% process=false %}` on the fence. |
| `{% if %}` block shows when it should not | Markdoc truthiness — `0` and `""` are truthy. |
| React: "Objects are not valid as a React child" | A `transform` returned an `Ast.Node` instead of a `Tag`/string; return `new Tag(...)`. |
| A custom `transform` renders nothing, no error | It read a `render: false` attribute via `transformAttributes()`, which omits them — use `node.attributes`. |
| A parent tag sees no child tags / collects an empty list | The children were written inline and merged into one `paragraph`; use block form. |
| `attribute-type-invalid` on `primary` of `{% if %}` | `returns` declared on the condition function while `validateFunctions` is on. False positive — drop `returns`. |
| Partial silently missing from the page | `attribute-value-invalid` at `error` level; a `critical`-only gate let it through. |

## Ground truth

- Docs: <https://markdoc.dev/docs> · tag grammar spec: <https://markdoc.dev/spec>
- Source (the authority when docs disagree): <https://github.com/markdoc/markdoc> —
  `src/schema.ts` (built-in nodes), `src/tags/` (built-in tags), `src/types.ts` (`Config`, `Schema`),
  `src/validator.ts` (error ids), `spec/marktest/tests.yaml` (behavioural fixtures).
- Next.js plugin source: <https://github.com/markdoc/next.js> (`src/loader.js`, `src/tags.js`).
- Playground for AST / renderable-tree inspection: <https://markdoc.dev/sandbox?mode=transform>
