# Markdoc syntax (authoring reference)

Markdoc is a **superset of CommonMark**. Everything you know from Markdown works, plus four extensions:
**tags**, **annotations**, **variables**, and **functions**. All four live inside `{% … %}` delimiters.

The formal grammar is at <https://markdoc.dev/spec> (draft 0.1.0). Grammar summary at the bottom of this file.

## Deviations from CommonMark

| Feature | Status in Markdoc |
|---|---|
| Setext headings (`Title` + `====`) | **Disabled** — the `lheading` markdown-it rule is turned off. Use ATX (`# Title`). |
| Indented code blocks (4 spaces) | **Disabled** — the `code` rule is turned off. Use fenced code blocks. |
| GFM pipe tables | Supported, but prefer the `{% table %}` list syntax for rich content. |
| Raw HTML | Not enabled by default (markdown-it `html: false`) — it is escaped into the output as text. |
| HTML comments | Escaped as literal text **unless** you enable `allowComments` on the tokenizer (see below). |

Because indented code blocks are off, **you can indent tag bodies freely** for readability — this works
out of the box in 0.5.9:

```
{% foo %}
  {% bar %}
    Nested content
  {% /bar %}
{% /foo %}
```

markdoc.dev's FAQ says this needs `new Tokenizer({ allowIndentation: true })`. It no longer does — the
tokenizer ignores that option (it disables the `code` rule unconditionally); `allowIndentation` now only
affects `Markdoc.format` output. The portability caveat still stands: such a document is not valid
CommonMark for other tools.

## Tags

A tag is `{%`, the tag name, optional attributes, `%}`. Tags nest like HTML.

```
{% callout type="warning" %}
Body content, itself Markdown.
{% /callout %}
```

Self-closing tags put the slash at the end of the opening tag:

```
{% image src="/logo.svg" width=40 /%}
```

**Block vs inline form.** Markdoc decides from placement, not from the schema:

- Opening and closing markers each alone on their own line → **block** tag.
- Opening and closing on the same line → **inline** tag, wrapped in an implied `paragraph` node
  (renders `<p>`) when it is the only content on the line.

```
This is a paragraph {% highlight %}with an inline tag{% /highlight %} inside it.
```

A schema can force one form with `inline: true | false`; a mismatch produces a `tag-placement-invalid`
validation error at level `critical`.

**Primary attribute.** A bare value right after the tag name is the unnamed *primary* attribute. This is
how `{% if $foo %}`, `{% else $bar /%}` and `{% slot "name" %}` are written.

## Attributes

Two syntaxes. Both accept `number`, `string`, `boolean`, `null`, JSON `array`, JSON `object` (hash),
variables, and function calls.

**HTML-like (tags only):**

```
{% city
   index=0
   name="San Francisco"
   deleted=false
   coordinates=[1, 4, 9]
   meta={id: "id_123"}
   color=$color /%}
```

**Annotation syntax (required for nodes, also legal on tags):** write the attributes *after* the node, in
their own `{% … %}`.

```
# My heading {% #custom-id .highlight %}

{% table %}
- Function {% width="25%" %}
- Returns  {% colspan=2 %}
- Example  {% align="right" %}
{% /table %}
```

Rules:

- Strings **must** be double-quoted. Escape an inner quote with `\"`. Valid escapes: `\"` `\\` `\n` `\r` `\t`.
- No whitespace around `=` inside an attribute.
- Trailing commas are allowed inside non-empty arrays and hashes, but **not** in function calls.
- Hash keys may be bare identifiers or double-quoted strings.

**Shorthand:** `#id` → `id="…"`, `.cls` → `class="…"`. Multiple `.` shorthands merge into one
space-separated class list. Passing `class` an object keeps only the truthy keys:
`{% class={foo: true, bar: false} %}` → `class="foo"`. An `id` **must start with a letter** or validation
reports `attribute-value-invalid`.

## Variables

Prefixed with `$`. Access nested values with dot notation or bracket segments.

```
Here I am rendering a custom {% $variable %}

Deeply nested: {% $markdoc.frontmatter.title %}

Bracketed: {% $a.b[0].c %}

© {% $currentYear %} Stripe
```

Values must be JSON-serializable (string, number, boolean, null, array, object). Variables are **immutable
during rendering** — there are no loops or assignment. To compute something, use a function or a custom
`transform`.

**Variables do not work in Markdown link destinations.** `[Link]({% $url %})` does not produce a link — the
`{%` breaks the link parse and the line renders as the literal text `[Link](https://…)`. Use a custom
`link` tag instead:

```
{% link href=$variable %}Link{% /link %}
```

(Alternatively, override the `link` **node** with a `transform` that resolves `$name` inside the plain
string `href`, which lets ordinary Markdown link syntax carry a variable prefix.)

## Functions

Look like JavaScript calls. Usable in the body, inside annotations, and as attribute values. Parameters are
comma-separated; **no trailing comma**. Parameters may be positional or named (`fn(a, key=b)`).

```
# {% titleCase($markdoc.frontmatter.title) %}

{% if equals(1, 2) %}
Show the password
{% /if %}

{% tag title=uppercase($key) /%}
```

Built-ins:

| Function | Returns | Example | Notes |
|---|---|---|---|
| `equals` | boolean | `equals($myString, "test")` | Strict `===`, all args compared to the first. Primitives only. |
| `and` | boolean | `and($a, $b)` | Every argument truthy. |
| `or` | boolean | `or($a, $b)` | Any argument truthy. |
| `not` | boolean | `not(or($a, $b))` | First parameter required. |
| `default` | mixed | `default($variable, true)` | Second value when the first is `undefined`. |
| `debug` | string | `debug($anyVariable)` | `JSON.stringify(value, null, 2)` into the document. |

