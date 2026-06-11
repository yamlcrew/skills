<!-- Sources: fumadocs.dev/docs/search.mdx, /docs/search/{orama,algolia}.mdx, /docs/integrations/{openapi,llms}.mdx, /docs/deploying/static.mdx — verified 2026-06-11 -->
# Fumadocs Search, OpenAPI, LLM & Static Export Reference

Sections:
- [Search overview](#search-overview)
- [Orama (default)](#orama-default)
- [Algolia](#algolia)
- [Replacing the search dialog](#replacing-the-search-dialog)
- [Tag filter](#tag-filter)
- [OpenAPI integration](#openapi-integration)
- [LLM / AI integration (llms.txt, *.md, Ask AI)](#llm--ai-integration)
- [Static export](#static-export)

## Search overview

Default engine = Orama, preconfigured. Server side: `createFromSource(source, { language: 'english' })` from `'fumadocs-core/search/server'` in an API route. Client hook: `useDocsSearch` from `'fumadocs-core/search/client'` with `type: 'fetch' | 'static' | 'algolia'`. Dialog UI primitives from `'fumadocs-ui/components/dialog/search'`. Community integrations: Trieve, Typesense.

## Orama (default)

Fetch mode (server endpoint) — default UI already configured; re-create for customization:

```tsx title="components/search.tsx"
'use client';
import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog, SearchDialogClose, SearchDialogContent, SearchDialogHeader,
  SearchDialogIcon, SearchDialogInput, SearchDialogList, SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useI18n } from 'fumadocs-ui/contexts/i18n';

export default function DefaultSearchDialog(props: SharedProps) {
  const { locale } = useI18n(); // optional, for i18n
  const { search, setSearch, query } = useDocsSearch({ type: 'fetch', locale });

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
```

Static mode (for static export — search index served as cached JSON, computed in browser). Requires `npm install @orama/orama` and static mode on the search server:

```tsx
import { create } from '@orama/orama';

function initOrama() {
  return create({ schema: { _: 'string' }, language: 'english' });
}
// in component:
const { search, setSearch, query } = useDocsSearch({ type: 'static', initOrama, locale });
```

Gotcha: `query.data` can be the literal string `'empty'` — guard before passing to `SearchDialogList`.

## Algolia

Recommended to build your own UI with Algolia's SDK, but built-in dialog works:

```tsx title="components/search.tsx"
'use client';
import { liteClient } from 'algoliasearch/lite';
import { useDocsSearch } from 'fumadocs-core/search/client';
// + same dialog imports as Orama, plus SearchDialogFooter

const client = liteClient(appId, apiKey);

const { search, setSearch, query } = useDocsSearch({
  type: 'algolia',
  client,
  indexName: 'document',
  locale,
});
```

Note: `useDocsSearch()` does NOT use Algolia InstantSearch. Indexing setup lives at /docs/headless/search/algolia.

## Replacing the search dialog

```tsx
import { RootProvider } from 'fumadocs-ui/provider/<framework>';
import SearchDialog from '@/components/search';

<RootProvider search={{ SearchDialog }}>{children}</RootProvider>;
```

Gotcha: if root layout is a server component, wrap `RootProvider` in a `'use client'` Provider component to pass the dialog component down.

## Tag filter

Pass `tag` to `useDocsSearch({ tag, ... })` (requires Tag Filter configured on the search server) and render:

```tsx
import { TagsList, TagsListItem } from 'fumadocs-ui/components/dialog/search';

<SearchDialogFooter className="flex flex-row">
  <TagsList tag={tag} onTagChange={setTag}>
    <TagsListItem value="my-value">My Value</TagsListItem>
  </TagsList>
</SearchDialogFooter>
```

## OpenAPI integration

```bash
npm i fumadocs-openapi shiki
```

CSS: add `@import 'fumadocs-openapi/css/preset.css';` after the fumadocs-ui imports.

Setup (16.x API — `createOpenAPI` server instance + client `createOpenAPIPage`):

```ts title="lib/openapi.ts"
import { createOpenAPI } from 'fumadocs-openapi/server';
export const openapi = createOpenAPI({ input: ['./openapi.json'] }); // file paths or external URLs
```

```tsx title="components/api-page.tsx"
'use client';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';
export const OpenAPIPage = createOpenAPIPage();
```

```ts title="lib/source.ts"
import { openapiPlugin } from 'fumadocs-openapi/server';
// loader({ plugins: [openapiPlugin()] })  // optional: page-tree badges (GET/POST...)
```

Two generation strategies:

1. **MDX files** — script with `generateFiles({ input: openapi, output: './content/docs', includeDescription: true })` from `'fumadocs-openapi'` (descriptions must not break MDX syntax). Then register the MDX component in the page renderer:

```tsx
components={getMDXComponents({
  OpenAPIPage: async (props) => (
    <OpenAPIPage {...await openapi.preloadOpenAPIPage(page)} {...props} />
  ),
})}
```

2. **Virtual files** (no real files; tree regenerates when schema changes):

```ts title="lib/source.ts"
export const source = loader(
  {
    docs: docs.toFumadocsSource(),
    openapi: await openapi.staticSource({ baseDir: 'openapi' }),
  },
  { baseUrl: '/docs', plugins: [openapi.loaderPlugin()] },
);
```

This CHANGES the page union type — handle `page.type === 'openapi'` everywhere (`page.data.getOpenAPIPageProps()`, `page.data.getSchema().bundled`); run a type check after migrating.

Features: endpoint info, interactive playground, multi-language request samples, response samples + TS definitions, params/body from schemas.

## LLM / AI integration

Step 1 — enable processed-markdown output:

```ts title="source.config.ts"
export const docs = defineDocs({
  docs: { postprocess: { includeProcessedMarkdown: true } },
});
```

```ts title="lib/get-llm-text.ts"
import { source } from '@/lib/source';

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
```

`llms.txt` (index of pages) — Next.js:

```ts title="app/llms.txt/route.ts"
import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';

export const revalidate = false;
export function GET() {
  return new Response(llms(source).index());
}
```

`llms-full.txt` (entire docs as text):

```ts title="app/llms-full.txt/route.ts"
export const revalidate = false;
export async function GET() {
  const scanned = await Promise.all(source.getPages().map(getLLMText));
  return new Response(scanned.join('\n\n'));
}
```

`*.md` per-page route (Next.js) — route handler at `app/llms.mdx/docs/[[...slug]]/route.ts` returning `getLLMText(page)` with `Content-Type: text/markdown` + `generateStaticParams`, plus a rewrite:

```ts title="next.config.ts"
async rewrites() {
  return [{ source: '/docs/:path*.md', destination: '/llms.mdx/docs/:path*' }];
},
```

Content negotiation for AI agents: `isMarkdownPreferred(request)` + `rewritePath('/docs{/*path}', '/llms.mdx/docs{/*path}')` from `'fumadocs-core/negotiation'` in proxy/middleware.

Page actions (Copy-for-LLM button, open-in-AI links; needs `*.md` first):

```bash
npx @fumadocs/cli add ai/page-actions
```

```tsx
const markdownUrl = `${page.url}.mdx`; // or .md
<LLMCopyButton markdownUrl={markdownUrl} />
<ViewOptions markdownUrl={markdownUrl} githubUrl={...} />
```

Ask AI chat dialog via CLI: `npx @fumadocs/cli add ai/openrouter` (Vercel AI SDK + OpenRouter, includes `/search` tool), `ai/llmgateway` (env `LLM_GATEWAY_API_KEY`, `LLM_GATEWAY_MODEL`), or `ai/inkeep` (env `INKEEP_API_KEY`). Mount in docs layout: `<AISearch><AISearchPanel /><AISearchTrigger position="float">...</AISearchTrigger></AISearch>`. Fumadocs does NOT provide the AI model.

## Static export

Fumadocs is server-first by default; static build needs two things:

1. **Search**: built-in Orama needs static mode on the server (`/docs/headless/search/orama#static-export`) + the `static` client (`useDocsSearch({ type: 'static', initOrama })`) — index stored as static JSON, search runs in browser. Cloud engines (Algolia etc.) need no change.
2. **Framework config**:

Next.js:

```js title="next.config.mjs"
const nextConfig = {
  output: 'export',
  // trailingSlash: true,            // optional: /me -> /me/, emits /me/index.html
  // skipTrailingSlashRedirect: true,
};
```

React Router (SPA mode, must pre-render all server loaders):

```ts title="react-router.config.ts"
import { glob } from 'node:fs/promises';
import { createGetUrl, getSlugs } from 'fumadocs-core/source';

const getUrl = createGetUrl('/docs');
export default {
  ssr: false,
  async prerender({ getStaticPaths }) {
    const paths: string[] = [...getStaticPaths()];
    for await (const entry of glob('**/*.mdx', { cwd: 'content/docs' })) {
      paths.push(getUrl(getSlugs(entry)));
    }
    return paths;
  },
} satisfies Config;
```

Tanstack Start: `tanstackStart({ spa: { enabled: true, prerender: { enabled: true }, pages: [{ path: '/docs/test' }] } })` in vite.config — add hidden paths explicitly since crawler only finds UI-visible pages.

Waku: all pages must use `render: 'static'`.

Gotchas: `output: 'export'` disallows route handlers with dynamic behavior — `revalidate = false` routes (llms.txt etc.) and `generateStaticParams` keep them exportable; search API route must be replaced by static index.
