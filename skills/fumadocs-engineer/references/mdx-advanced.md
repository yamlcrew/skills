<!-- Sources: fumadocs.dev/docs/mdx{,.mdx}: index, performance, entry{,/server,/browser,/dynamic,/import}, vite, loader, mdx (presets), async, last-modified, typegen, workspace; /docs/manual-installation{,/react-router,/tanstack-start,/waku} — verified 2026-06-11 -->
# Fumadocs MDX — Advanced Runtime & Non-Next.js Frameworks

Collection basics (defineDocs/defineCollections/schema) are in project-setup.md. This file covers entries, lazy/dynamic modes, presets, performance, workspaces, and React Router / Tanstack Start / Waku installs.

## Contents
1. [Built-in MDX exports](#1-built-in-mdx-exports)
2. [Entry files (.source/server|browser|dynamic)](#2-entry-files)
3. [Server entry](#3-server-entry)
4. [Browser entry & createClientLoader](#4-browser-entry--createclientloader)
5. [Lazy loading: async vs dynamic mode](#5-lazy-loading-async-vs-dynamic-mode)
6. [Importing MDX files directly](#6-importing-mdx-files-directly)
7. [MDX presets & plugin customization](#7-mdx-presets--plugin-customization)
8. [Performance](#8-performance)
9. [last-modified plugin](#9-last-modified-plugin)
10. [Type generation (`fumadocs-mdx` CLI)](#10-type-generation)
11. [Workspaces (multi-config / multi-repo)](#11-workspaces)
12. [Vite setup](#12-vite-setup)
13. [Runtime loader (no bundler)](#13-runtime-loader)
14. [Manual install: React Router](#14-manual-install-react-router)
15. [Manual install: Tanstack Start](#15-manual-install-tanstack-start)
16. [Manual install: Waku](#16-manual-install-waku)

## 1. Built-in MDX exports

Every compiled MDX file exports by default: `default` (the component), `frontmatter`, `toc`, `structuredData` (search), `extractedReferences` (href analysis). Frontmatter shape is customized via collection `schema`.

## 2. Entry files

Collections compile into JS; **entry files** under the output dir (default `.source/`) expose them:

```
.source/
  server.ts    # full server access (use with loader())
  browser.ts   # async-import-optimized client access (doc/docs collections only)
  dynamic.ts   # on-demand compilation entry (dynamic mode)
```

Recommended tsconfig alias: `"collections/*": ["./.source/*"]` — then import `collections/server` etc. The `.source` folder is generated on dev server / build (or via `npx fumadocs-mdx`).

## 3. Server entry

```ts
// docs collection (meta + doc)
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';
export const source = loader({ baseUrl: '/docs', source: docs.toFumadocsSource() });

// standalone doc collection (e.g. blog) — wrap manually:
import { blogPosts } from 'collections/server';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
export const blog = loader({ baseUrl: '/blog', source: toFumadocsSource(blogPosts, []) });
```

Render on RSC: `const MDX = page.data.body; return <MDX components={getMDXComponents()} />;` — frontmatter props live directly on `page.data` (e.g. `page.data.title`).

## 4. Browser entry & createClientLoader

For non-RSC environments. Only doc/docs collections are exposed on browser; outputs use async imports.

```tsx
import browserCollections from 'collections/browser';   // default export, keyed by collection name

browserCollections['docs'].raw;                          // unloaded entries

const clientLoader = browserCollections.docs.createClientLoader({
  component({ frontmatter, toc, default: MDX }, props?: { myProp: string }) {
    return <MDX />;
  },
});

await clientLoader.preload(path);          // call in route loader; path = page.path from server
clientLoader.useContent(path, propsArg);   // hook, renders the component
```

Flow: server loader resolves `source.getPage(slugs)` and returns `page.path`; client preloads that path then renders via `useContent`. Docs recommend RSC whenever possible (avoids hydration). Full route examples in sections 14–15.

## 5. Lazy loading: async vs dynamic mode

By default ALL md/mdx files are pre-compiled (also in dev), which slows large sites.

**Async mode** — outputs use async imports; compilation still by bundler:
```ts
export const docs = defineDocs({ dir: 'content/docs', docs: { async: true } });
// or defineCollections({ type: 'doc', dir, async: true })
```
Next.js caveat: Turbopack doesn't support lazy bundling — async mode only improves server performance there.

**Dynamic mode** — on-demand compilation at runtime; install & externalize `shiki` first:
```ts
export const docs = defineDocs({ dir: 'content/docs', docs: { dynamic: true } });
```
Then import from the dynamic entry instead of server:
```ts
import { docs } from 'collections/dynamic';
export const source = loader({ baseUrl: '/docs', source: docs.toFumadocsSource() });
```
Dynamic mode constraints: **no import/export statements inside MDX files** (pass components via `components` prop), and **images must be URLs** (`/images/x.png` in `public/`), never relative file paths.

**Accessing content in either mode** — frontmatter remains sync on `page.data`; compiled exports need `await page.data.load()`:
```tsx
const page = source.getPage(['...']);
const { body: MdxContent, toc } = await page.data.load();
return <MdxContent components={getMDXComponents()} />;
```
With async/dynamic mode, prefer third-party search services (massive content indexing).

## 6. Importing MDX files directly

MDX files compile to modules (`default`, `frontmatter`, plugin exports), so they can be imported as components:

```tsx
import MyPage from '@/content/page.mdx';
<MyPage components={getMDXComponents()} />
```

Next.js only: `page.mdx` can replace `page.tsx` in the app dir (`export { default } from '@/components/layouts/page';` inside the MDX picks a layout). MDX-as-page has NO MDX components by default — export `useMDXComponents` from a module and set:
```ts
// source.config.ts
export default defineConfig({
  mdxOptions: { providerImportSource: '@/components/mdx' },
});
```
Other frameworks (Tanstack Start etc.) prefer explicit loaders — use MDX as imported components instead of pages.

## 7. MDX presets & plugin customization

Default preset (enabled for global MDX options) bundles: remark — Remark Image, Remark Heading, Remark Structure; rehype — Rehype Code, Rehype TOC. Options interface inherits MDX.js `ProcessorOptions`.

```ts
// global
import { defineConfig } from 'fumadocs-mdx/config';
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [myPlugin],
    // or function form to control ordering relative to defaults:
    rehypePlugins: (v) => [myPlugin, ...v],
    rehypeCodeOptions: { /* shiki opts */ },
    remarkImageOptions: { placeholder: 'blur' },   // blur only effective on Next.js
    remarkHeadingOptions: { /* ... */ },
  },
});

// per-collection: collection mdxOptions REPLACES the preset unless you re-apply it
import { defineCollections, applyMdxPreset } from 'fumadocs-mdx/config';
export const blog = defineCollections({
  type: 'doc',
  mdxOptions: applyMdxPreset({ remarkPlugins: [myPlugin] }),
});
```

## 8. Performance

- Fumadocs MDX is a **bundler plugin**; handles ~500+ MDX files with Webpack/Turbopack, enough for most sites. Bundler integration means MDX can import anything incl. client components, everything optimized by default.
- Huge file counts => very high memory in build/dev (bundlers aren't made to compile hundreds of MDX files).
- Solutions: (a) remote/custom source with on-demand SSG compilation (faster builds, but no bundling optimizations) — see /docs/integrations/content/custom; (b) lazy loading (section 5).
- Images resolve to static imports via Remark Image, so framework image optimization applies automatically.

## 9. last-modified plugin

```ts
import { defineConfig } from 'fumadocs-mdx/config';
import lastModified from 'fumadocs-mdx/plugins/last-modified';
export default defineConfig({ plugins: [lastModified()] });
```
Exports `lastModified` per document as `Date`: `page.data.lastModified`, or `(await page.data.load()).lastModified` with lazy loading. **Uses Git** — Git must be installed and the repo must NOT be shallow-cloned (CI pitfall).

## 10. Type generation

`npx fumadocs-mdx` generates types + entry files (`.source`) without dev/build. Recommended: `"postinstall": "fumadocs-mdx"` in package.json. Custom paths: `npx fumadocs-mdx "config-path" "output-dir"` (defaults `source.config.ts`, `.source`).

## 11. Workspaces

A workspace = independent project with its own `source.config.ts` + content; no own `package.json` needed (not the package-manager meaning).

```ts
// root source.config.ts
export default defineConfig({
  workspaces: {
    'my-workspace': {
      dir: 'my-workspace',
      config: await import('./my-workspace/source.config.ts'),
    },
  },
});
```
Rules: inside a workspace, `cwd` = workspace dir; configs never inherit. Outputs land at `.source/{workspace}/*` (root workspace location unchanged):
```ts
import { docs } from 'collections/my-workspace/server';
// combine with multi-source loader():
export const source = loader(
  { root: docs.toFumadocsSource(), 'my-workspace': MyWorkspace.docs.toFumadocsSource() },
  { baseUrl: '/docs' },
);
```
Use case: multi-repo docs via git submodules — each content repo has its own config, main repo treats each as a workspace, CI redeploys main repo on content commits.

## 12. Vite setup

```bash
npm i fumadocs-mdx fumadocs-core @types/mdx
```
```ts
// vite.config.ts
import { defineConfig } from 'vite';
import mdx from 'fumadocs-mdx/vite';
export default defineConfig({ plugins: [mdx()] });
```
Waku variant: put `mdx()` inside `vite.plugins` of `waku.config.ts` (`defineConfig({ vite: { plugins: [mdx()], resolve: { tsconfigPaths: true } } })`). Add tsconfig path `"collections/*": ["./.source/*"]`, create `source.config.ts` with `defineDocs({ dir: 'content/docs' })`, and `lib/source.ts` with `loader()` as usual.

## 13. Runtime loader

Fumadocs MDX needs a bundler by default. For unbundled environments (Node.js/Bun scripts), use a runtime loader integration (`fumadocs-mdx` loader page is an index; specific integrations are listed as subpages of /docs/mdx/loader — not detailed here).

## 14. Manual install: React Router

Prereqs: Tailwind CSS 4 + Fumadocs MDX via Vite guide (section 12) incl. `lib/source.ts`. Then `npm i fumadocs-core fumadocs-ui`.

CSS: `@import 'tailwindcss'; @import 'fumadocs-ui/css/neutral.css'; @import 'fumadocs-ui/css/preset.css';`

Routes (`routes.ts`): `route('docs/*', 'routes/docs.tsx')` and `route('api/search', 'routes/search.ts')`.

```tsx
// app/routes/docs.tsx (key parts)
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { source } from '@/lib/source';
import browserCollections from 'collections/browser';
import { useFumadocsLoader } from 'fumadocs-core/source/client';

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params['*'].split('/').filter((v) => v.length > 0);
  const page = source.getPage(slugs);
  if (!page) throw new Response('Not found', { status: 404 });
  return { path: page.path, url: page.url, pageTree: await source.serializePageTree(source.getPageTree()) };
}

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, frontmatter, default: Mdx }, props?: { className: string }) {
    return (
      <DocsPage toc={toc} {...props}>
        <title>{frontmatter.title}</title>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody><Mdx components={useMDXComponents()} /></DocsBody>
      </DocsPage>
    );
  },
});

export default function Page({ loaderData }: Route.ComponentProps) {
  const { path, pageTree } = useFumadocsLoader(loaderData);
  return <DocsLayout {...baseOptions()} tree={pageTree}>{clientLoader.useContent(path)}</DocsLayout>;
}
```

Search route: `createFromSource(source, { language: 'english' })` from `'fumadocs-core/search/server'`; `loader` returns `server.GET(request)`. Root: wrap body in `<RootProvider>` from `'fumadocs-ui/provider/react-router'`; `<html suppressHydrationWarning>`. `components/mdx.tsx` exports `getMDXComponents` spreading `defaultMdxComponents` from `'fumadocs-ui/mdx'`, plus `export const useMDXComponents = getMDXComponents;` and a global `MDXProvidedComponents` type.

## 15. Manual install: Tanstack Start

Same prereqs/CSS/mdx.tsx as React Router. Route file `routes/docs/$.tsx`:

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { Suspense } from 'react';

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? [];
    const data = await serverLoader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
});

const serverLoader = createServerFn({ method: 'GET' })
  .inputValidator((slugs: string[]) => slugs)
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) throw notFound();
    return { path: page.path, pageTree: await source.serializePageTree(source.getPageTree()) };
  });

function Page() {
  const data = useFumadocsLoader(Route.useLoaderData());
  return (
    <DocsLayout {...baseOptions()} tree={data.pageTree}>
      <Suspense>{clientLoader.useContent(data.path)}</Suspense>
    </DocsLayout>
  );
}
```

Search: `createFileRoute('/api/search')({ server: { handlers: { GET: async ({ request }) => server.GET(request) } } })`. Root provider: `'fumadocs-ui/provider/tanstack'`.

## 16. Manual install: Waku

Same prereqs. Waku is RSC-capable, so pages render `page.data.body` directly (no browser entry needed):

- `pages/docs/_layout.tsx`: `<DocsLayout {...baseOptions()} tree={source.getPageTree()}>` (server component).
- `pages/docs/[...slugs].tsx`: `source.getPage(slugs)`; not found via `unstable_notFound()` from `'waku/router/server'`; render `<MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />` (`createRelativeLink` from `'fumadocs-ui/mdx'` enables relative-file-path links). Optional `MarkdownCopyButton` / `ViewOptionsPopover` from `'fumadocs-ui/layouts/docs/page'`.
- Static generation: `getConfig()` returns `{ render: 'static', staticPaths: source.generateParams().map(i => i.lang ? [i.lang, ...i.slug] : i.slug) }`.
- Search: `pages/_api/api/search.ts` — `export const { GET } = createFromSource(source);`
- Provider: client component wrapping `RootProvider` from `'fumadocs-ui/provider/waku'`, used in `pages/_layout.tsx`.
