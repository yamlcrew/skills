<!-- Sources: fumadocs.dev/docs/guides/customize-ui.mdx, /docs/guides/access-control.mdx, /docs/guides/rss.mdx, /docs/guides/export-pdf.mdx, /docs/guides/export-epub.mdx, /docs/deploying.mdx, /docs/internationalization.mdx, /docs/internationalization/next.mdx, /docs/integrations/feedback.mdx, /docs/integrations/validate-links.mdx, /docs/integrations/obsidian.mdx, /docs/integrations/python.mdx, /docs/integrations/typescript.mdx, /docs/integrations/content.mdx, /docs/integrations/content/local-md.mdx, /docs/integrations/content/mdx-remote.mdx, /docs/integrations/og.mdx, /docs/integrations/og/next.mdx, /docs/integrations/story.mdx — verified 2026-06-11 -->
# Fumadocs Framework — Advanced Guides & Integrations

## Contents
1. [Customize UI (escalation path: props → CSS → CLI)](#1-customize-ui)
2. [Access Control](#2-access-control)
3. [RSS Feed](#3-rss-feed)
4. [Export PDF](#4-export-pdf)
5. [Export EPUB](#5-export-epub)
6. [Deploying](#6-deploying)
7. [Internationalization (Next.js)](#7-internationalization-nextjs)
8. [Feedback System](#8-feedback-system)
9. [Validate Links](#9-validate-links)
10. [Obsidian Integration](#10-obsidian-integration)
11. [Python Docgen](#11-python-docgen)
12. [TypeScript Docgen (AutoTypeTable)](#12-typescript-docgen-autotypetable)
13. [Content Sources Overview](#13-content-sources-overview)
14. [Local Markdown (@fumadocs/local-md)](#14-local-markdown-fumadocslocal-md)
15. [MDX Remote](#15-mdx-remote)
16. [OG Image Generation (next/og)](#16-og-image-generation-nextog)
17. [Story (component showcase)](#17-story-component-showcase)

---

## 1. Customize UI

Escalation order (official guidance — feed this to AI agents editing UI):

1. **Props first.** Check component options, e.g. `<DocsLayout sidebar={{ enabled: false }}>` or `containerProps={{ className: '...' }}`. Most options accept JSX elements (e.g. adding sections below TOC or in sidebar).
2. **CSS second.** Fumadocs UI attaches versioned `id` & `data-` attributes:
   ```css
   #nd-docs-layout #nd-subnav { background-color: purple; }
   [data-toc-popover] { background-color: purple; }
   ```
   Avoid invasive selectors presuming DOM structure (`[data-toc-popover] > div` is a bad example) — only the `id`/`data-` attributes are versioned.
3. **CLI install last.** `npx @fumadocs/cli@latest customize` — special command for layout components with granular choices; you can install just a **slot** (a replaceable part of a layout component) instead of the whole layout.

After installing a component locally, switch type imports to the local copy to decouple from fumadocs-ui:

```tsx
import type { DocsLayoutProps } from 'fumadocs-ui/layouts/docs'; // before
import type { DocsLayoutProps } from '@/components/layout/docs'; // after
```

CLI tradeoffs: no UI updates for installed components; re-installing erases prior customisations (you choose which files to overwrite); CLI assumes latest Fumadocs Core + UI.

## 2. Access Control

### Loader API approach (recommended — filters at input level)

Filter files from the content source with `update()` so protected content is excluded from page tree, search, everything:

```ts title="lib/source.ts"
import { docs } from 'collections/server';
import { loader, update } from 'fumadocs-core/source';

const filteredSource = update(docs.toFumadocsSource())
  .files((files) =>
    files.filter((file) => {
      if (file.type === 'meta') return true; // keep meta.json files
      return file.data.permission === 'public'; // type-safe frontmatter access
    }),
  )
  .build();

export const source = loader(filteredSource, { baseUrl: '/docs' });
```

Per-role sources — factory function (cache in-memory for real use):

```ts
export function createSource(permission: 'public' | 'admin') {
  const filteredSource = update(docs.toFumadocsSource())
    .files((files) => files.filter((f) => f.type === 'meta' || f.data.permission === permission))
    .build();
  return loader(filteredSource, { baseUrl: '/docs' });
}
// usage: const source = createSource(user.permission); source.getPage(params.slugs);
```

### Custom implementation (framework-level)

```tsx title="page.tsx"
if (!page) notFound();
if (page.data.permission !== user.permission) notFound();
```

Caveat: you then manage page tree (sidebar), search, etc. yourself.

## 3. RSS Feed

Use the `feed` package + `source.getPages()`:

```ts title="lib/rss.ts"
import { Feed } from 'feed';
import { source } from '@/lib/source';

const baseUrl = 'https://fumadocs.dev';

export function getRSS() {
  const feed = new Feed({
    title: 'Fumadocs Blog', id: `${baseUrl}/blog`, link: `${baseUrl}/blog`,
    language: 'en', image: `${baseUrl}/banner.png`, favicon: `${baseUrl}/icon.png`,
    copyright: 'All rights reserved 2025, Fuma Nama',
  });
  for (const page of source.getPages()) {
    feed.addItem({
      id: page.url, title: page.data.title, description: page.data.description,
      link: `${baseUrl}${page.url}`, date: new Date(page.data.lastModified),
      author: [{ name: 'Fuma' }],
    });
  }
  return feed.rss2();
}
```

Expose (Next.js):

```ts title="app/rss.xml/route.ts"
import { getRSS } from '@/lib/rss';
export const revalidate = false;
export function GET() {
  return new Response(getRSS());
}
```

React Router: `loader()` in `app/routes/rss.ts` + `route('rss.xml', 'routes/rss.ts')`. Tanstack Start: `createFileRoute('/rss.xml')({ server: { handlers: { GET } } })` in `src/routes/rss[.]xml.ts`.

Advertise in Next.js metadata: `metadata.alternates.types['application/rss+xml'] = [{ title, url }]`.

## 4. Export PDF

Official recommendation: prefer downloading the whole site (HTML) for offline use; PDF via Puppeteer script against a running server:

```ts title="scripts/export-pdf.ts"
import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';

const browser = await puppeteer.launch();
const outDir = 'pdfs';
const urls = ['/docs/ui', '/docs/ui/customizations']; // update this

async function exportPdf(pathname: string) {
  const page = await browser.newPage();
  await page.goto('http://localhost:3000' + pathname, { waitUntil: 'networkidle2' });
  await page.pdf({
    path: path.join(outDir, pathname.slice(1).replaceAll('/', '-') + '.pdf'),
    width: 950, printBackground: true,
  });
  await page.close();
}
await fs.mkdir(outDir, { recursive: true });
await Promise.all(urls.map(exportPdf));
await browser.close();
```

Hide navigation when printing:

```css
@media print {
  #nd-docs-layout { --fd-sidebar-width: 0px !important; }
  #nd-sidebar { display: none; }
}
```

Hidden content (accordions/tabs): temporarily swap MDX components — e.g. replace `Accordion`/`Accordions` from `fumadocs-ui/components/accordion` with flat `<h3>{props.title}</h3>{props.children}` wrappers in `getMDXComponents()` when an `isPrinting` flag/env is set.

## 5. Export EPUB

`npm install fumadocs-epub`. Requires processed markdown in collection config:

```ts title="source.config.ts"
import { defineDocs } from 'fumadocs-mdx/config';
export const docs = defineDocs({
  docs: {
    postprocess: { includeProcessedMarkdown: true },
  },
});
```

Route handler (Next.js):

```ts title="app/export/epub/route.ts"
import { source } from '@/lib/source';
import { exportEpub } from 'fumadocs-epub';

export const revalidate = false;

export async function GET(): Promise<Response> {
  const buffer = await exportEpub({
    source, title: 'My Documentation', author: 'My Team',
    description: 'Documentation for my project', cover: '/cover.png',
  });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': 'attachment; filename="docs.epub"',
    },
  });
}
```

Protect the endpooint in production (e.g. `Authorization: Bearer <secret>` + `EXPORT_SECRET` env; `fumadocs export epub --scaffold-only` scaffolds this). CLI alternative: `fumadocs export epub --framework next` (fetches from running server on Next.js; other frameworks copy from build output — run production build first).

Options: `title` (required), `author` (default `'anonymous'`), `description`, `language` (default `'en'`), `publisher`, `isbn`, `cover` (`file://`, `http(s)://`, `/public/...`, relative), `outputPath`, `includePages`/`excludePages` (`(page) => boolean`, e.g. `page.path.startsWith('getting-started')`), `css` (extend `defaultEpubStyles` export), `publicDir` (default `./public`). Image resolution: relative → page file, `/...` → public dir, remote URLs embedded as-is.

## 6. Deploying

Deployment is governed by the underlying React framework (Next.js, React Router, Tanstack Start, Waku) — follow its docs. Fully static SPA/CDN hosting: see `/docs/deploying/static`.

- **Next.js + Cloudflare**: use OpenNext Cloudflare adapter (opennext.js.org/cloudflare). **Fumadocs does not work on Edge runtime.**
- **Next.js + Docker (with Fumadocs MDX)**: copy `source.config.ts` and `next.config.*` into the deps stage WORKDIR alongside package manifests, so Fumadocs MDX can access the config during build:
  ```dockerfile
  COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* source.config.ts next.config.* ./
  ```
  (rest follows the official Next.js standalone Dockerfile example.)

## 7. Internationalization (Next.js)

Fumadocs is not a full i18n library — combine with e.g. `next-intl` for the rest of the app.

### 1) Config

```ts title="lib/i18n.ts"
import { defineI18n } from 'fumadocs-core/i18n';
export const i18n = defineI18n({
  defaultLanguage: 'en',
  languages: ['en', 'cn'],
});
```

### 2) Middleware (optional)

```ts title="proxy.ts"
import { createI18nMiddleware } from 'fumadocs-core/i18n/middleware';
import { i18n } from '@/lib/i18n';
export default createI18nMiddleware(i18n);
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

Custom middleware must align with the `hidePrefix` i18n config option.

### 3) Translations + RootProvider

```tsx title="lib/layout.shared.tsx"
import { i18n } from '@/lib/i18n';
import { uiTranslations } from 'fumadocs-ui/i18n';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: { displayName: 'English' },
    cn: { displayName: 'Chinese' },
  });

export function baseOptions(locale: string): BaseLayoutProps {
  return { /* per-locale props */ };
}
```

```tsx title="app/[lang]/layout.tsx"
import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { translations } from '@/lib/layout.shared';

// in RootLayout({ params }): const lang = (await params).lang;
<html lang={lang}><body>
  <RootProvider i18n={i18nProvider(translations, lang)}>{children}</RootProvider>
</body></html>
```

### 4) Routing & locale plumbing

- Move pages/layouts into `app/[lang]/`, **except route handlers** (e.g. `app/api/search/route.ts` stays).
- Common mistake: broken `global.css` import path after moving files.
- `lib/source.ts`: add `i18n` to `loader({ i18n, ... })`.
- Layouts: `baseOptions(lang)`, `source.getPageTree(lang)`.
- Pages: `source.getPage(slug, lang)`, `source.getPages(lang)`.
- If segment is named differently (e.g. `[locale]`): `return source.generateParams('slug', 'locale');` in `generateStaticParams()`.
- Search: configure i18n on Orama (built-in) or use cloud solution multilingual support.

### Navigation in content

Fumadocs only localizes its own layouts. Elsewhere use `useParams()` to prepend locale, or in MDX:

```mdx
import { DynamicLink } from 'fumadocs-core/dynamic-link';

<DynamicLink href="/[lang]/another-page">This is a link</DynamicLink>
```

## 8. Feedback System

Install via CLI (copies code locally): `npx @fumadocs/cli@latest add feedback`.

### Page-level

```tsx
import { DocsPage } from 'fumadocs-ui/layout/docs/page';
import { Feedback } from '@/components/feedback/client';

<DocsPage>
  <Feedback
    onSendAction={async (feedback) => {
      'use server';
      console.log(feedback);
    }}
  />
</DocsPage>
```

### Block-level (text selection popover)

Add the `remark-block-id` plugin:

```ts title="source.config.ts"
import { remarkBlockId, type RemarkBlockIdOptions } from 'fumadocs-core/mdx-plugins/remark-block-id';
import { defineConfig } from 'fumadocs-mdx/config';

const blockIdOptions: RemarkBlockIdOptions = { addDataAttribute: 'feedback' };
export default defineConfig({ mdxOptions: { remarkPlugins: [[remarkBlockId, blockIdOptions]] } });
```

Then wrap page content in `<FeedbackText onSendAction={...}>` from `@/components/feedback/client`. Block IDs are generated from content + order, so 3rd-party tracking works too.

### GitHub Discussions backend

Official recipe uses `octokit` (`App`, `Octokit`) with a GitHub App (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` env), a "Docs Feedback" discussion category, and GraphQL to create/append discussion threads titled `Feedback for <pathname>`. Schemas come from `@/components/feedback/schema` (`pageFeedback`, `blockFeedback`). Wire its `onPageFeedbackAction` / `onBlockFeedbackAction` into the components.

## 9. Validate Links

Use `next-validate-link` (works best with Fumadocs MDX):

```ts title="scripts/lint.ts"
import { type FileObject, printErrors, scanURLs, validateFiles } from 'next-validate-link';
import { source } from '@/lib/source';

async function checkLinks() {
  const scanned = await scanURLs({
    preset: 'next', // pick preset for your framework
    populate: {
      'docs/[[...slug]]': source.getPages().map((page) => ({
        value: { slug: page.slugs },
        hashes: getHeadings(page),
      })),
    },
  });

  printErrors(
    await validateFiles(await getFiles(), {
      scanned,
      markdown: { components: { Card: { attributes: ['href'] } } }, // check href in MDX components
      checkRelativePaths: 'as-url',
    }),
    true,
  );
}

function getHeadings({ data }: (typeof source)['$inferPage']): string[] {
  return data.toc.map((item) => item.url.slice(1));
}
function getFiles() {
  return Promise.all(source.getPages().map(async (page): Promise<FileObject> => ({
    path: page.absolutePath,
    content: await page.data.getText('raw'),
    url: page.url,
    data: page.data,
  })));
}
void checkLinks();
```

Run with `bun ./scripts/lint.ts` — accessing `source` outside app runtime requires Fumadocs MDX Loader for Bun (or Node loader; Bun/`tsx` is simpler).

## 10. Obsidian Integration

**Experimental.** `npm i fumadocs-obsidian`. Copy the vault into the project, then generate:

```ts title="scripts/generate.ts"
import { fromVault } from 'fumadocs-obsidian';

await fromVault({
  dir: 'Obsidian Vault',
  out: { /* optional: locations of /public & /content/docs */ },
});
```

Run `bun scripts/generate.ts`, then register components:

```tsx title="components/mdx.tsx"
import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as ObsidianComponents from 'fumadocs-obsidian/ui';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ...ObsidianComponents, ...components } satisfies MDXComponents;
}
```

Mermaid and Math need separate enabling (see /docs/markdown/mermaid, /docs/markdown/math).

## 11. Python Docgen

**Experimental.** `npm install fumadocs-python shiki`, then install the Python CLI: `pip install ./node_modules/fumadocs-python`.

```bash
fumapy-generate httpx   # produces JSON for a pip package
```

Convert JSON → MDX:

```js title="scripts/generate-docs.mjs"
import { rimraf } from 'rimraf';
import * as Python from 'fumadocs-python';
import * as fs from 'node:fs/promises';

const content = JSON.parse((await fs.readFile('./httpx.json')).toString());
await rimraf('content/docs/(api)'); // clean previous output
await Python.write(Python.convert(content, { baseUrl: '/docs' }), { outDir: 'content/docs/(api)' });
```

Pitfall: output is **MDX** — docstrings written as Markdown/reST may be invalid MDX. Add components (`import * as Python from 'fumadocs-python/components'` spread into `getMDXComponents`) and CSS `@import 'fumadocs-python/preset.css';`.

## 12. TypeScript Docgen (AutoTypeTable)

`npm install fumadocs-typescript`. UI side: `AutoTypeTable` component. MDX side — remark plugin:

```ts title="source.config.ts"
import {
  remarkAutoTypeTable, createGenerator, createFileSystemGeneratorCache,
} from 'fumadocs-typescript';
import { defineConfig } from 'fumadocs-mdx/config';

const generator = createGenerator({
  cache: createFileSystemGeneratorCache('.next/fumadocs-typescript'),
});

export default defineConfig({
  mdxOptions: { remarkPlugins: [[remarkAutoTypeTable, { generator }]] },
});
```

Gives an `auto-type-table` MDX element: `<auto-type-table path="./path/to/file.ts" name="MyInterface" />`. Rules: attribute values must be strings; `path` is relative to the MDX file; also register `TypeTable` in MDX components.

TSDoc annotations: `@internal` hides a field; `@remarks \`name\`` overrides displayed (simplified) type; `@fumadocsType \`Name\`` sets full type name; `@fumadocsHref #type-table-...` links a property to another type table anchor.

## 13. Content Sources Overview

Fumadocs integrates with any content source, even without an official adapter. CMS examples: BaseHub, Sanity, community Payload CMS templates. Custom sources: /docs/integrations/content/custom.

## 14. Local Markdown (@fumadocs/local-md)

Bundleless runtime content source for local MD/MDX. vs MDX Remote: more comprehensive/robust, local-only. vs Fumadocs MDX: no type-gen/bundler needed, but **no build-time image optimization** and **no imports/exports in MDX** (pass variables/components at render).

```bash
npm install @fumadocs/local-md shiki   # shiki must be externalized by bundler
```

```ts title="lib/source.ts"
import { dynamicLoader } from 'fumadocs-core/source/dynamic';
import { localMd } from '@fumadocs/local-md';

const docs = localMd({ dir: 'content/docs' });

if (process.env.NODE_ENV === 'development') {
  void docs.devServer(); // hot reload; pairs with `local-md dev -- npm next dev` script
}

const docsLoader = dynamicLoader(docs.dynamicSource(), { baseUrl: '/docs' });
export async function getSource() {
  return docsLoader.get();
}
```

Schemas: `frontmatterSchema: pageSchema.extend({...})`, `metaSchema: metaSchema.extend({...})` from `fumadocs-core/source/schema`. Static snapshot without revalidation: `loader(await docs.staticSource(), { baseUrl: '/docs' })` with normal `loader()`.

`.md` files compile through a **virtual JavaScript engine** (no `eval()`) — works on Cloudflare Workers, slower than native JIT.

Migration from Fumadocs MDX changes the page data shape:

```tsx
// Fumadocs MDX                         // local-md
page.data.full;                         page.data.frontmatter.full;
await page.data.getText('processed');   page.data.content; // no getText()
page.data.structuredData / .toc / .body
                                        const { structuredData, render } = await page.data.load();
                                        const { toc, body } = await render(mdxComponents);
```

Also: remove `source.config.ts` and `createMDX()` from `next.config.mjs`; replace `collections/server` imports. Non-RSC (e.g. Tanstack Start): server fn returns `serialize()` from `page.data.load()`, client renders via `rendererFromSerialized(render)` from `@fumadocs/local-md/client` + `renderer.renderSync(components)`, page tree via `useFumadocsLoader` from `fumadocs-core/source/client`.

## 15. MDX Remote

`npm install @fumadocs/mdx-remote` — `next-mdx-remote`-style compiler with built-in Fumadocs plugins. **Security: content must be trusted — it allows code execution by default.** No bundler ⇒ no imports/exports in MDX. RSC-compatible:

```tsx
import { createCompiler } from '@fumadocs/mdx-remote';
import { getPage } from './my-content-source';
import { DocsBody, DocsPage } from 'fumadocs-ui/layouts/docs/page';
import { getMDXComponents } from '@/components/mdx';

const compiler = createCompiler({});

export default async function Page({ params }: { params: { slug?: string[] } }) {
  const page = getPage(params.slug);
  const compiled = await compiler.compile({ source: page.content });
  const MdxContent = compiled.body;

  return (
    <DocsPage toc={compiled.toc}>
      <DocsBody>
        <MdxContent components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}
```

Pitfall (serverless/Vercel): `public` folder is removed after production build — reference images by URL, not local paths.

## 16. OG Image Generation (next/og)

Pattern: append `image.png` to page slugs so the image lives at `/og/docs/<slugs>/image.png`.

```ts title="lib/source.ts"
export function getPageImage(page: (typeof source)['$inferPage']) {
  const segments = [...page.slugs, 'image.png'];
  return { segments, url: `/og/docs/${segments.join('/')}` };
}
```

In `generateMetadata`: `openGraph: { images: getPageImage(page).url }`.

```tsx title="app/og/docs/[...slug]/route.tsx"
import { getPageImage, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const revalidate = false;

export async function GET(_req: Request, { params }: RouteContext<'/og/docs/[...slug]'>) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1)); // strip 'image.png'
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage title={page.data.title} description={page.data.description} site="My App" />,
    { width: 1200, height: 630 },
  );
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
```

Satori options apply (next/og uses Satori). Other presets via CLI, e.g. `npx @fumadocs/cli@latest add og/mono`, then swap the `generate` import for the installed one.

## 17. Story (component showcase)

Fumadocs Story = docs-focused Storybook alternative for component libraries (not a replacement for Storybook's UI testing). Install per setup guide; define stories via local `defineStory`:

```ts
import { defineStory } from '@/lib/story';
import { Callout } from '@/components/callout';

export const story = defineStory({
  Component: Callout,
  args: [
    { variant: 'Default', initial: { title: 'This is a Callout' } },
    { variant: 'Warning', initial: { title: 'This is a Callout' }, fixed: { type: 'warning' } },
  ],
});
```

Controls: `args.controls` either specifies control nodes (`{ node: { type: 'object', properties: [] } }`) or transforms generated ones (`{ transform: (node) => node }`).

i18n: extend translations with `storyTranslations()` from `@fumadocs/story/i18n` alongside `uiTranslations()`, then add labels like `'New Item(story arguments form)'`.
                                                                                                                                                                                                                                      