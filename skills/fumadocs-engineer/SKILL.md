---
name: fumadocs-engineer
description: >-
  Master senior engineer for Fumadocs — the Next.js/React docs framework — and its MDX content format.
  Use this skill whenever the user mentions Fumadocs, fumadocs-ui, fumadocs-mdx, fumadocs-core, writing or
  editing .mdx documentation pages, docs components (Accordion, Tabs, Steps, Callout, Cards, Files, CodeBlock,
  TypeTable), meta.json / page trees, source.config.ts, DocsLayout/DocsPage, docs search (Orama/Algolia),
  OpenAPI docs generation, or building/configuring/debugging a documentation site on Next.js, React Router,
  Tanstack Start or Waku. Trigger even if the user only says "add a page to my docs", "fix my docs build",
  or pastes MDX with components — if it looks like a Fumadocs project, use this skill.
---

# Fumadocs Engineer

Act as a senior engineer who knows Fumadocs inside out: content authoring (MDX), UI components, project
configuration, search, and integrations. Produce working, idiomatic code on the first try — most Fumadocs
bugs come from guessed import paths and outdated v13/v14 patterns floating around in training data.

## Version context (verified 2026-06-11)

- Current: **fumadocs-ui / fumadocs-core 16.x**, **fumadocs-mdx 15.x**. Requires Node >= 22, Next.js 16, Tailwind CSS v4 (CSS-first, no `tailwind.config` plugin).
- fumadocs-ui 16.x is built on Radix UI; `@fumadocs/base-ui` is the Base UI variant with the same component APIs.
- APIs changed significantly across major versions. **Always check the installed version in `package.json` first** and match patterns to it. If the project uses an older major, prefer upgrading guidance only when asked; otherwise write code for the installed version.

## Ground truth, not guesses

When unsure about an API, prop, or import path — verify before writing:

1. `package.json` of the user's project (installed versions, which framework adapter).
2. Official docs as raw markdown: append `.mdx` to any fumadocs.dev URL, e.g.
   `https://www.fumadocs.dev/docs/ui/components/tabs.mdx`. Full page index: `https://www.fumadocs.dev/llms.txt`.
3. Latest versions: `https://registry.npmjs.org/fumadocs-ui/latest`.

Never invent props or import paths. The cost of one wrong import is a broken build.

## Task routing

Read the matching reference file before writing code. They contain exact imports, props, and examples
for fumadocs 16.x:

| Task | Read |
|---|---|
| Use/add UI components (Accordion, Tabs, Steps, Files, CodeBlock, TypeTable, AutoTypeTable, Banner, InlineTOC, ImageZoom, GithubInfo, Callout, Cards) | `references/components.md` |
| Write/edit `.mdx` pages, frontmatter, headings/TOC, codeblock features, meta.json, folder conventions, math, Mermaid, Twoslash, `<include>` | `references/markdown-authoring.md` |
| Create/configure a project: `source.config.ts`, collections, `lib/source.ts`, layouts (DocsLayout/DocsPage/RootProvider), navigation, themes/Tailwind | `references/project-setup.md` |
| Layout variants (Notebook, Flux, Home), navbar/links config, Search UI dialog, UI translations/i18n strings, Graph View | `references/ui-advanced.md` |
| Fumadocs Core (headless): `loader()` / source API, page tree, breadcrumb/TOC/Link components, `getTableOfContents`, `getGithubLastEdit`, remark/rehype plugins (admonition, steps, npm, image, structure, llms) | `references/core-headless.md` |
| Fumadocs MDX advanced: entry files (`collections/server|browser|dynamic`), `async`/`dynamic` modes, last-modified plugin, typegen, workspaces, Vite / React Router / Tanstack Start / Waku installs | `references/mdx-advanced.md` |
| CLI: `create-fumadocs-app`, `@fumadocs/cli add/customize/tree`, `fumadocs-preview` | `references/cli.md` |
| Guides & integrations: customize UI (slots), access control, RSS, PDF/EPUB export, deploying/Docker, i18n routing, feedback, link validation, Obsidian/Python/TypeScript generators, content sources (local-md, mdx-remote, Sanity), OG images, Story | `references/framework-advanced.md` |
| Search (Orama/Algolia), OpenAPI docs, llms.txt / AI integration, static export | `references/search-integrations.md` |

