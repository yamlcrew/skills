# Integrations

## Next.js — `@markdoc/next.js`

The official plugin. Renders `.md` / `.mdoc` files as Next.js pages. Starter:
<https://github.com/markdoc/markdoc-starter>.

**This section is verified against `@markdoc/next.js` 0.5.0 source; markdoc.dev still documents 0.3.x and
is wrong in places (noted below).**

```shell
npm install @markdoc/next.js @markdoc/markdoc
```

```js
// next.config.js
const withMarkdoc = require('@markdoc/next.js');

module.exports = withMarkdoc(/* options */)({
  pageExtensions: ['md', 'mdoc', 'js', 'jsx', 'ts', 'tsx']
});
```

### Plugin options

| Option | Default | Meaning |
|---|---|---|
| `schemaPath` | `'./markdoc'` | Directory holding your schema. |
| `mode` | `'static'` | `'static'` → `getStaticProps`, `'server'` → `getServerSideProps` (Pages Router only). |
| `extension` | `/\.(md\|mdoc)$/` | Which files the loader claims. |
| `options` | `{ allowComments: true }` | Passed to the `Tokenizer`, plus `slots` which goes to `parse`. |
| `dir` | Next's root | Project root used to resolve `schemaPath`. |

⚠️ The docs say comments are enabled with `tokenizerOptions: { allowComments: true }`. In 0.5.0 the key is
**`options`**, and comments are **on by default** — but only while you pass no `options` object at all.
The moment you set e.g. `options: { slots: true }`, the default is gone and you must re-add
`allowComments: true`.

Turbopack is supported: when `nextConfig.turbopack` exists the plugin registers matching `rules`.

### Schema directory

```
markdoc/
├── config.js        # optional: full config object (wins over the files below)
├── tags.js          # or tags/index.js
├── nodes.js         # or nodes/index.js
├── functions.js     # or functions/index.js
└── partials/        # {% partial file="header.md" /%} loads from here, recursively
```

Each file exports named registrations. **`render` may be the React component itself** — the plugin derives
a display name and wires the `components` map for you:

```js
// markdoc/tags.js
import { Button } from '../components/Button';

export const button = { render: Button, attributes: { href: { type: String } } };
```

Kebab-case names need a default export object:

```js
export default { 'special-button': { render: SpecialButton, attributes: { href: { type: String } } } };
```

```js
// markdoc/nodes.js — override a built-in node
import Link from 'next/link';
export const link = { render: Link, attributes: { href: { type: String } } };
```

```js
// markdoc/functions.js
export const upper = {
  transform(parameters) {
    const s = parameters[0];
    return typeof s === 'string' ? s.toUpperCase() : s;
  }
};
```

For full control (and for the VS Code language server), export the whole config from `markdoc/config.js`:

```js
import tags from './tags';
import nodes from './nodes';
import functions from './functions';

export default { tags, nodes, functions /* variables, partials, … */ };
```

### Frontmatter

The plugin parses frontmatter as **YAML** and injects it as `$markdoc.frontmatter` — a namespace you
cannot override.

```md
---
title: Using the Next.js plugin
---

# {% $markdoc.frontmatter.title %}
```

It is also on `pageProps.markdoc` alongside `content` and `file.path`:

```js
// pages/_app.js
import Layout from '../components/Layout';

export default function App({ Component, pageProps }) {
  return (
    <Layout frontmatter={pageProps.markdoc.frontmatter}>
      <Component {...pageProps} />
    </Layout>
  );
}
```

**App Router:** pages become async server components, and frontmatter under a `nextjs:` key is re-exported
as Next.js page exports — by default `metadata` and `revalidate`:

```yaml
---
nextjs:
  metadata:
    title: My page
---
```

### Built-in Next.js tags

Re-export what you need from `@markdoc/next.js/tags` in your schema:

```js
// markdoc/tags/Next.markdoc.js
export { comment, head, image, link, script } from '@markdoc/next.js/tags';
// or: export * from '@markdoc/next.js/tags';
```

| Tag | Renders | Required attributes |
|---|---|---|
| `{% comment %}` | nothing (content-level comment) | — |
| `{% head %}` | `next/head` — register your own `meta`/`title` tags | — |
| `{% image /%}` | `next/image` | `src`, `alt`, `width`, `height` |
| `{% link %}` | `next/link` | `href` |
| `{% script /%}` | `next/script` | `src` |

`{% image %}` exists in 0.5.0 but is missing from markdoc.dev.

### Built-in tag placement gotcha

`partial` ships with `inline: false` and `table` is block-only. If your site uses them inline, relax the
constraint in your schema — this is what markdoc.dev itself does:

```js
import { tags } from '@markdoc/markdoc';
export const partial = { ...tags.partial, inline: undefined };
export const table = { ...tags.table, inline: undefined };
```

## React (without Next.js)

Split the work: `parse` + `transform` on the server, `renderers.react` on the client. The renderable tree
is plain JSON, so it travels as the response body.

```js
// server.js
const express = require('express');
const Markdoc = require('@markdoc/markdoc');
const callout = require('./schema/Callout.markdoc');
const heading = require('./schema/heading.markdoc');

app.get('/markdoc', (req, res) => {
  const ast = contentManifest[req.query.path];         // pre-parsed at boot
  const config = { tags: { callout }, nodes: { heading }, variables: {} };
  return res.json(Markdoc.transform(ast, config));
});
```

```jsx
// src/App.js
import React from 'react';
import Markdoc from '@markdoc/markdoc';
import { Callout } from './Callout';

export default function App() {
  const [content, setContent] = React.useState(null);

  React.useEffect(() => {
    fetch(`/markdoc?` + new URLSearchParams({ path: location.pathname }),
          { headers: { Accept: 'application/json' } })
      .then(r => r.json()).then(setContent);
  }, []);

  if (!content) return <p>Loading…</p>;
  return Markdoc.renderers.react(content, React, { components: { Callout } });
}
```

Only `renderers` needs to reach the browser — import it separately if you want to keep the parser out of
the client bundle.

Example repo: <https://github.com/markdoc/docs/tree/main/examples/react-nodejs>.

## HTML and Web Components

`renderers.html` returns a string, so custom elements need no framework wiring — render a custom element
name and define it with `lit` (or vanilla) on the client.

```js
// schema/Callout.markdoc.js
module.exports = {
  render: 'markdoc-callout',
  children: ['paragraph'],
  attributes: { type: { type: String, default: 'note', matches: ['check', 'error', 'note', 'warning'] } }
};
```

```js
app.get('/docs/:page', (req, res) => {
  const content = Markdoc.transform(contentManifest[req.params.page], config);
  res.setHeader('Content-Type', 'text/html');
  res.send(TEMPLATE.replace('{{ CONTENT }}', Markdoc.renderers.html(content) || ''));
});
```

Ship a bundle that registers the custom elements (`customElements.define('markdoc-callout', …)`) and the
HTML hydrates itself.

Example repo: <https://github.com/markdoc/docs/tree/main/examples/html-nodejs>.

## Other frameworks

There is no official Vue/Svelte renderer. Write one — a renderer is a pure function over the renderable
tree (see `references/api.md`). For Astro, use the community-maintained `@astrojs/markdoc` integration.

## Tooling

- **VS Code language server** — <https://github.com/markdoc/language-server>. It reads the config exported
  from `markdoc/config.js`, so keep that file authoritative if you want editor validation and completion.
- **Playground** — <https://markdoc.dev/sandbox> (`?mode=ast`, `?mode=transform`, `?mode=preview`) to
  inspect the AST and renderable tree for any snippet.
