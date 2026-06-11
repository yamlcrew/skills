<!-- Sources: fumadocs.dev/docs/ui.mdx, /docs/ui/component-library.mdx, /docs/ui/layouts.mdx, /docs/ui/layouts/links.mdx, /docs/ui/layouts/nav.mdx, /docs/ui/layouts/home-layout.mdx, /docs/ui/layouts/notebook.mdx, /docs/ui/layouts/flux.mdx, /docs/ui/search.mdx, /docs/ui/translations.mdx, /docs/ui/components/graph-view.mdx — verified 2026-06-11 -->
# Fumadocs UI — Advanced (Layouts, Links/Nav, Search UI, Translations, Graph View)

## Contents
1. [Overview & Component Library](#1-overview--component-library)
2. [Layout Selection Guide](#2-layout-selection-guide)
3. [Shared Layout Options (baseOptions)](#3-shared-layout-options-baseoptions)
4. [Links Configuration](#4-links-configuration)
5. [Navbar (nav) Configuration](#5-navbar-nav-configuration)
6. [Home Layout](#6-home-layout)
7. [Notebook Layout](#7-notebook-layout)
8. [Flux Layout](#8-flux-layout)
9. [Search UI Customization](#9-search-ui-customization)
10. [UI Translations (i18n)](#10-ui-translations-i18n)
11. [Graph View Component](#11-graph-view-component)

---

## 1. Overview & Component Library

Fumadocs UI is the default theme: interactive components + layouts with low maintenance cost. Use Fumadocs CLI (`@fumadocs/cli`) to install components locally for full control.

Headless primitives: Fumadocs UI supports both **Radix UI (default)** and **Base UI**. Opt into Base UI via package alias:

```json title="package.json"
{
  "dependency": {
    "fumadocs-ui": "npm:@fumadocs/base-ui@latest",
    "@base-ui/react": "..."
  }
}
```

If using Fumadocs CLI, also set in `cli.json`:

```json
{ "uiLibrary": "base-ui" }
```

## 2. Layout Selection Guide

| Layout | Import | Use when |
| --- | --- | --- |
| **Docs Layout** | `fumadocs-ui/layouts/docs` | Default docs: sidebar + navbar, fully configurable (sidebar/navbar replaceable). |
| **Notebook Layout** | `fumadocs-ui/layouts/notebook` | Compact docs look. Inherits Docs Layout options but is more opinionated: sidebar/navbar **cannot be replaced**; adds `tabMode` and `nav.mode`. |
| **Flux Layout** | `fumadocs-ui/layouts/flux` | Aggressively minimal/experimental docs. Client component (no unserializable props from server components). Pair with static/local search (Orama static); prioritizes aesthetics over UX; customize via CLI only. |
| **Home Layout** | `fumadocs-ui/layouts/home` | Non-docs pages (landing, blog): navbar + search dialog only. |

Notebook and Flux both export a component named `DocsLayout`. When switching layouts, also switch the **page component imports**: `fumadocs-ui/layouts/docs/page` → `fumadocs-ui/layouts/notebook/page` or `fumadocs-ui/layouts/flux/page`.

Flux differences vs Docs Layout: extra `renderNavigationPanel` prop (customizes bottom navigation panel); no `tocPopover` options.

## 3. Shared Layout Options (baseOptions)

All layouts accept a shared `BaseLayoutProps`. Store in one file and spread into each layout:

```tsx title="lib/layout.shared.tsx"
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'My App' },
  };
}
```

```tsx title="app/docs/layout.tsx"
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions()} tree={source.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
```

`BaseLayoutProps` fields:

| Prop | Type | Notes |
| --- | --- | --- |
| `githubUrl` | `string` | Shortcut for a GitHub repo link item |
| `links` | `LinkItemType[]` | Navigation links (see below) |
| `nav` | `NavOptions` | Navbar config (see below) |
| `slots` | `Partial<BaseSlots>` | Replaceable layout parts (e.g. header, language switch) |
| `themeSwitch` | `ThemeSwitchOptions` | Theme toggle options |
| `searchToggle` | `SearchToggleOptions` | Search trigger options |
| `i18n` | `boolean \| I18nConfig` | **Deprecated** — now optional for i18n setups; customize language switch via `slots` |

## 4. Links Configuration

Pass `links` in `baseOptions()` or directly to `<DocsLayout links={[...]}>` / `<HomeLayout links={[...]}>`.

### Link item

```tsx
import { BookIcon } from 'lucide-react';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    links: [
      {
        icon: <BookIcon />,
        text: 'Blog',
        url: '/blog',
        secondary: false, // secondary items rendered differently on navbar
      },
    ],
  };
}
```

Active mode — `active: 'url' | 'nested-url' | 'none'`:
- `url`: active only on exact URL
- `nested-url`: active on URL and child pages (`/blog/post`)
- `none`: never active

### Icon item

Rendered as icon button; **secondary by default**.

```tsx
{ type: 'icon', label: 'Visit Blog' /* aria-label */, icon: <BookIcon />, text: 'Blog', url: '/blog' }
```

### Custom item

```tsx
{ type: 'custom', children: <Button variant="primary">Login</Button>, secondary: true }
```

### Menu item (simple dropdown)

```tsx
{
  type: 'menu',
  text: 'Guide',
  items: [
    { text: 'Getting Started', description: 'Learn to use Fumadocs', url: '/docs' },
  ],
}
```

### GitHub shortcut

```tsx
export function baseOptions(): BaseLayoutProps {
  return { githubUrl: 'https://github.com' };
}
```

### Animated Navigation Menu (Home Layout only)

```tsx title="app/(home)/layout.tsx"
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import {
  NavbarMenu, NavbarMenuContent, NavbarMenuLink, NavbarMenuTrigger,
} from 'fumadocs-ui/layouts/home/navbar';

<HomeLayout
  {...baseOptions()}
  links={[
    {
      type: 'custom',
      on: 'nav', // only on navbar, not in mobile menu
      children: (
        <NavbarMenu>
          <NavbarMenuTrigger>Documentation</NavbarMenuTrigger>
          <NavbarMenuContent>
            <NavbarMenuLink href="/docs">Hello World</NavbarMenuLink>
          </NavbarMenuContent>
        </NavbarMenu>
      ),
    },
  ]}
>
  {children}
</HomeLayout>
```

## 5. Navbar (nav) Configuration

`nav` options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | — | Toggle navbar |
| `title` | `ReactNode \| FC<anchor props>` | — | Navbar title/logo |
| `url` | `string` | `'/'` | Redirect URL of title |
| `transparentMode` | `'always' \| 'top' \| 'none'` | `'none'` | Transparent background: always / only at top of page / never |
| `component` | `ReactNode` | — | Replace whole navbar. **Deprecated — use `slots.header` instead** |

```tsx
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: 'My App', transparentMode: 'top' },
  };
}
```

When replacing the navbar with a custom component, override the CSS variable Fumadocs uses to position layout pieces:

```css title="global.css"
:root {
  --fd-nav-height: 80px !important; /* exact height of your custom navbar */
}
```

## 6. Home Layout

Layout with navbar only — adds navbar + search dialog across non-docs pages.

```tsx title="app/(home)/layout.tsx"
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>;
}
```

## 7. Notebook Layout

```tsx title="layout.tsx"
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions()} tree={source.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
```

Update page imports: `fumadocs-ui/layouts/docs/page` → `fumadocs-ui/layouts/notebook/page`.

Extra options:
- **Tab mode** — style of Layout Tabs: `<DocsLayout tabMode="navbar" ...>`
- **Nav mode** — navbar style: `nav={{ ...nav, mode: 'top' }}` (combine with `tabMode="navbar"` for top-nav style)

```tsx
const { nav, ...base } = baseOptions();
return (
  <DocsLayout {...base} nav={{ ...nav, mode: 'top' }} tabMode="navbar" tree={source.getPageTree()}>
    {children}
  </DocsLayout>
);
```

## 8. Flux Layout

```tsx title="layout.tsx"
import { DocsLayout } from 'fumadocs-ui/layouts/flux';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions()} tree={source.getPageTree()}>
      {children}
    </DocsLayout>
  );
}
```

Page imports → `fumadocs-ui/layouts/flux/page`. Key caveats (from official docs): client component (no unserializable props from server components), best paired with static/local search, no `tocPopover` options, `renderNavigationPanel` prop for the bottom navigation panel, customize via Fumadocs CLI.

## 9. Search UI Customization

Configure from `<RootProvider />` (`fumadocs-ui/provider/<framework>`, e.g. `provider/next`):

```tsx title="app/layout.tsx"
import { RootProvider } from 'fumadocs-ui/provider/<framework>';
import { SearchDialog } from '@/components/my-search-dialog';

<RootProvider
  search={{
    enabled: false,   // disable search entirely
    SearchDialog,     // replace search dialog (receives open/onOpenChange; lazy-loadable via next/dynamic)
  }}
>
  {children}
</RootProvider>
```

`search` props: `enabled` (default `true`), `preload` (default `true`, preload dialog before opening), `links` (`SearchLink[]` shown when query empty), `hotKey` (`HotKey[]`, default Meta/Ctrl+K), `SearchDialog` (`React.ComponentType<SharedProps>`), `options` (`Partial<DefaultSearchDialogProps>`).

Hotkey customization:

```tsx
<RootProvider
  search={{
    hotKey: [{ display: 'K', key: 'k' /* key code, or function determining pressed */ }],
  }}
>
```

### Custom search dialog (composable primitives)

```tsx
'use client';
import { useDocsSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog, SearchDialogClose, SearchDialogContent, SearchDialogHeader,
  SearchDialogFooter, SearchDialogIcon, SearchDialogInput, SearchDialogList,
  SearchDialogOverlay, type SharedProps,
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
      <SearchDialogFooter>{/* footer items */}</SearchDialogFooter>
    </SearchDialog>
  );
}
```

Search results render Markdown; highlights use `<mark />`. Customize renderer via `SearchDialogList`'s `Item` prop with `<SearchDialogListItem {...props} renderMarkdown={(text) => ...} />`.

## 10. UI Translations (i18n)

All official packages default to English. Two modes:

### Singular (one language only)

```ts title="lib/layout.shared.tsx"
import { defineTranslations } from 'fumadocs-core/i18n';
import { uiTranslations } from 'fumadocs-ui/i18n';

export const translations = defineTranslations().extend(uiTranslations()).add({
  // [label]: [translation]; key format: 'label(context)'
  'Search(search trigger)': '搜尋文檔',
});
```

`.add()` must come **after** all `.extend()` calls.

```tsx
import { RootProvider } from 'fumadocs-ui/provider/<framework>';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { translations } from '@/lib/layout.shared';

<RootProvider i18n={i18nProvider(translations)}>{children}</RootProvider>
```

### Multilingual (requires full i18n setup)

```ts
import { uiTranslations } from 'fumadocs-ui/i18n';
import { i18n } from '@/lib/i18n';

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    cn: { 'Search(search trigger)': '搜尋文檔' },
  });
```

Pass locale: `<RootProvider i18n={i18nProvider(translations, locale)}>`.

### Language packs

`npm i @fumadocs/language` — provides translations for fumadocs-ui and integrations (e.g. OpenAPI). Consume with `.preset()`:

```ts
import { defineTranslations } from 'fumadocs-core/i18n';
import { openapiTranslations } from 'fumadocs-openapi/i18n';
import { uiTranslations } from 'fumadocs-ui/i18n';
import { zhTW } from '@fumadocs/language/zh-tw';

// singular:
export const translations = defineTranslations()
  .extend(uiTranslations())
  .extend(openapiTranslations()) // per configured integrations
  .preset(zhTW());

// multilingual: .preset('cn', zhTW())
```

### Custom extensions (for package authors)

Extensions register available labels; only registered labels are sent to client payload. Toolkit: `@fuma-translate/react`.

```ts
import type { TranslationExtension } from 'fumadocs-core/i18n';

const keys = ['Hello {user}(welcome screen)'] as const;
export function myTranslations(): TranslationExtension<(typeof keys)[number]> {
  return { keys };
}
```

Client usage: `const t = useTranslations()` from `@fuma-translate/react`, then `t('Hello {user}', { note: 'welcome screen', variables: { user: '...' } })`. Custom language packs implement `TranslationPreset` (`{ name, value }`) from `fumadocs-core/i18n`.

## 11. Graph View Component

Graph of all pages and their link relations. Install via CLI (copies code locally):

```bash
npx @fumadocs/cli add graph-view
```

Requires `extractLinkReferences` postprocess on Fumadocs MDX:

```ts title="source.config.ts"
import { defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  docs: {
    postprocess: {
      extractLinkReferences: true,
    },
  },
});
```

Usage (in MDX or layout/page components) — imports are local because CLI installs them into your project:

```tsx title="page.tsx"
import { GraphView } from '@/components/graph-view';
import { buildGraph } from '@/lib/build-graph';

export function PageBody() {
  return (
    <div>
      <GraphView graph={buildGraph()} />
    </div>
  );
}
```
