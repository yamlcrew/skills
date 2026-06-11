<!-- Sources: fumadocs.dev/docs/cli.mdx, /docs/cli/create-fumadocs-app.mdx, /docs/cli/preview.mdx — verified 2026-06-11 -->
# Fumadocs CLI Reference

## Contents
1. [@fumadocs/cli — init, add, customize, tree](#1-fumadocscli)
2. [create-fumadocs-app (incl. programmatic API)](#2-create-fumadocs-app)
3. [fumadocs-preview](#3-fumadocs-preview)
4. [Related CLIs covered elsewhere](#4-related-clis)

## 1. @fumadocs/cli

Run with `npx @fumadocs/cli` (or `pnpm dlx` / `yarn dlx` / `bun x`).

### Init config
```bash
npx @fumadocs/cli
```
Bare invocation initializes a CLI config file. The config lets you change the output paths of installed components.

### `add` — install components (shadcn-style)
```bash
npx @fumadocs/cli add                  # interactive picker
npx @fumadocs/cli add banner files     # install named components directly
```
How it works: fetches the **latest** component source from the Fumadocs GitHub repo (always up-to-date, NOT pinned to your installed fumadocs-ui version) and rewrites import paths to match your project. Keep the CLI itself up to date. Output locations come from the CLI config.

### `customize` — eject/customize layouts
```bash
npx @fumadocs/cli customize
```
Interactive way to customize Fumadocs UI layouts (docs layout, etc.) by pulling their source into your project.

### `tree` — generate `<Files>` trees
```bash
npx @fumadocs/cli tree ./my-dir ./output.tsx   # TSX output
npx @fumadocs/cli tree ./my-dir ./output.mdx   # MDX output
npx @fumadocs/cli tree -h                      # all flags
```
Generates a file-tree snippet for the Fumadocs UI `Files` component from a real directory:
```tsx
import { File, Folder, Files } from 'fumadocs-ui/components/files';

export default (
  <Files>
    <Folder name="app">
      <File name="layout.tsx" />
      <File name="page.tsx" />
    </Folder>
    <File name="package.json" />
  </Files>
);
```

## 2. create-fumadocs-app

Scaffolds new Fumadocs apps. Classical interactive usage:
```bash
npx create-fumadocs-app
```

Programmatic usage in scripts — install `create-fumadocs-app` as a dependency, then:
```ts
import { create } from 'create-fumadocs-app';

await create({
  outputDir: 'my-app',
  template: '+next+fuma-docs-mdx',   // template id format: +framework+source
  packageManager: 'pnpm',
});
```

## 3. fumadocs-preview

Light tool to view Markdown files with Fumadocs rendering — useful for reading skill files & notes. Run in your project directory:
```bash
npx fumadocs-preview dir/to/content
```

For custom configuration, install locally and create a config file:
```bash
npm install fumadocs-preview -D
npx fumadocs-preview init       # generates the config file
```

## 4. Related CLIs

- `npx fumadocs-mdx [config-path] [output-dir]` — generates `.source` types/entries without running dev/build (defaults: `source.config.ts`, `.source`); commonly wired as `"postinstall": "fumadocs-mdx"`. Documented in mdx-advanced.md.