## Truthiness

**Only `undefined`, `null`, and `false` are falsy.** `0`, `""`, `[]` and `{}` are all **truthy** — verified:
`{% if $n %}YES{% /if %}` with `n: 0` renders `YES`. This differs from JavaScript and is the single most
common source of "why is this block showing?".

## Conditionals

```
{% if $myFunVar %}
Only appears if $myFunVar
{% /if %}

{% if $myFunVar %}
A
{% else /%}
B
{% /if %}

{% if $a %}
A
{% else $b /%}
B (when not $a and $b)
{% else /%}
C
{% /if %}
```

`{% else /%}` **must be self-closing**. Writing `{% else %}` produces a cascade of `missing-closing` /
`missing-opening` / `tag-selfclosing-has-children` errors, and the else branch is silently dropped from
the output.

## Tables

Markdoc's `{% table %}` tag reads a Markdown **list** and turns it into table nodes. Each row is separated
by `---`; each list item is a cell. This is what lets cells hold code blocks, lists, and other tags.

````
{% table %}
* Heading 1
* Heading 2
---
* Row 1 Cell 1
* Row 1 Cell 2
---
*
  ```
  puts "code in a cell"
  ```
*
  {% list type="checkmark" %}
  * Bulleted list in a table
  {% /list %}
{% /table %}
````

Variants:

- **No header row** — start the body with `---` immediately after `{% table %}`.
- **Spans** — annotate a cell: `* A cell that spans two columns {% colspan=2 %}` (also `rowspan`).
- **Alignment / width** — annotate a header or cell: `{% align="right" %}`, `{% width="25%" %}`.
- **Conditional rows** — `{% if %}` may wrap rows inside the table body. Only tags listed in the parser's
  `conditionalTags` option (default `['if']`) survive as `tbody` wrappers; any other tag between rows is
  dropped, to prevent invalid HTML.
- Content inside a cell must be indented, otherwise you get a `table-syntax` critical error:
  *"Found … where a list was expected. Make sure all content inside table cells is indented."*

The `table` **tag** only marks the region to parse; the rendered elements come from the `table`/`thead`/
`tbody`/`tr`/`th`/`td` **nodes**. To restyle tables, override those nodes — not the tag.

## Partials

```
{% partial file="header.md" /%}
{% partial file="header.md" variables={sdk: "Ruby", version: 3} /%}
```

Inside the partial, use the variables normally: `{% $sdk %}`. Partials must be registered in
`config.partials` as **parsed ASTs**, keyed by the exact `file` string. See `references/schema.md`.

## Slots

Named content regions passed to a tag as attributes rather than children.

```
{% card %}
{% slot "header" %}
Head content
{% /slot %}
Body content
{% /card %}
```

With `slots: { header: {} }` on the `card` schema, `header` arrives as an **attribute** holding a
renderable tree, and the remaining content stays as children.

**Slots require opt-in at parse time:** `Markdoc.parse(source, { slots: true })`. Without it the
`{% slot %}` tag is treated as an ordinary tag and its content becomes regular children.

## Fenced code blocks

Markdoc **processes tags inside fences by default** — `{% $x %}` inside a ```` ```js ```` block is
interpolated. To keep a fence literal (essential when documenting Markdoc itself), annotate the fence:

````
```js {% process=false %}
{% $notInterpolated %}
```
````

The `fence` node also exposes `content` (the raw text) and `language` (rendered as `data-language`).
Fence annotations accept any attribute your `fence` schema declares (e.g. `title="…"`).

## Comments

```
<!-- comment goes here -->
```

Comments require `allowComments: true` on the tokenizer:

```js
const tokenizer = new Markdoc.Tokenizer({ allowComments: true });
const ast = Markdoc.parse(tokenizer.tokenize(source));
```

Without it the comment is **escaped into the output** as `&lt;!-- comment --&gt;`, not stripped. (The
`@markdoc/next.js` plugin turns comments on by default.)

## Frontmatter

Markdoc is frontmatter-agnostic: it captures everything between the leading `---` fences as a **raw
string** on `ast.attributes.frontmatter` and never parses it. YAML, TOML, JSON, GraphQL — your choice.

```yaml
---
title: Authoring in Markdoc
description: Quickly author amazing content.
date: 2022-04-01
---
```

You must parse it yourself and pass it in `config.variables` before `{% $frontmatter.title %}` resolves.
Forget this and the interpolation silently renders **empty** — no error. See `references/recipes.md`.

## Grammar summary

| Construct | Form |
|---|---|
| Identifier | `[a-zA-Z][-_a-zA-Z0-9]*` |
| Null / Boolean | `null`, `true`, `false` |
| Number | `-?[0-9]+(\.[0-9]+)?` |
| String | `"…"` with escapes `\"` `\\` `\n` `\r` `\t` |
| Array | `[v, v, v]` (optional trailing comma; nestable) |
| Hash | `{key: v, "quoted key": v}` (optional trailing comma; nestable) |
| Variable | `$name`, `$a.b`, `$a["b"]`, `$a[0]` (`@` sigil is reserved, unused) |
| Function | `name(v, v, key=v)` — **no** trailing comma |
| Shorthand attr | `#id` → `id`, `.cls` → `class` |
| Interpolation | `{% $var %}` / `{% fn(x) %}` — inline only |
