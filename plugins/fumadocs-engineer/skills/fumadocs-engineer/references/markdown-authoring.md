<!-- Sources: fumadocs.dev/docs/markdown.mdx, /docs/page-conventions.mdx, /docs/markdown/{math,mermaid,twoslash}.mdx, /docs/mdx/include.mdx — verified 2026-06-11 -->
# Fumadocs Markdown/MDX Authoring Reference

Sections:
- [Frontmatter](#frontmatter)
- [Auto links, Cards, Callouts](#auto-links-cards-callouts)
- [Headings: anchors and TOC settings](#headings-anchors-and-toc-settings)
- [Codeblocks: title, lineNumbers, Shiki transformers](#codeblocks)
- [Codeblock tab groups](#codeblock-tab-groups)
- [NPM command blocks](#npm-command-blocks)
- [Steps via [step]](#steps-via-step)
- [Include (`<include>`)](#include)
- [Page conventions: slugs, folders, meta.json](#page-conventions)
- [Math (KaTeX)](#math-katex)
- [Mermaid](#mermaid)
- [Twoslash](#twoslash)

## Frontmatter

YAML frontmatter; `title` renders as page h1 in Fumadocs UI — do NOT write a `# Heading` h1 in the body.

```mdx
---
title: My Page
description: Best document ever
icon: HomeIcon
---
```

`title`, `description`, `icon` feed the page tree. Icon names must be resolved at runtime via an `icon` handler on `loader()` (Fumadocs ships no icon library). Extend frontmatter via the `schema` option in Fumadocs MDX collections.

## Auto links, Cards, Callouts

- Internal links use the framework `<Link />` (prefetch, no hard reload). External links get `rel="noreferrer noopener" target="_blank"` automatically. Bare URLs auto-link: `https://example.com`.
- Cards / Callout: available without imports (default MDX components). Callout types: `info` (default), `warn`/`warning`, `error`, `success`, `idea`.

```mdx
<Callout title="Title" type="warn">Hello World</Callout>

<Cards>
  <Card href="/docs/x" title="Title">Description</Card>
</Cards>
```

"Further reading" cards from sibling pages:

```tsx
import { getPageTreePeers } from 'fumadocs-core/page-tree';
import { source } from '@/lib/source';

<Cards>
  {getPageTreePeers(source.getPageTree(), '/docs/my-page').map((peer) => (
    <Card key={peer.url} title={peer.name} href={peer.url}>{peer.description}</Card>
  ))}
</Cards>;
```

## Headings: anchors and TOC settings

- Anchors auto-generated and sanitized (`Hello World` -> `hello-world`).
- Custom anchor: `# heading [#my-heading-id]`.
- Hide from TOC: `# Heading [!toc]`.
- TOC-only (not rendered as heading position, useful for component-rendered headings): `# Heading [toc]`.
- Chainable: `# heading [toc] [#my-heading-id]`.
- Link with `/page#my-heading-id`.

## Codeblocks

Shiki highlighting by default (Rehype Code).

````mdx
```js title="My Title"
console.log('Hello World');
```
````

Line numbers: meta `lineNumbers` or `lineNumbers=4` (start at 4). Works with twoslash and transformers:

````mdx
```ts twoslash lineNumbers
const a = 'Hello World';
```
````

Shiki transformer comments (subset of Shiki Transformers supported):

```tsx
<div>Hello World</div> // [!code highlight]
// [!code word:Fumadocs]      <- highlight a word
console.log('hewwo'); // [!code --]
console.log('hello'); // [!code ++]
return new ResizeObserver(() => {}) // [!code focus]
```

## Codeblock tab groups

Adjacent codeblocks with `tab="..."` meta merge into a Tabs UI:

````mdx
```ts tab="Tab 1"
console.log('A');
```

```ts tab="Tab 2"
console.log('B');
```
````

Persist/share group: add `tab-group="my-custom-group"` to the FIRST codeblock.

MDX in tab labels (e.g. `tab="<Rocket /> Tab 2"`) requires opting in:

```ts title="source.config.ts"
import { defineConfig } from 'fumadocs-mdx/config';
export default defineConfig({
  mdxOptions: { remarkCodeTabOptions: { parseMdx: true } },
});
```

(Or `remarkCodeTab` from `fumadocs-core/mdx-plugins` with raw MDX compiler.)

## NPM command blocks

` ```npm ` codeblock auto-generates npm/pnpm/yarn/bun tabs (remark-npm plugin, enabled by default):

````md
```npm
npm i next -D
```
````

Output translates flags per manager (`pnpm add next -D`, `yarn add next --dev`, ...).

## Steps via [step]

With `remark-steps` plugin enabled, suffix headings:

```md
### Installation [step]
### Write Code [step]
### Deploy [step]
```

Or without plugin, Tailwind utilities: `<div className="fd-steps [&_h3]:fd-step">...</div>`.

## Include

**Fumadocs MDX only.** Path relative to the current file.

```mdx
<include>./another.mdx</include>
```

Markdown (`.md`) files have no JSX — use directive syntax `::include[./another.mdx]` and add `remark-directive` to remarkPlugins (and possibly `rehype-raw`).

Non-Markdown files become codeblocks:

```mdx
<include>./script.ts</include>
<include lang="md" meta='title="lib.md"'>page.md</include>
<include cwd lang="tsx" meta='title="lib.ts"'>./script.ts</include>  {/* cwd: resolve from project cwd */}
```

Partial includes:
- Code region: `<include>./code.ts#a</include>` with `//#region a` ... `//#endregion` markers in source.
- Section of a doc: `<include>a.mdx#test</include>` matches `<section id="test">...</section>` in target (Markdown: `:::section{#test}`).
- Under a heading: `<include>a.mdx#included-section</include>` — includes content from `## Included Section` until next heading.

## Page conventions

Applies to content sources using `loader()` (e.g. Fumadocs MDX).

Slugs from file path:

| path | slugs |
| --- | --- |
| `./dir/page.mdx` | `['dir', 'page']` |
| `./dir/index.mdx` | `['dir']` |
| `./(group-name)/page.mdx` | `['page']` (folder group, no slug impact) |

**Root folder** — `meta.json` with `"root": true`; only the active root's items show in sidebar. Fumadocs UI renders root folders as Layout Tabs.

**meta.json** keys: `title`, `description`, `icon`, `defaultOpen`, `collapsible` (default true), `root`, `pages`, `pagesIndex`.

`pages` array (controls order; when specified, unlisted items are EXCLUDED unless `...` present):

| Type | Syntax |
| --- | --- |
| Path | `"./path/to/page"` or `"getting-started"` |
| Separator | `"---Label---"` / `"---[Icon]Label---"` |
| Link | `"[Text](url)"` / `"[Icon][Text](url)"` / `"external:[Text](url)"` |
| Rest | `"..."` (remaining pages, alphabetical) |
| Reversed rest | `"z...a"` |
| Extract | `"...folder"` (inline a folder's items) |
| Except | `"!item"` (exclude from rest) |

```json title="meta.json"
{
  "pages": ["components", "---My Separator---", "...folder", "...", "!file", "[Vercel](https://vercel.com)"]
}
```

Gotcha: the same page URL must NOT appear more than once anywhere in the page tree (Fumadocs locates the active item purely by pathname).

**Folder index**: `index.mdx` makes a folder clickable; override with `"pagesIndex": "overview"` or a Link.

**i18n routing**: `parser: 'dot'` (default, `get-started.cn.mdx`) or `parser: 'dir'` (`en/`, `cn/` folders) in `I18nConfig` from `fumadocs-core/i18n`.

## Math (KaTeX)

```bash
npm install remark-math rehype-katex katex
```

```ts title="source.config.ts"
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { defineConfig } from 'fumadocs-mdx/config';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMath],
    // place first — must run before the syntax highlighter
    rehypePlugins: (v) => [rehypeKatex, ...v],
  },
});
```

Root layout: `import 'katex/dist/katex.css';`

Syntax: inline `$$c = \pm\sqrt{a^2 + b^2}$$`, block via ```` ```math ```` codeblock.

## Mermaid

No built-in wrapper — create your own component and register it as MDX component. Two options:

1. Official `mermaid` (+ `next-themes` for dark mode) — client component using `use()` with a module-level promise cache, `mermaid.initialize({ startOnLoad: false, theme: resolvedTheme === 'dark' ? 'dark' : 'default', ... })`, then `mermaid.render(id, chart)` and `dangerouslySetInnerHTML`. Mount-guard with `useState`/`useEffect` to avoid SSR.
2. `beautiful-mermaid` (3rd party, server-renderable): `renderMermaidSVG(chart, { bg: 'var(--color-fd-background)', fg: 'var(--color-fd-foreground)', interactive: true, transparent: true })`.

Register:

```tsx title="components/mdx.tsx"
import { Mermaid } from '@/components/mdx/mermaid';
// getMDXComponents: { ...defaultMdxComponents, Mermaid, ...components }
```

Usage: `<Mermaid chart="graph TD; A-->B;" />`. To author as ```` ```mermaid ```` codeblocks instead, add `remarkMdxMermaid` from `fumadocs-core/mdx-plugins` to remarkPlugins.

## Twoslash

```bash
npm install fumadocs-twoslash twoslash
```

Next.js: externalize deps — `serverExternalPackages: ['typescript', 'twoslash']` in next.config.

```ts title="source.config.ts"
import { defineConfig } from 'fumadocs-mdx/config';
import { transformerTwoslash } from 'fumadocs-twoslash';
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins';

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: { light: 'github-light', dark: 'github-dark' },
      transformers: [...(rehypeCodeDefaultOptions.transformers ?? []), transformerTwoslash()],
      // Shiki can't lazy-load langs inside Twoslash popups — predefine common ones
      langs: ['js', 'jsx', 'ts', 'tsx'],
    },
  },
});
```

CSS (Tailwind v4 required): `@import 'fumadocs-twoslash/twoslash.css';`

MDX components: `import * as Twoslash from 'fumadocs-twoslash/ui';` spread into getMDXComponents.

Usage: add `twoslash` meta — ```` ```ts twoslash ````. Optional FS cache: `transformerTwoslash({ typesCache: createFileSystemTypesCache() })` from `fumadocs-twoslash/cache-fs`.
