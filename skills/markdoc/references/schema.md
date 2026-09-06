# Schema: config, nodes, tags, attributes, validation

Everything you customize lives in one **config object** passed to `transform` (and `validate`).

```js
/** @type {import('@markdoc/markdoc').Config} */
const config = {
  nodes: {},      // override built-in CommonMark node types
  tags: {},       // register custom {% tags %}
  variables: {},  // values for $variables
  functions: {},  // custom fn() calls
  partials: {},   // { 'file.md': Markdoc.parse(source) }
  validation: {}, // { validateFunctions?, environment?, parents? }
};

const content = Markdoc.transform(ast, config);
```

**Built-ins are merged in automatically.** `transform` and `validate` internally merge `Markdoc.nodes`,
`Markdoc.tags` and `Markdoc.functions` under your config. You never need `tags: { ...Markdoc.tags, mine }`
— `{% if %}`, `{% table %}`, `{% partial %}`, `{% slot %}` and `equals()` stay available regardless.
Anything you list simply **replaces** that one key.

## Schema object (nodes and tags share it)

| Field | Type | Purpose |
|---|---|---|
| `render` | `string` | Output element / React component name. Omit it and the node renders only its children. |
| `children` | `NodeType[]` | Allowed child node types. Validation only (`child-invalid`, level `warning`). |
| `attributes` | `Record<string, SchemaAttribute>` | Declared attributes; anything else is `attribute-undefined`. |
| `slots` | `Record<string, {render?, required?}>` | Named slot regions (needs `parse(src, {slots:true})`). |
| `selfClosing` | `boolean` | `true` → children are an error (`tag-selfclosing-has-children`). |
| `inline` | `boolean` | Forces inline (`true`) or block (`false`) placement; mismatch is `tag-placement-invalid`. |
| `transform` | `(node, config) => RenderableTreeNodes \| Promise<…>` | Full control over the output. Replaces the default behaviour. |
| `validate` | `(node, config) => ValidationError[] \| Promise<…>` | Extra content-level checks. |
| `description` | `string` | Documentation only; surfaced by the language server. |

Default `transform` behaviour when you don't supply one: resolve attributes → transform children → if
`render` is set, return `new Tag(render, attributes, children)`; otherwise return the children array.

## SchemaAttribute

| Field | Type | Purpose |
|---|---|---|
| `type` | `String \| Number \| Boolean \| Object \| Array \| "String" \| … \| CustomClass` | Validated data type. Also accepts an array of types (union). |
| `render` | `boolean \| string` | `false` = do not emit to output; a string renames the output key (e.g. `colspan` → `colSpan`). |
| `default` | any | Applied when the attribute is `undefined`. |
| `required` | `boolean` | Missing → `attribute-missing-required`. |
| `matches` | `RegExp \| string[] \| (config) => …` | Allowed values. |
| `validate` | `(value, config, name) => ValidationError[]` | Per-attribute check. |
| `errorLevel` | `'debug'\|'info'\|'warning'\|'error'\|'critical'` | Severity for this attribute's type/value errors. |
| `description` | `string` | Documentation only. |

**Global attributes.** `class` and `id` are implicitly available on **every** node and tag — you never
declare them. `class` accepts a string or an object (truthy keys are joined); `id` must start with a
letter.

## Built-in nodes

Every CommonMark construct maps to a node type. Override by key in `config.nodes`.

| Node | Default render | Declared attributes (`render:false` marked ✗) |
|---|---|---|
| `document` | `article` | `frontmatter` ✗ |
| `heading` | *(transform → `h1`…`h6`)* | `level` (Number, required) ✗ |
| `paragraph` | `p` | — |
| `image` | `img` | `src` (String, required), `alt`, `title` |
| `fence` | `pre` *(transform)* | `content` (String, required) ✗, `language` (String → `data-language`), `process` (Boolean, default `true`) ✗ |
| `blockquote` | `blockquote` | — |
| `list` | *(transform → `ul`/`ol`)* | `ordered` (Boolean, required) ✗, `start` (Number), `marker` ✗ |
| `item` | `li` | — |
| `hr` | `hr` | — |
| `table` | `table` | — |
| `thead` / `tbody` / `tr` | `thead` / `tbody` / `tr` | — |
| `th` | `th` | `width`, `align`, `colspan` → `colSpan`, `rowspan` → `rowSpan` |
| `td` | `td` | `align`, `colspan` → `colSpan`, `rowspan` → `rowSpan` |
| `strong` / `em` | `strong` / `em` | `marker` ✗ |
| `s` | `s` | — |
| `link` | `a` | `href` (String, required), `title` |
| `code` | `code` *(transform)* | `content` (String, required) ✗ |
| `text` | *(transform → the string)* | `content` (String, required) |
| `inline` | *(children only)* | — |
| `hardbreak` | `br` | — |
| `softbreak` | *(transform → `" "`)* | — |
| `comment` | *(nothing)* | `content` (String, required) |
| `error`, `node` | — | — |

`colspan`/`rowspan` already render as React-correct `colSpan`/`rowSpan` in the renderable tree — the HTML
renderer lowercases them again on output. No post-processing needed.

## Overriding a node — and the `render: false` trap

**Spread the built-in schema instead of rewriting it.** If you redeclare `attributes` wholesale you drop
the `render: false` flags, and internal attributes leak into your DOM.

