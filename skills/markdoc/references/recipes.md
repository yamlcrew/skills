# Recipes

Working patterns for the things Markdoc deliberately leaves to you.

## Wiring frontmatter (core library)

Markdoc hands you frontmatter as a raw string and stops there. Parse it, then pass it as a variable —
otherwise `{% $frontmatter.title %}` silently renders empty.

```js
import yaml from 'js-yaml'; // or toml, JSON.parse, …

const ast = Markdoc.parse(source);
const frontmatter = ast.attributes.frontmatter ? yaml.load(ast.attributes.frontmatter) : {};
const config = { variables: { frontmatter } };
```

Pick one name and stay consistent: `$frontmatter.x` in core, `$markdoc.frontmatter.x` under
`@markdoc/next.js`.

## A complete build script

Parses partials and pages, validates both, renders HTML, fails the build on `critical`.

```js
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const Markdoc = require('@markdoc/markdoc');

const tokenizer = new Markdoc.Tokenizer({ allowComments: true });
const parseFile = (file) =>
  Markdoc.parse(tokenizer.tokenize(fs.readFileSync(file, 'utf8')), { file: path.basename(file) });

// Partials must exist in config before transform; keys are the literal file="…" strings.
const partials = Object.fromEntries(
  fs.readdirSync('content/partials').map((f) => [f, parseFile(path.join('content/partials', f))])
);

const ast = parseFile('content/page.md');
const frontmatter = ast.attributes.frontmatter ? yaml.load(ast.attributes.frontmatter) : {};

const config = {
  tags: { callout },
  nodes: { heading },
  functions: { uppercase },
  variables: { frontmatter },
  partials,
  validation: { validateFunctions: true } // opt-in: checks fn parameters/returns
};

// validate() does NOT descend into partials — check each one explicitly.
const errors = [ast, ...Object.values(partials)].flatMap((node) => Markdoc.validate(node, config));

for (const e of errors) {
  const where = `${e.location?.file ?? '?'}:${e.lines[0] + 1}`; // lines are 0-based
  console.error(`${where} ${e.error.level} [${e.error.id}] ${e.error.message}`);
}
if (errors.some((e) => e.error.level === 'critical')) process.exit(1);

const html = Markdoc.renderers.html(Markdoc.transform(ast, config));
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/page.html', html);
```

If any schema `transform`/`validate` is async, `await` the `transform` and `validate` calls.

## Heading anchors

```js
import { nodes, Tag } from '@markdoc/markdoc';

function generateID(children, attributes) {
  if (attributes.id && typeof attributes.id === 'string') return attributes.id;
  return children
    .filter((child) => typeof child === 'string')
    .join(' ')
    .replace(/[?]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

export const heading = {
  ...nodes.heading,                                       // keeps level's render:false
  attributes: { ...nodes.heading.attributes, id: { type: String } },
  transform(node, config) {
    const attributes = node.transformAttributes(config);
    const children = node.transformChildren(config);
    return new Tag(`h${node.attributes.level}`, { ...attributes, id: generateID(children, attributes) }, children);
  }
};
```

Authors can always override with an annotation: `# My header {% #my-id %}`.

## Table of contents

Walk the **renderable tree** after `transform` — headings already carry their `id` by then.

```js
function collectHeadings(node, sections = []) {
  if (node) {
    if (node.name?.match(/h\d/)) {
      const title = node.children[0];
      if (typeof title === 'string') sections.push({ ...node.attributes, title });
    }
    for (const child of node.children ?? []) collectHeadings(child, sections);
  }
  return sections;
}

const content = Markdoc.transform(ast, config);
const headings = collectHeadings(content);
```

```jsx
function TableOfContents({ headings }) {
  const items = headings.filter((item) => [2, 3].includes(item.level));
  return (
    <nav><ul>
      {items.map((item) => <li key={item.title}><a href={`#${item.id}`}>{item.title}</a></li>)}
    </ul></nav>
  );
}
```

## Syntax highlighting

Override the `fence` node and let a component do the highlighting.

```js
const fence = { render: 'Fence', attributes: { language: { type: String } } };

export function Fence({ children, language }) {
  return <Prism key={language} component="pre" className={`language-${language}`}>{children}</Prism>;
}

Markdoc.renderers.react(Markdoc.transform(ast, { nodes: { fence } }), React, { components: { Fence } });
```

Remember fences interpolate Markdoc tags by default — code samples containing `{% … %}` need
` ```js {% process=false %} `.

