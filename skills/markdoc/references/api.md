# Markdoc API (`@markdoc/markdoc` 0.5.9)

## Install and import

```shell
npm install @markdoc/markdoc          # add react @types/react for the React renderer
```

```js
const Markdoc = require('@markdoc/markdoc');   // CJS
import Markdoc from '@markdoc/markdoc';        // ESM
```

Minimum `tsconfig.json` for TypeScript: `moduleResolution: "node"`, `target: "esnext"` (es2015+),
`esModuleInterop: true`. Node >= 14.7. React is an optional peer dependency.

## The three phases

```
source ──parse──▶ Ast.Node ──transform──▶ RenderableTreeNode ──render──▶ HTML string / React elements
                     └────── validate ──▶ ValidateError[]
```

`validate` is an optional side branch, not a phase — run it in CI, tests, or an editor extension.

### `parse(content, args?) => Ast.Node`

```ts
parse(content: string | Token[], args?: string | ParserArgs): Node
```

A bare string is tokenized with a default `Tokenizer`. Pass tokens yourself when you need tokenizer
options. A string `args` is shorthand for `{ file }`.

| `ParserArgs` | Default | Meaning |
|---|---|---|
| `file` | — | Filename attached to every node's `location` (essential for multi-file error messages). |
| `slots` | `false` | Enable `{% slot "name" %}` handling. |
| `location` | `true` | Set `false` to skip `lines`/`location` bookkeeping. |
| `conditionalTags` | `['if']` | Tags allowed to wrap rows inside a `{% table %}` body. |

The AST is plain JSON plus helper methods, so it round-trips through `JSON.stringify` /
`Markdoc.Ast.fromJSON`.

### `transform(node, config?) => RenderableTreeNode`

Resolves variables and functions into scalars, applies node/tag `transform` functions, and returns a
serializable tree of `Tag` objects and scalars — safe to send over the wire and render on a client.

```js
const content = Markdoc.transform(ast, config);
```

If any schema `transform` is `async`, `transform` returns a **Promise** — `await` it.

### `validate(node, config?) => ValidateError[]`

```js
for (const e of Markdoc.validate(ast, config)) {
  console.error(`${e.location?.file ?? file}:${e.lines[0] + 1} ${e.error.level} ${e.error.id} — ${e.error.message}`);
}
```

`lines` and `location.start.line` are **0-based**. Returns a Promise if any schema `validate` is async.
See `references/schema.md` for the full error-id catalog.

### `renderers.html(content) => string`

Escapes text, lowercases attribute names, and honours the HTML void-element list. A tag with no `name`
renders only its children — which is how `document` → `<article>` and `inline` → nothing work.

### `renderers.react(content, React, options) => React.Node`

```js
Markdoc.renderers.react(content, React, { components: { Callout } });
```

- **Capitalized** tag names are looked up in `components`; lowercase names render as DOM elements.
  `components` may also be a function `(name) => Component`.
- `class` is rewritten to `className`.
- Attribute values are deep-rendered, so a `Tag` inside an attribute (e.g. a slot) becomes elements.
- Works with Preact — pass Preact as the `React` argument.

### `renderers.reactStatic(content, options) => string`

Returns **JavaScript source** for an arrow function `({components}) => React.createElement(...)`, for
build-time transpilation.

⚠️ In the published 0.5.9 bundle the default path throws `Error: resolveTagName must be named tagName`
(the bundler renamed the internal helper). Pass your own function that is literally named `tagName`:

```js
function tagName(name, components) {
  return typeof name !== 'string' ? 'Fragment'
    : name[0] !== name[0].toUpperCase() ? name
    : components instanceof Function ? components(name) : components[name];
}
const code = Markdoc.renderers.reactStatic(content, { resolveTagName: tagName });
```

### Writing your own renderer

A renderer is just a function over the renderable tree. Walk `Tag.isTag(node) ? {name, attributes, children} : scalar`
and emit Vue, Svelte, plain text, or anything else.

### `format(node, options?) => string`

Serializes an AST **back to Markdoc source** — for prettifying documents or generating content from data.

