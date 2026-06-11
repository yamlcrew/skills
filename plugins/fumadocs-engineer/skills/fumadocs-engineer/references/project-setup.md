<!-- Sources: fumadocs.dev/docs.mdx, /docs/manual-installation/next.mdx, /docs/mdx/collections.mdx, /docs/mdx/global.mdx, /docs/ui/layouts/{docs,page,root-provider}.mdx, /docs/navigation.mdx, /docs/ui/theme.mdx — verified 2026-06-11 -->
# Fumadocs Project Setup Reference (fumadocs-ui/core 16.x, fumadocs-mdx 15.x)

Sections:
- [Quick start](#quick-start)
- [Manual installation (Next.js)](#manual-installation-nextjs)
- [source.config.ts: defineDocs / defineCollections](#sourceconfigts-collections)
- [Global config (defineConfig)](#global-config-defineconfig)
- [DocsLayout](#docslayout)
- [DocsPage / DocsBody / TOC](#docspage--docsbody--toc)
- [RootProvider](#rootprovider)
- [Navigation & versioning](#navigation--versioning)
- [Theme / Tailwind](#theme--tailwind)
- [FAQ gotchas](#faq-gotchas)

Architecture: fumadocs-core (logic/search/source adapters) + fumadocs-ui (default theme) + content source (Fumadocs MDX official) + Fumadocs CLI (`@fumadocs/cli` for installing components/slots).

## Quick start

Node.js >= 22 required.

```bash
npm create fumadocs-app   # or: pnpm create fumadocs-app / bunx create-fumadocs-app
```

Prompts for framework (Next.js, Waku, React Router, Tanstack Start) and content source (Fumadocs MDX). Template ships with LLM integration and dynamic OG-image metadata preconfigured. First page: `content/docs/index.mdx` with `title` frontmatter; visit `/docs`.

## Manual installation (Next.js)

Prereqs: Next.js 16, Tailwind CSS 4.

```bash
npm i fumadocs-mdx fumadocs-core @types/mdx
npm i fumadocs-ui fumadocs-core
```

```ts title="source.config.ts"
import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const docs = defineDocs({ dir: 'content/docs' });
export default defineConfig();
```

```js title="next.config.mjs"
import { createMDX } from 'fumadocs-mdx/next';
const config = { reactStrictMode: true };
const withMDX = createMDX({ /* configPath: "source.config.ts" */ });
export default withMDX(config);
```

Gotcha: Fumadocs MDX is **ESM only** — use `next.config.mjs`.

tsconfig alias (recommended; the `.source` folder is generated on `next dev`/`next build`):

```json
{ "compilerOptions": { "paths": { "collections/*": ["./.source/*"] } } }
```

```ts title="lib/source.ts"
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
```

NOTE (version change): import is `collections/server` + `docs.toFumadocsSource()` — older fumadocs-mdx versions used `import { docs } from '@/.source'` and `docs.toFumadocsSource()` directly or `createMDXSource(docs, meta)`.

```tsx title="app/layout.tsx"
import { RootProvider } from 'fumadocs-ui/provider/next';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
```

```css title="global.css"
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';
@import 'fumadocs-ui/css/preset.css';
```

```tsx title="lib/layout.shared.tsx"
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
export function baseOptions(): BaseLayoutProps {
  return { nav: { title: 'My App' } };
}
```

```tsx title="components/mdx.tsx"
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ...components } satisfies MDXComponents;
}
export const useMDXComponents = getMDXComponents;
declare global { type MDXProvidedComponents = ReturnType<typeof getMDXComponents>; }
```

```tsx title="app/docs/layout.tsx"
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>{children}</DocsLayout>
  );
}
```

```tsx title="app/docs/[[...slug]]/page.tsx"
import { source } from '@/lib/source';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import { createRelativeLink } from 'fumadocs-ui/mdx';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() { return source.generateParams(); }
export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
```

```ts title="app/api/search/route.ts"
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';
export const { GET } = createFromSource(source, { language: 'english' });
```

NOTE: page imports are `fumadocs-ui/layouts/docs/page` (or `fumadocs-ui/layouts/notebook/page`) — older versions used `fumadocs-ui/page`. Layout import paths: `fumadocs-ui/layouts/docs`, `fumadocs-ui/layouts/notebook`, `fumadocs-ui/layouts/home`.

## source.config.ts collections

```ts
import { defineDocs, defineCollections } from 'fumadocs-mdx/config';
import { z } from 'zod';

// docs = doc + meta collection pair for loader()
export const docs = defineDocs({
  dir: 'content/docs',
  docs: { /* doc collection options */ },
  meta: { /* meta collection options */ },
});

// standalone collection (e.g. blog)
export const blog = defineCollections({
  type: 'doc',                 // 'doc' (md/mdx) | 'meta' (json/yaml)
  dir: './content/blog',
  schema: z.object({ name: z.string() }),
});
```

Collection options: `dir` (required), `files?` (glob include/exclude), `schema?`, plus for `doc`: `mdxOptions?`, `async?` (load lazily), `dynamic?` (compile on demand), `postprocess?`.

- `schema`: any Standard Schema lib (Zod etc.). Validates frontmatter (`doc`) or file content (`meta`) at build time; output must be serializable. Function form receives context: `schema: (ctx) => z.object({ testPath: z.string().default(ctx.path) })`.
- Extend defaults (Zod 4): `pageSchema` / `metaSchema` from `'fumadocs-core/source/schema'` — `schema: pageSchema.extend({ index: z.boolean().default(false) })`.
- Collection-level `mdxOptions` REMOVES all global defaults; use `applyMdxPreset({...})` to keep the default preset.
- `postprocess.includeProcessedMarkdown: true` — enables `await page.data.getText('processed')` (needed for llms.txt flows).
- `postprocess.valueToExport: ['dataName']` — surface remark plugins' `vfile.data` values as ESM exports.

## Global config (defineConfig)

```ts title="source.config.ts"
import { defineConfig } from 'fumadocs-mdx/config';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMath],
    rehypePlugins: (v) => [rehypeKatex, ...v],  // function form when order matters
  },
});
```

GlobalConfig keys: `mdxOptions` (MDXPresetOptions or async fn; used by all doc collections unless overridden), `plugins`, `workspaces`, `experimentalBuildCache` (cache dir; never auto-invalidated — delete folder to clean). `mdxOptions: { preset: 'minimal' }` accepts only raw MDX processor options.

## DocsLayout

```tsx
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
<DocsLayout {...baseOptions()} tree={source.getPageTree()}>{children}</DocsLayout>
```

Key props: `tree` (required, page tree Root), `sidebar` (SidebarOptions), `tabs`, `tabMode: 'top' | 'auto'`, `links: LinkItemType[]`, `nav`, `githubUrl`, `slots`, `themeSwitch`, `searchToggle`, `containerProps`. (`i18n` prop deprecated — now optional for i18n setups.)

Sidebar options: `banner` (ReactNode), `footer`, `collapsible` (default true), `defaultOpenLevel` (default 0), `prefetch` (disable to cut Vercel serverless/prefetch costs), `components` (replace e.g. `Separator` with primitives from `fumadocs-ui/components/sidebar/base`), `enabled`.

Layout Tabs: root folders (`meta.json` `"root": true`) render as tabs, or pass explicitly:

```tsx
<DocsLayout tabs={[{ title: 'Components', description: 'Hello!', url: '/docs/components' }]} />
<DocsLayout tabs={false} />  // disable
<DocsLayout tabs={{ transform: (option, node) => ({ ...option, icon: <MyIcon /> }) }} />
```

Notebook variant: `import { DocsLayout, type DocsLayoutProps } from 'fumadocs-ui/layouts/notebook';`

## DocsPage / DocsBody / TOC

```tsx
import { DocsPage, DocsDescription, DocsTitle, DocsBody } from 'fumadocs-ui/layouts/docs/page';
// notebook: 'fumadocs-ui/layouts/notebook/page'

<DocsPage toc={page.data.toc} full={page.data.full}
  tableOfContent={{ style: 'clerk' }}            // 'normal' | 'clerk'
  tableOfContentPopover={{ /* mobile TOC */ }}
  footer={{ items: { previous, next } }}
  breadcrumb={{ includeRoot: false, includePage: false, includeSeparator: false }}>
  <DocsTitle>title</DocsTitle>
  <DocsDescription>description</DocsDescription>
  <DocsBody>{/* MDX body — applies typography (prose) styles */}</DocsBody>
</DocsPage>
```

- `full` — fill available space, TOC forced into popover.
- `tableOfContent` options: `style`, `header`/`footer` (ReactNode around TOC), `container`, `list`.
- Slot replacement: `slots={{ toc: { provider, main, popover }, footer: Footer, breadcrumb: Breadcrumb, container: Container }}`; slot prop types from `fumadocs-ui/layouts/<layout>/page/slots/{toc,footer,breadcrumb}`. Eject defaults: `npx @fumadocs/cli add slots/docs/page/toc` (also `notebook`, `flux` layouts).
- Extras: `<ViewOptionsPopover githubUrl={...} />` (GitHub + AI shortcut links), `<PageLastUpdate date={lastModifiedTime} />` (enable `lastModified` in Fumadocs MDX -> `page.data.lastModified`, or `getGithubLastEdit` from `'fumadocs-core/content/github'`).

## RootProvider

Framework-specific import (version change — was plain `fumadocs-ui/provider` in older versions):

```tsx
import { RootProvider } from 'fumadocs-ui/provider/next';         // Next.js
import { RootProvider } from 'fumadocs-ui/provider/react-router'; // React Router
import { RootProvider } from 'fumadocs-ui/provider/tanstack';     // Tanstack
import { RootProvider } from 'fumadocs-ui/provider/waku';         // Waku
```

Options: `search={{ enabled: false }}` or `search={{ SearchDialog }}`; `theme={{ enabled: false }}` (next-themes included); `dir="rtl"` for RTL (also set on `<body dir="rtl">`).

## Navigation & versioning

- Layout links (`links` option) for frequently-used pages; sidebar items come from page tree.
- Partial versioning: folders per version (`v1/`, `v2/`), optionally as Layout Tabs.
- Full versioning: separate Git branch deployed to a subdomain (e.g. v14.fumadocs.dev) — easier maintenance + versioned landing pages.
- Changing docs base route: move the Next.js route folder, then update `baseUrl` in `loader()`.

## Theme / Tailwind

Tailwind CSS **v4 only**. CSS-first setup:

```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';   /* color preset */
@import 'fumadocs-ui/css/preset.css';    /* required base preset (includes source of fumadocs-ui) */
```

Presets: `neutral`, `black`, `vitepress`, `dusk`, `catppuccin`, `ocean`, `purple`, `solar`, `emerald`, `ruby`, `aspen`. Shadcn UI interop: `@import 'fumadocs-ui/css/shadcn.css';` (adopts your Shadcn theme).

Custom colors via `@theme` variables `--color-fd-background`, `--color-fd-foreground`, `--color-fd-muted`, `--color-fd-primary`, `--color-fd-border`, `--color-fd-accent`, `--color-fd-ring`, etc. (light in `@theme`, dark overrides in `.dark { ... }`).

Layout width: `:root { --fd-layout-width: 1400px; }`.

Typography: built-in `prose` class (forked Tailwind Typography) — conflicts with `@tailwindcss/typography`; if both needed, rename the official plugin's class (`@plugin "@tailwindcss/typography" { className: wysiwyg; }`).

Gotcha: preset changes preflight defaults (border/text/background colors).

## FAQ gotchas

- Upgrade all fumadocs packages together: `pnpm update -i -r --latest`.
- Vite frameworks: exclude fumadocs packages from pre-bundling, add to `noExternal`: `['fumadocs-core', 'fumadocs-ui', 'fumadocs-openapi', '@fumadocs/base-ui']`.
- Node.js 23.1 has issues with Next.js builds (fumadocs#1021).
- Dynamic route is static-fast once `generateStaticParams` is configured.
- Page in /docs without docs layout: remove the MDX file, add a page in a different route group; for `/docs` itself, switch `[[...slug]]` to non-optional `[...slug]`.