## Loops

Markdoc has no loop syntax by design. Iterate inside a `transform` (or inside the React component).

```js
import { Tag } from '@markdoc/markdoc';

export const group = {
  render: 'Group',
  attributes: { items: { type: Array } },
  transform(node, config) {
    const attributes = node.transformAttributes(config);
    const children = node.transformChildren(config);
    for (const item of attributes.items) { /* build extra children */ }
    return new Tag('Group', attributes, children);
  }
};
```

```
{% group items=[1, 2, 3] /%}
```

## Switch / case

Two tags plus a `transform` that picks one child. `render: false` on the primary attribute keeps it out of
the output.

⚠️ **The version of this example on markdoc.dev renders nothing for any input.** It compares against
`node.transformAttributes(config).primary`, and `transformAttributes` *omits every `render: false`
attribute* — so the comparison value is always `undefined`. Read the raw attribute instead: by the time a
schema `transform` runs, `node.attributes` is already resolved.

```js
import { transformer } from '@markdoc/markdoc';

const config = {
  tags: {
    switch: {
      attributes: { primary: { render: false } },
      transform(node, config) {
        // node.attributes.primary — NOT transformAttributes(), which drops render:false keys
        const child = node.children.find((c) => c.attributes.primary === node.attributes.primary);
        return child ? transformer.node(child, config) : [];
      }
    },
    case: { attributes: { primary: { render: false } } }
  }
};
```

Write the cases in **block form** — blank lines around each tag — so they stay direct children of
`switch` instead of being merged into one paragraph:

```
{% switch $item %}

{% case 1 %}
Case 1
{% /case %}

{% case 2 %}
Case 2
{% /case %}

{% /switch %}
```

Verified: `$item = 2` renders `<p>Case 2</p>`, `$item = 9` renders nothing.

## Tabs

The parent tag reads its children's labels during `transform` and passes them down as an attribute.

```js
import { Tag } from '@markdoc/markdoc';

const tabs = {
  render: 'Tabs',
  transform(node, config) {
    const children = node.transformChildren(config); // transform once, reuse
    const labels = children
      .filter((child) => child && child.name === 'Tab')
      .map((tab) => (typeof tab === 'object' ? tab.attributes.label : null));
    return new Tag(this.render, { labels }, children);
  }
};

const tab = { render: 'Tab', attributes: { label: { type: String } } };
```

**Block form is required.** Written inline, the tabs are merged into a single `paragraph` node, the
`.filter(child.name === 'Tab')` matches nothing, and `labels` comes back `[]` — silently, with a valid
document:

```
{% tabs %}

{% tab label="React" %}
React content
{% /tab %}

{% tab label="HTML" %}
HTML content
{% /tab %}

{% /tabs %}
```

The `Tabs` component holds the selected label in state and shares it through context; `Tab` renders `null`
unless its label matches.

## Generating Markdoc from data

```js
const list = new Markdoc.Ast.Node('list', { ordered: false },
  DATA.map((point) => new Markdoc.Ast.Node('item', {}, [
    new Markdoc.Ast.Node('inline', {}, [
      new Markdoc.Ast.Node('text', { content: point.join(', ') }, [])
    ])
  ])));

fs.writeFileSync('generated.md', Markdoc.format(list));
```

`format` is also a prettifier: `Markdoc.format(Markdoc.parse(source))` normalizes an existing document.

## Validation in CI

```js
const errors = Markdoc.validate(ast, config);
const fatal = errors.filter((e) => ['critical', 'error'].includes(e.error.level));
if (fatal.length) { fatal.forEach(print); process.exit(1); }
```

Useful additions for a docs repo:

- `validation: { validateFunctions: true }` to catch typo'd function names and bad parameters. Drop
  `returns` from any function used as an `{% if %}` condition first, or it reports a false
  `attribute-type-invalid` on `primary` (see `references/schema.md`).
- A `link` node `validate` that rejects relative URLs, or a custom `src` attribute type that requires
  `https://`.
- Pass `config.variables` (even an empty-ish object) so `variable-undefined` is reported at all — with no
  `variables` key, unknown variables pass silently. Note it still never fires for a variable inside a
  function call, so a clean `validate` does not prove every variable resolves.
- Gate on `error` as well as `critical` if a missing partial should fail the build — it reports at `error`
  and otherwise renders as nothing.