```js
const list = new Markdoc.Ast.Node('list', { ordered: false },
  DATA.map(p => new Markdoc.Ast.Node('item', {}, [
    new Markdoc.Ast.Node('inline', {}, [
      new Markdoc.Ast.Node('text', { content: p.join(', ') }, [])
    ])
  ])));

Markdoc.format(list);   // "- 34.0522, -118.2437\n- …"
```

| Option | Default | Meaning |
|---|---|---|
| `allowIndentation` | `false` | Indent nested tag bodies. |
| `maxTagOpeningWidth` | `80` | Wrap attributes past this width. |
| `orderedListMode` | `'increment'` | `'increment'` → `1. 2. 3.`; `'repeat'` → `1. 1. 1.`. |

### `resolve(node, config) => Ast.Node`

Resolves variables/functions in attributes without transforming. `transform` calls it internally; you
rarely need it directly.

## `Tokenizer`

```js
const tokenizer = new Markdoc.Tokenizer({ allowComments: true });
const ast = Markdoc.parse(tokenizer.tokenize(source));
```

Accepts all markdown-it options plus:

| Option | Default | Effect |
|---|---|---|
| `allowComments` | `false` | `<!-- … -->` becomes a `comment` node (renders nothing). Otherwise it is escaped into the output. |
| `allowIndentation` | `false` | **Inert in 0.5.9** — indented tag bodies already work because the `code` rule is always disabled. The option only affects `Markdoc.format` output. |
| `allowLinkValidation` | `false` | Enable the link plugin. |
| `linkValidationOptions` | `{ validatedProtocols: ['http','https'] }` | Protocols checked by that plugin. |

The tokenizer always disables `lheading` (setext headings) and `code` (indented code blocks).

## `Ast.Node`

```js
new Markdoc.Ast.Node(type, attributes, children, tag)
```

| Member | Notes |
|---|---|
| `type` | `NodeType` — `'document'`, `'heading'`, `'tag'`, `'text'`, … |
| `tag` | Tag name when `type === 'tag'` |
| `attributes`, `children`, `slots`, `annotations` | Document data |
| `errors`, `lines`, `location`, `inline` | Parse metadata (`lines` 0-based) |
| `*walk()` | Generator over slots then children, depth-first |
| `push(node)` | Append a child |
| `resolve(config)` | Copy with attributes/slots resolved |
| `findSchema(config)` | The schema this node will use |
| `transformAttributes(config)` | Attributes as the renderer will see them (honours `render`, defaults, custom-type `transform`) |
| `transformChildren(config)` | `RenderableTreeNode[]` |
| `transform(config)` | Full transform of this node |

Inside a custom `transform`, use `node.attributes.x` for the **raw** value and
`node.transformAttributes(config).x` for the **rendered** value.

**`transformAttributes` omits every `render: false` attribute** — it returns what the renderer will emit,
not what the author wrote. Any attribute you declared with `render: false` (a `primary` selector, a
`level`, an internal flag) is reachable only through `node.attributes`. Getting this wrong yields
`undefined` and a silently empty transform; it is the bug in markdoc.dev's switch/case example.

`node.attributes` is **already resolved** by the time a schema `transform` runs — `Markdoc.transform`
resolves variables and functions before dispatching to schemas, so you do not need to resolve them again.

## `Tag`

```js
new Markdoc.Tag(name = 'div', attributes = {}, children = []);
Markdoc.Tag.isTag(value);   // type guard, checks $$mdtype === 'Tag'
```

## Instance API

```js
const markdoc = new Markdoc(config);
markdoc.parse(source);
markdoc.transform(ast);      // config is bound
markdoc.validate(ast);
markdoc.resolve(ast);
```

## Full export list

`parse` · `transform` · `validate` · `resolve` · `format` · `renderers` (`html`, `react`, `reactStatic`) ·
`Ast` (`Node`, `Function`, `Variable`, `isAst`, `isFunction`, `isVariable`, `getAstValues`, `resolve`,
`fromJSON`) · `Node` · `Tag` · `Tokenizer` · `nodes` · `tags` · `functions` · `globalAttributes` ·
`transforms` · `transformer` · `validator` · `parseTags` · `truthy` · `createElement`

`Markdoc.truthy(value)` is the exported falsiness rule (`false`, `undefined`, `null` only) — reuse it in
custom functions so your logic matches `{% if %}`.
