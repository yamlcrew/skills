<!-- Sources: fumadocs.dev/docs/headless{,.mdx}: index, source-api, source-api/source, page-tree, components{,/breadcrumb,/toc,/link}, utils{,/get-toc,/git-last-edit,/page-tree}, mdx{,/headings,/rehype-code,/remark-admonition,/remark-image,/remark-npm,/remark-steps,/structure,/remark-llms} — verified 2026-06-11 -->
# Fumadocs Core (headless) Reference

## Contents
1. [Overview & framework providers](#1-overview--framework-providers)
2. [Loader API (`loader()`)](#2-loader-api)
3. [Sources: Static / Dynamic / Multiple](#3-sources)
4. [Dynamic loader & revalidation](#4-dynamic-loader--revalidation)
5. [Client API (non-RSC serialization)](#5-client-api-non-rsc)
6. [Page tree structure](#6-page-tree-structure)
7. [Page tree utils](#7-page-tree-utils)
8. [Headless components: Breadcrumb, TOC, Link](#8-headless-components)
9. [Content utils: getTableOfContents, getGithubLastEdit](#9-content-utils)
10. [MDX plugins (remark/rehype)](#10-mdx-plugins)

## 1. Overview & framework providers

`fumadocs-core` = server-side functions + headless components, usable on any React framework without Fumadocs UI. Install: `npm install fumadocs-core` (no other deps required).

Some components need a framework provider at the root (Fumadocs UI's `<RootProvider />` already includes it on Next.js):

```tsx
import { NextProvider } from 'fumadocs-core/framework/next';
import { ReactRouterProvider } from 'fumadocs-core/framework/react-router';
import { TanstackProvider } from 'fumadocs-core/framework/tanstack';
import { WakuProvider } from 'fumadocs-core/framework/waku';
// wrap children with the one matching your framework
```

## 2. Loader API

`loader()` turns content sources into a unified interface: generates slugs + page tree, assigns URLs, exposes utilities. **Server-side API, in-memory storage — not build-time magic, not browser compatible.**

```ts
import { loader } from 'fumadocs-core/source';
import { docs } from 'collections/server';

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: '/docs',
});
```

Options:

```ts
loader({
  baseUrl: '/docs',
  // custom URL generation (i18n-aware)
  url(slugs, locale) {
    if (locale) return '/' + [locale, 'docs', ...slugs].join('/');
    return '/' + ['docs', ...slugs].join('/');
  },
  // custom slugs per file; return undefined to keep default
  slugs(file) {
    return ['my', 'slug'];
  },
  // resolve icon names (from frontmatter/meta.json) to ReactElement
  icon(icon) {
    if (!icon) return; // may return a default icon
    if (icon in icons) return createElement(icons[icon as keyof typeof icons]);
  },
  i18n, // from '@/lib/i18n' — generates a page tree per locale, missing translations fall back to fallbackLanguage
});
```

There is also a ready-made `lucideIconsPlugin` exported from `'fumadocs-core/source/lucide-icons'`.

Output methods:

```ts
source.getPage(['slug', 'of', 'page']);          // + optional locale arg
source.getPages();                                // + optional locale arg
source.getPageTree();                             // + optional locale arg
source.getNodePage(pageNode);                     // tree node -> original page
source.getNodeMeta(folderNode);                   // tree node -> original meta file
source.generateParams();                          // for Next.js generateStaticParams; params: slug: string[], lang (i18n)
source.getLanguages();                            // i18n: language -> pages entries
```

## 3. Sources

Multiple sources — pass a record; discriminate pages with `page.type`:

```ts
export const source = loader(
  { docs: docs.toFumadocsSource(), openapi: blog.toFumadocsSource() },
  { baseUrl: '/docs' },
);
const page = source.getPage(['...']);
if (page.type === 'docs') { /* page.data narrowed per source */ }
```

Custom static source — `StaticSource<{ metaData; pageData }>` with a `files` array of `{ type: 'page' | 'meta', path, data }`. **Paths must be virtual** (`file.mdx`, `content/file.mdx`); `./file.mdx` and absolute paths are not allowed.

```ts
import type { StaticSource } from 'fumadocs-core/source';

export function createMySource(): StaticSource<{
  metaData: { title: string; pages: string[] };
  pageData: { title: string; description?: string };
}> {
  return {
    files: [
      { type: 'page', path: 'folder/index.mdx', data: { title: 'Hello World' } },
      { type: 'meta', path: 'meta.json', data: { title: 'Docs', pages: ['folder'] } },
    ],
  };
}
```

Dynamic source — `DynamicSource<...>` with async `files()` plus optional `configure(loader)` hook (call `loader.revalidate()` on external events). Only consumable by `dynamicLoader()`.

## 4. Dynamic loader & revalidation

```ts
import { dynamicLoader } from 'fumadocs-core/source/dynamic';

const source = dynamicLoader(createMySource(), { baseUrl: '/docs' });
const docs = await source.get();      // returns a normal loader object
docs.getPage(['...']);

source.invalidate();                  // clear cache
await source.revalidate();            // refresh cache
source.invalidate('docs');            // per-source in multi-source setups
await source.revalidate('docs');
```

## 5. Client API (non-RSC)

Loader API shines in RSC (JSX crosses server/client boundary). For non-RSC frameworks there is a serialization layer:

```ts
// server / framework loader
const pageTree = source.getPageTree();
return { pageTree: await source.serializePageTree(pageTree) };
```

```tsx
// client
import { useFumadocsLoader } from 'fumadocs-core/source/client';
const { pageTree } = useFumadocsLoader(useLoaderData());
return <DocsLayout tree={pageTree}>...</DocsLayout>;
```

## 6. Page tree structure

Page tree = serializable tree of navigation (sidebar, breadcrumb). Sent to the client — never put sensitive/large data or functions in it. `$ref` properties are internal; ignore when hardcoding.

```ts
import type * as PageTree from 'fumadocs-core/page-tree';
const tree: PageTree.Root = { name: 'Docs', children: [] };
```

Node types:
- **Root**: `{ type?: 'root', name: ReactNode (required), description?, children: PageTree.Node[], fallback?: PageTree.Root (tree shown only when opened), $id? }`
- **Page**: `{ type: 'page', name: ReactNode, url: string, external?: boolean (force <a>; auto-detected from url otherwise), description?, icon?: ReactNode, $id? }` — external URLs supported.
- **Folder**: `{ type: 'folder', name, children, root?: boolean, defaultOpen?: boolean, collapsible?: boolean, index?: PageTree.Item, description?, icon?, $id? }`
- **Separator**: `{ type: 'separator', name?: ReactNode, icon?, $id? }`

Icons are `ReactElement`s, supported on pages and folders. `$id` is unique across all page trees, even across locales.

## 7. Page tree utils

```ts
import {
  findNeighbour,   // (tree, '/url') -> prev/next pages
  findSiblings,    // (tree, '/url') -> sibling nodes
  getPageTreeRoots,// (tree) -> list of root folders
  findParent,      // (tree, '/url') -> parent node
  findPath,        // (tree.children, matcher) -> path to first matching node
  type Root,
} from 'fumadocs-core/page-tree';

const path = findPath(tree.children, (node) => node.type === 'page' && node.url === '/url/to/page');
```

## 8. Headless components

### Breadcrumb (hook)
```tsx
'use client';
import { useBreadcrumb } from 'fumadocs-core/breadcrumb';
import { usePathname } from 'next/navigation'; // or your framework's hook

const items = useBreadcrumb(pathname, tree); // BreadcrumbItem[]: { name: ReactNode; url?: string }
```
If a folder has an index page, the index is used as the breadcrumb item. Returns `[]` when no match (render nothing).

### TOC
```tsx
import { AnchorProvider, ScrollProvider, TOCItem, type TOCItemType } from 'fumadocs-core/toc';
import { useRef } from 'react';

export function Toc({ items }: { items: TOCItemType[] }) {
  const viewRef = useRef<HTMLDivElement>(null);
  return (
    <AnchorProvider toc={items}>           {/* Intersection Observer; `single` prop limits to one active item (default false) */}
      <div ref={viewRef} className="overflow-auto">
        <ScrollProvider containerRef={viewRef}>  {/* scrolls container to active anchor */}
          {items.map((item) => (
            <TOCItem key={item.url} href={item.url}>{item.title}</TOCItem>
          ))}
        </ScrollProvider>
      </div>
    </AnchorProvider>
  );
}
```
`TOCItem` exposes `data-active="true|false"` for styling.

### Link
```tsx
import Link from 'fumadocs-core/link';            // wraps framework Link, uses <a> for external URLs, auto `rel`
<Link href="/docs/components" external>...</Link> // `external` prop forces external handling

import { DynamicLink } from 'fumadocs-core/dynamic-link'; // supports dynamic hrefs like /[lang]/components
```

## 9. Content utils

### getTableOfContents
```ts
import { getTableOfContents } from 'fumadocs-core/content/toc';
const toc = getTableOfContents('## markdown content'); // TOCItemType[]
```

### getGithubLastEdit
```ts
import { getGithubLastEdit } from 'fumadocs-core/content/github';
const time = await getGithubLastEdit({
  owner: 'fuma-nama',
  repo: 'fumadocs',
  path: `content/docs/${page.path}`,
  token: `Bearer ${process.env.GIT_TOKEN}`,   // recommended; avoids GitHub API rate limit in dev
  baseUrl: 'https://api.octocorp.ghe.com',    // optional, defaults to https://api.github.com (GH Enterprise)
});
```

## 10. MDX plugins

All from `fumadocs-core/mdx-plugins` unless noted. With Fumadocs MDX, configure them via `mdxOptions` in `source.config.ts`; with raw MDX, pass to `compile()` from `@mdx-js/mdx`.

### remarkHeading (default in Fumadocs MDX)
Adds ids to headings; extracts TOC to `vfile.data.toc`. Disable extraction: `[remarkHeading, { generateToc: false }]`. Custom heading id syntax in Markdown: `# heading [#slug]`.
`TOCItemType = { title: ReactNode; url: string; depth: number; _step?: number }`.

### rehypeToc
Exports `export const toc = [...]` allowing JSX titles (e.g. inline `<code>`), which remark plugins cannot do. Requires MDX.js.

### rehypeCode (default in Fumadocs MDX)
Wrapper of `@shikijs/rehype`. Options type `RehypeCodeOptions` (inherits Shiki options, e.g. `themes: { light: 'github-light', dark: 'github-dark' }`). Configure in Fumadocs MDX via `mdxOptions.rehypeCodeOptions`.
- Meta: ` ```js title="Title" ` -> `<pre title="Title">`; filter meta with `filterMetaString`.
- Inline code highlighting: set `inline: 'tailing-curly-colon'`, then `` `console.log("hi"){:js}` ``.
- Adds `icon` attribute (HTML string of language logo) to `<pre>`; render via `dangerouslySetInnerHTML`; customize/disable with `icon` option.

### remarkDirectiveAdmonition (Docusaurus migration)
Requires `remark-directive` installed and listed before it:
```ts
import remarkDirective from 'remark-directive';
import { remarkDirectiveAdmonition } from 'fumadocs-core/mdx-plugins';
// mdxOptions: { remarkPlugins: [remarkDirective, remarkDirectiveAdmonition] }
```
Converts `:::tip[Title] ... :::` into `<CalloutContainer type=...><CalloutTitle/><CalloutDescription/>`. Note `tip` maps to `type='info'`. Docs recommend native `<Callout type='warn'>` JSX instead.

### remarkImage (default in Fumadocs MDX)
Adds `width`/`height` to images (required by Next.js Image). Supports local images, external URLs, Next.js static imports. Options (`RemarkImageOptions`):
- `useImport` (default `true`): emit static imports for local images (`import HelloImage from './public/hello.png'`). Relative paths (`./hello.png`) ONLY work with `useImport: true` — with it disabled, Next.js won't serve the file.
- `placeholder`: `'blur' | 'none'` (default `'none'`), only with `useImport` + local images.
- `onError`: `'error' (default) | 'ignore' | 'hide' | (error) => void`.
- `external` (default `true`): fetch size of external URLs.
- `publicDir`: directory or base URL (e.g. `https://my-cdn.com/images`) to resolve absolute paths.

### remarkNpm (enabled by default in Fumadocs MDX as `remarkNpmOptions`)
Turns ` ```npm \n npm i pkg ``` ` blocks into `<CodeBlockTabs>` with npm/pnpm/yarn/bun variants. You must provide components `CodeBlockTabs`, `CodeBlockTabsList`, `CodeBlockTab`, `CodeBlockTabsTrigger` via MDX components (included in `fumadocs-ui/mdx` defaults). `persist: { id: 'package-manager' }` option syncs the selected tab across blocks (Fumadocs UI Tabs persist).

### remarkSteps (subpath import!)
```ts
import { remarkSteps } from 'fumadocs-core/mdx-plugins/remark-steps';
```
Marks headings as steps via `# Heading [step]` or numeric prefix `# 1. Heading`. Output wraps in `div.fd-steps > div.fd-step` (nesting supported).

### remarkStructure (default in Fumadocs MDX; `remarkStructureOptions`)
Extracts search-index data to `vfile.data.structuredData`: `{ headings: [{ id, content }], contents: [{ heading, content }] }` (heading nullable; one heading can have many paragraphs). Options: `types` (scanned MDAST node types, default `['heading','paragraph','blockquote','tableCell','mdxJsxFlowElement']`), `stringify`, `mdxTypes`, `exportAs`. Also usable as a function:
```ts
import { structure } from 'fumadocs-core/mdx-plugins';
structure(page.body.raw, [remarkMath]); // pass custom remark plugins (e.g. remark-math) or output is garbled
```

### remarkLLMs (subpath import)
```ts
import { remarkLLMs, placeholder, type LLMsOptions } from 'fumadocs-core/mdx-plugins/remark-llms';
import { renderPlaceholder } from 'fumadocs-core/mdx-plugins/remark-llms.runtime';
```
Stringifies the processed Markdown AST back to plain Markdown as an ESM export (default export name `_markdown`; `as` option). In Fumadocs MDX, enable via collection `postprocess: { includeProcessedMarkdown: llmsOptions }` (defineDocs docs option); output is then available via `getText('processed')`.
- `mdxAsPlaceholder: ['Callout', 'Card']` keeps those components as `\0{json}\0` placeholder tokens.
- `stringify(node, parent, state, info)` callback + `placeholder()` helper for full control.
- `renderPlaceholder(markdown, { Callout({ name, attributes, children }) { return '...'; } })` rehydrates tokens at runtime (renderers may be async/fetch data).
- Other options: `headingIds` (default `true`, emits `[#id]` after headings), `filterElement` (default drops `mdxjsEsm` nodes), `filterMdxAttributes`, plus mdast-util-to-markdown formatting options (`bullet`, `fence`, `emphasis`, ...).