```js
// ❌ leaks level="2" into the output — the official docs example has this bug
export const heading = {
  children: ['inline'],
  attributes: { id: { type: String }, level: { type: Number, required: true, default: 1 } },
  transform(node, config) { /* … */ }
};

// ✅ keeps level's render:false
import { nodes, Tag } from '@markdoc/markdoc';

export const heading = {
  ...nodes.heading,
  attributes: { ...nodes.heading.attributes, id: { type: String } },
  transform(node, config) {
    const attributes = node.transformAttributes(config);
    const children = node.transformChildren(config);
    const id = generateID(children, attributes);
    return new Tag(`h${node.attributes.level}`, { ...attributes, id }, children);
  }
};
```

The simplest override needs no `transform` at all:

```js
import { nodes } from '@markdoc/markdoc';

const config = { nodes: { table: { ...nodes.table, render: 'Table' } } };
```

## Creating a tag

```js
// ./schema/Callout.markdoc.js
export const callout = {
  render: 'Callout',
  children: ['paragraph', 'tag', 'list'],
  attributes: {
    type: {
      type: String,
      default: 'note',
      matches: ['caution', 'check', 'note', 'warning'],
      errorLevel: 'critical'
    },
    title: { type: String }
  }
};
```

```js
const config = { tags: { callout } };
const content = Markdoc.transform(Markdoc.parse(doc), config);
const children = Markdoc.renderers.react(content, React, { components: { Callout } });
```

The key in `components` must match the `render` string, not the tag name.

## Custom attribute types

A class with optional `validate(value, config, name)` and `transform(value, config)`.

```js
export class DateTime {
  validate(value) {
    if (typeof value !== 'string' || isNaN(Date.parse(value)))
      return [{ id: 'invalid-datetime-type', level: 'critical',
                message: 'Must be a string with a valid date format' }];
    return [];
  }
  transform(value) { return Date.parse(value); }
}

const config = {
  tags: { event: { render: 'Event', attributes: { created: { type: DateTime, required: true } } } }
};
```

`validate` is **skipped when the value is still an AST node** — i.e. when the author wrote `created=$var`
or `created=fn()`. Custom types only see resolved literals.

## Custom functions

```js
const includes = {
  parameters: { 0: { type: Array, required: true }, 1: {} },
  returns: Boolean,
  transform(parameters, config) {
    const [array, value] = Object.values(parameters);
    return Array.isArray(array) ? array.includes(value) : false;
  }
};

const config = { functions: { includes } };
```

`parameters` and `returns` are **only checked when `validation: { validateFunctions: true }`** is set —
off by default.

⚠️ **Do not declare `returns` on a function you call as an `{% if %}` / `{% else %}` condition.** With
`validateFunctions: true`, the validator compares `returns` against the condition attribute's declared
type — which is the internal `ConditionalAttributeType` class — and nothing can ever match it:

```
{% if includes($countries, "US") %}…{% /if %}
→ attribute-type-invalid: Attribute 'primary' must be type of 'ConditionalAttributeType'
```

The document renders correctly; only validation is wrong. Omit `returns` on condition functions (keep
`parameters`, which validates fine), or leave `validateFunctions` off.

## Partials

```js
const config = {
  partials: { 'header.md': Markdoc.parse('# My header') }
};
```

Keys are the exact `file="…"` strings. Values are parsed `Ast.Node`s (or arrays of them). Missing key →
`attribute-value-invalid`: *"Partial `x` not found. The 'file' attribute must be set in `config.partials`"*.

**`Markdoc.validate` does not descend into partials.** Validating a document that includes a partial
returns no errors from the partial's content — verified. Validate each partial AST separately in your
build. `transform` *does* expand them, with `variables={…}` merged over `config.variables` for that
partial's scope only.

## Slots

```js
const config = { tags: { card: { render: 'Card', slots: { header: { required: true } } } } };
const ast = Markdoc.parse(source, { slots: true }); // required
```

Slot content is transformed and attached as an **attribute** named after the slot (or `slot.render` when
that is a string; `render: false` hides it). Remaining content stays in `children`.

## Validation error catalog

`Markdoc.validate(ast, config)` returns `{ type, lines, location, error: { id, level, message } }[]`.
**`lines` and `location.start.line` are 0-based** — add 1 for editor-style output.

| `id` | Level | Cause |
|---|---|---|
| `tag-undefined` | critical | `{% foo %}` with no `config.tags.foo` |
| `node-undefined` | critical | Node type with no schema |
| `missing-closing` / `missing-opening` | critical | Unbalanced tags |
| `tag-placement-invalid` | critical | `inline` mismatch |
| `tag-selfclosing-has-children` | critical | Content inside a `selfClosing` tag |
| `table-syntax` | critical | Non-list content in a `{% table %}` body (usually missing indentation) |
| `attribute-undefined` | error | Attribute not declared in the schema |
| `attribute-missing-required` | error | Required attribute absent |
| `attribute-type-invalid` | `errorLevel` \|\| error | Wrong type |
| `attribute-value-invalid` | `errorLevel` \|\| error | Failed `matches`, bad `id`, missing partial (which then renders as **nothing** — an `error`, so a `critical`-only build gate lets it ship) |
| `variable-undefined` | error | `$x` not in `config.variables`. Two blind spots: **only reported when `config.variables` is provided at all**, and **never for a variable inside a function call** (`{% up($nope) %}`, `v=up($nope)` both validate clean) |
| `slot-undefined` / `slot-missing-required` | error | Slot not declared / required slot absent |
| `function-undefined` | critical | Unknown `fn()` — requires `validateFunctions: true` |
| `parameter-undefined` / `parameter-type-invalid` / `parameter-missing-required` | error | Function params — requires `validateFunctions: true` |
| `child-invalid` | warning | Child type not in `children` |
| `duplicate-attribute` | warning | Same attribute set twice via annotations |

`config.validation.parents` is populated by the walker and available to your `validate` functions;
`config.validation.environment` is a free-form string you can branch on.
