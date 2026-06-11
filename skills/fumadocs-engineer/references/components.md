<!-- Sources: fumadocs.dev/docs/ui/components/{accordion,tabs,steps,files,codeblock,dynamic-codeblock,type-table,auto-type-table,banner,inline-toc,image-zoom,github-info}.mdx — verified 2026-06-11 -->
# Fumadocs UI Components Reference (fumadocs-ui 16.x)

Sections:
- [Default MDX components (no import needed)](#default-mdx-components)
- [Accordion](#accordion)
- [Tabs](#tabs)
- [Steps](#steps)
- [Files](#files)
- [CodeBlock (MDX)](#codeblock-mdx)
- [DynamicCodeBlock / ServerCodeBlock](#dynamic-codeblock)
- [TypeTable](#typetable)
- [AutoTypeTable](#autotypetable)
- [Banner](#banner)
- [InlineTOC](#inlinetoc)
- [ImageZoom](#imagezoom)
- [GithubInfo](#githubinfo)

Version notes: fumadocs-ui 16.x components are built on **Radix UI**. `@fumadocs/base-ui` is an alternative package built on Base UI (same component APIs unless noted). All import paths below are from `fumadocs-ui/...`.

## Default MDX components

Available WITHOUT imports in MDX content when `defaultMdxComponents` from `'fumadocs-ui/mdx'` is registered:

```tsx title="components/mdx.tsx"
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return { ...defaultMdxComponents, ...components } satisfies MDXComponents;
}
```

Included: `Callout`, `Cards`/`Card`, headings (with anchor links), `pre`/code blocks, tables, auto links.

**Callout** — types: `info` (default), `warn`/`warning`, `error`, `success`, `idea`:

```mdx
<Callout>Hello World</Callout>
<Callout title="Title" type="warn">Hello World</Callout>
<Callout title="Title" type="error">Hello World</Callout>
<Callout title="Title" type="idea">Hello World</Callout>
```

**Cards/Card** — `href` optional, `icon` accepts JSX:

```mdx
import { HomeIcon } from 'lucide-react';

<Cards>
  <Card href="/docs/page" title="Title">Description text</Card>
  <Card title="href is optional">Text</Card>
  <Card icon={<HomeIcon />} href="/" title="Home">With icon.</Card>
</Cards>
```

Components like Tabs, Accordion, Files are NOT in defaults — register them in `getMDXComponents` or import in the MDX file.

## Accordion

```mdx
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';

<Accordions type="single">
  <Accordion title="My Title">My Content</Accordion>
</Accordions>
```

Props — `Accordions`: `type: "single" | "multiple"` (required), `disabled?`, `orientation?: "horizontal" | "vertical"` (default vertical), `asChild?`. `Accordion`: `title` (heading), `value?` (defaults to title; `id` overrides it), `disabled?`.

Deep-linking: give an `Accordion` an `id` — it auto-opens when URL hash matches:

```mdx
<Accordions>
<Accordion title="My Title" id="my-title">My Content</Accordion>
</Accordions>
```

Gotcha: based on Radix UI Accordion in fumadocs-ui; `@fumadocs/base-ui` version is based on Base UI.

## Tabs

```mdx
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

<Tabs items={['Javascript', 'Rust']}>
  <Tab value="Javascript">Javascript is weird</Tab>
  <Tab value="Rust">Rust is fast</Tab>
</Tabs>
```

Often registered globally instead of imported per-file:

```tsx
import * as TabsComponents from 'fumadocs-ui/components/tabs';
// ...defaultMdxComponents, ...TabsComponents
```

Key props/features:
- Without `value` on `Tab`: detected from children index — error-prone on re-render; avoid if tabs may change.
- `groupId="language"` — share selected value across all Tabs with same id (sessionStorage).
- `persist` (with `groupId`) — store in localStorage instead.
- `defaultIndex={1}` — default tab.
- `Tab id="tab-cpp"` — URL hash `#tab-cpp` activates the tab; `updateAnchor` on `Tabs` updates the hash on selection.
- Primitive API also exported: `TabsList`, `TabsTrigger`, `TabsContent` with `defaultValue` on `Tabs`.

Codeblock tab groups (no component needed) — see markdown-authoring.md (` ```ts tab="Tab 1" `).

## Steps

```mdx
import { Step, Steps } from 'fumadocs-ui/components/steps';

<Steps>
<Step>

### Hello World

</Step>
<Step>

### Step two

</Step>
</Steps>
```

No-import alternative (Tailwind utilities, preferred for heading-only steps):

```mdx
<div className="fd-steps [&_h3]:fd-step">

### Hello World

</div>
```

Also `[step]` heading suffix via remark-steps plugin (see markdown-authoring.md).

## Files

```mdx
import { File, Folder, Files } from 'fumadocs-ui/components/files';

<Files>
  <Folder name="app" defaultOpen>
    <File name="layout.tsx" />
    <File name="page.tsx" />
  </Folder>
  <File name="package.json" />
</Files>
```

Props — `File`: `name` (required), `icon?: ReactNode`. `Folder`: `name` (required), `defaultOpen?` (default false), `disabled?`.

Optional remark plugin converts ```` ```files ```` ASCII-tree codeblocks into `<Files />` and enables `<auto-files dir="./my-dir" pattern="**/*.{ts,tsx}" defaultOpenAll />`:

```ts title="source.config.ts"
import { remarkMdxFiles } from 'fumadocs-core/mdx-plugins/remark-mdx-files';
import { defineConfig } from 'fumadocs-mdx/config';
export default defineConfig({ mdxOptions: { remarkPlugins: [remarkMdxFiles] } });
```

## CodeBlock (MDX)

Build-time Shiki-highlighted code blocks. Used via the `pre` MDX component override:

```tsx title="components/mdx.tsx"
import defaultComponents from 'fumadocs-ui/mdx';
import { CodeBlock, Pre } from 'fumadocs-ui/components/codeblock';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultComponents,
    // HTML `ref` attribute conflicts with `forwardRef`
    pre: ({ ref: _ref, ...props }) => (
      <CodeBlock {...props}>
        <Pre>{props.children}</Pre>
      </CodeBlock>
    ),
    ...components,
  } satisfies MDXComponents;
}
```

Features: copy button, custom titles (` ```js title="config.js" `), icons (auto-injected by Shiki transformer, override via `icon` prop). `keepBackground` prop keeps Shiki-generated background. Gotcha: strip `ref` from props (conflicts with forwardRef).

## Dynamic CodeBlock

Runtime highlighting, no MDX needed.

Client component:

```tsx
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';

<DynamicCodeBlock lang="ts" code={'console.log("Hello World")'} options={{
  themes: { light: 'github-light', dark: 'github-dark' },
  components: { /* override pre/code */ },
  // other Shiki options
}} />
```

Features: React 19 Suspense, pre-renderable on server, lazy loads languages/themes in browser.

Server (RSC) equivalent:

```tsx
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
<ServerCodeBlock lang="ts" code='console.log("Hello World")' options={{...}} />
```

## TypeTable

```mdx
import { TypeTable } from 'fumadocs-ui/components/type-table';

<TypeTable
  type={{
    percentage: {
      description: 'The percentage of scroll position to display the roll button',
      type: 'number',
      default: 0.2,
    },
  }}
/>
```

`type: Record<string, TypeNode>` (required). Each entry: `type` (required, ReactNode), `description?`, `typeDescription?` (full signature), `typeDescriptionLink?`, `default?`, `required?`, `deprecated?`, `parameters?` (for functions), `returns?`.

## AutoTypeTable

Generates type tables from real TypeScript definitions. **Server Component only** — cannot be used in client components. Requires `npm i fumadocs-typescript`.

```tsx title="components/mdx.tsx"
import { createGenerator, createFileSystemGeneratorCache } from 'fumadocs-typescript';
import { AutoTypeTable, type AutoTypeTableProps } from 'fumadocs-typescript/ui';

const generator = createGenerator({
  // cache necessary for serverless platforms like Vercel
  cache: createFileSystemGeneratorCache('.next/fumadocs-typescript'),
});

// in getMDXComponents:
AutoTypeTable: (props: Partial<AutoTypeTableProps>) => (
  <AutoTypeTable {...props} generator={generator} />
),
```

Usage in MDX:

```mdx
<AutoTypeTable path="./path/to/file.ts" name="MyInterface" />
<AutoTypeTable type="{ hello: string }" />
<AutoTypeTable path="file.ts" type="A & { world: string }" />
```

Gotchas:
- `path` is relative to project cwd (RSC has no MDX file path context).
- Only object types allowed; wrap functions in an object property.
- Multi-line `type` requires explicit `export` statement plus `name` prop.
- Uses TS Compiler API; loads `tsconfig.json` from cwd (override via `createGenerator({ tsconfigPath, basePath })`).
- Relies on file system — page must be built at build time, serverless runtime rendering may break.

## Banner

Site-wide announcement; place at top of root layout body.

```tsx
import { Banner } from 'fumadocs-ui/components/banner';

<Banner>Hello World</Banner>
<Banner variant="rainbow" rainbowColors={['rgba(255,100,0,0.5)', 'transparent', /*...*/]}>Hi</Banner>
<Banner changeLayout={false}>no layout adjustments (default uses a style tag to shrink sidebar)</Banner>
<Banner id="hello-world">closable; dismissed state persisted by id</Banner>
```

## InlineTOC

```mdx
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';

<InlineTOC items={toc}>Table of Contents</InlineTOC>
```

Or per-page in `page.tsx`: `<InlineTOC items={page.data.toc}>...</InlineTOC>` inside `DocsPage` (import `DocsPage` from `fumadocs-ui/layouts/docs/page`).

Props: `items: TOCItemType[]` (required), `defaultOpen?`, `open?`, `onOpenChange?`, `disabled?`, `asChild?`.

## ImageZoom

Replace `img` in MDX components — then all `![alt](/img.png)` images get zoom:

```tsx title="components/mdx.tsx"
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
// in getMDXComponents:
img: (props) => <ImageZoom {...(props as any)} />,
```

On Next.js a default `sizes` is applied to `<Image />` if not specified.

## GithubInfo

Displays repo stars/forks. Recommended in layout `links`:

```tsx
import { GithubInfo } from 'fumadocs-ui/components/github-info';

<GithubInfo owner="fuma-nama" repo="fumadocs" token={process.env.GITHUB_TOKEN} /> // token optional
```

```tsx title="app/docs/layout.tsx"
links: [
  { type: 'custom', children: <GithubInfo owner="fuma-nama" repo="fumadocs" /> },
],
```

## Installation note

Docs pages show `<Installation name="..." />` — components ship inside `fumadocs-ui`; some can also be installed/ejected into your project via Fumadocs CLI (`npx @fumadocs/cli add <name>`) for customization.