For tasks spanning several areas (e.g. "set up a docs site and write the first pages"), read all relevant files.

Niche topics intentionally not in the references (e.g. Typesense/Trieve/FlexSearch/Mixedbread search adapters,
OpenAPI subpages like `generateFiles()`/`<APIPage />` details, Bun/Node runtime loaders, Sanity source,
Takumi OG, Content Collections): fetch the exact page on demand — find it in `https://www.fumadocs.dev/llms.txt`,
then append `.mdx` to the URL for raw markdown.

## Critical rules that prevent 90% of bugs

**Authoring:**
- Frontmatter `title` renders as the page h1 — never write `# Heading` in the MDX body.
- Heading suffixes: `[#custom-slug]` custom anchor, `[!toc]` hide from TOC, `[toc]` TOC-only. Chainable: `# heading [toc] [#id]`.
- Default MDX components (`Callout`, `Cards`/`Card`) need no import; `Tabs`, `Accordions`, `Files`, `Steps` and the rest must be imported in the file or registered in `getMDXComponents`.
- Codeblock meta goes on the fence line: ` ```ts title="file.ts" lineNumbers `, tab groups via `tab="Name"`, package-manager tabs via ` ```npm `. Shiki transformers: `[!code highlight]`, `[!code word:X]`, `[!code ++]`/`[!code --]`, `[!code focus]`.

**Page tree:**
- `meta.json` `pages` DSL: `"..."` (rest), `"z...a"` (rest reversed), `"...folder"` (extract), `"!hidden"`, `"---Separator---"`, `"[Text](url)"`. No duplicate URLs anywhere in the tree — duplicates break navigation.

**Configuration:**
- Fumadocs MDX is ESM-only: wrap config with `createMDX()` in `next.config.mjs`.
- `RootProvider` import is framework-specific in 16.x: `fumadocs-ui/provider/next` (not `fumadocs-ui/provider`).
- Page components come from `fumadocs-ui/layouts/docs/page` in 16.x.
- fumadocs-mdx generates `.source/`; access collections via the tsconfig alias `"collections/*": ["./.source/*"]` → `import { docs } from 'collections/server'` → `docs.toFumadocsSource()`.
- Collection-level `mdxOptions` silently replaces ALL global defaults — use `applyMdxPreset()` to keep them. When plugin order matters use the function form: `rehypePlugins: (v) => [rehypeKatex, ...v]`.

**Components:**
- `AutoTypeTable` is RSC-only; `path` resolves from cwd; only handles object types (wrap functions in a type alias).
- Orama search responses can literally be the string `'empty'` — guard before mapping.

**Moved imports (16.x) — old paths from pre-16 tutorials will break the build:**
- `getTableOfContents` → `fumadocs-core/content/toc`; `getGithubLastEdit` → `fumadocs-core/content/github`.
- `remarkSteps` → `fumadocs-core/mdx-plugins/remark-steps`; `remarkLLMs` → `fumadocs-core/mdx-plugins/remark-llms`.
- Notebook/Flux layouts: swapping `DocsLayout` import also requires swapping page imports to `fumadocs-ui/layouts/notebook/page` / `.../flux/page` — forgetting the second swap is a silent bug.
- `lastModified` is a plugin now: `import lastModified from 'fumadocs-mdx/plugins/last-modified'` + `plugins: [lastModified()]` (not a boolean flag); relies on git history — shallow CI clones break it silently.

## Workflow

1. Inspect the project (if one exists): `package.json`, `source.config.ts`, `lib/source.ts`, content folder layout, `mdx-components.tsx` / `getMDXComponents`. Match its conventions.
2. Read the reference file(s) for the task. Verify anything not covered there against fumadocs.dev (`.mdx` trick above).
3. Write the change. For new `.mdx` pages: frontmatter with `title` (+ `description`), imports at top, then content. Update the sibling `meta.json` when adding pages to a curated tree.
4. Verify: run `next build` (or the framework's build) when the change touches config; for content-only changes confirm imports exist in the project's installed fumadocs version.

## Debugging quick hits

- "Component X is not defined" in MDX → missing import in the file or missing registration in `getMDXComponents`.
- Build fails after editing `source.config.ts` → restart dev server; `.source/` is regenerated at startup.
- Page missing from sideba