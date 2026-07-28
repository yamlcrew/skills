# Nub runtime: TypeScript, JSX, decorators, resolution, and `.env`

Nub (v0.6.0) is a Rust CLI that AUGMENTS the user's installed Node — it is not a fork and ships no patched Node. This reference covers the transpile layer it adds on top of Node: the full TypeScript/JSX surface via oxc, legacy decorators, TypeScript-aware module resolution, and automatic `.env*` loading. Everything here rides Node's own extension surfaces (`module.registerHooks()`, `--import`/`--require` preload, env), so `nub file.ts` behaves like plain Node plus those hooks. To turn all augmentation off, run `nub --node <file>` (per-invocation) or set `NODE_COMPAT=1` (tree-wide).

## TypeScript execution

Nub runs the whole TypeScript surface — not just the erasable subset Node's built-in type-stripping accepts. Files ending in `.ts`, `.tsx`, `.mts`, and `.cts` execute directly: Nub transpiles them with its oxc-based transpiler through a `module.registerHooks()` load hook, then hands the result to Node.

```bash
nub index.ts
nub server.tsx
```

Transpilation happens before Node sees the code, so these transforms work on every supported Node version (18.19+). The one carve-out is source maps (see below).

Types are STRIPPED, not checked. Keep `tsc --noEmit` in your editor and CI for type validation — Nub does no type-checking. Files inside `node_modules` are NEVER transpiled; they load exactly as the package shipped them, on every tier.

### Non-erasable syntax

Syntax that requires transformation rather than pure type removal — `enum`, `namespace`, parameter properties, and `import = require(...)` — is rejected by Node's type-stripping but emitted in runtime form by Nub's transpiler:

```ts
enum Color { Red, Green, Blue }

namespace Geometry {
  export const PI = 3.14159;
}

class User {
  constructor(public id: string, private name: string) {}   // parameter properties
}

import fs = require("node:fs");
```

You opt into the syntax by writing it; Nub makes it run.

JSX in a `.js` file is out of scope — use `.jsx`. Nub parses `.js` as JavaScript, not JSX, so a `<` is a comparison, not an element.

## Plain JavaScript through the same pipeline

Plain JavaScript — `.js`, `.mjs`, and `.cjs` — goes through the SAME pipeline. Modern syntax Nub's Node floor can't parse natively is lowered exactly as it is in a `.ts` file, so identical source behaves the same whatever extension it carries: `using` / `await using`, a `v`-flag (unicode-sets) RegExp like `/\p{Letter}/v`, and decorators all run.

```js
// app.js — runs on every supported Node version (18.19+)
using handle = openHandle();
const letters = /\p{Letter}/v;
```

A file with nothing to lower is handed to Node UNTOUCHED — byte for byte, no reformatting and no source-map footer — so a plain `.js` that needs no transform is exactly the file you wrote.

## Explicit Resource Management

The `using` and `await using` declarations run on Nub's entire Node floor. Older Node (Node 22's V8) cannot parse `using` natively — it's a hard `SyntaxError` — so Nub's transpiler lowers it to the helper-based form before Node ever sees it.

```ts
class Handle {
  [Symbol.dispose]() { console.log("disposed"); }
}

{
  using h = new Handle();
  console.log("using h");
}
console.log("after scope");
```

```console
$ nub resource.ts
using h
disposed
after scope
```

The lowering targets **es2022** — the highest target that still rewrites `using` while leaving everything Node 22 already supports (top-level await, class fields, private methods) untouched. The disposal helper resolves through Nub's vendored runtime; you install nothing.

## Source maps

Nub generates an INLINE source map for every transpiled file and injects `--enable-source-maps`, so uncaught errors and `console.trace()` print frames that point at your original TypeScript source and line numbers — not the generated JS. It's on by default; breakpoints set in `.ts` source land correctly under `nub --inspect`.

```console
$ nub app.ts
/path/to/app.ts:2
	throw new Error("kaboom");
	^

Error: kaboom
    at boom (/path/to/app.ts:2:8)
    at Object.<anonymous> (/path/to/app.ts:4:1)
```

The frame reports `app.ts:2:8` — the source line, not the transpiled output. Disable it with `--no-enable-source-maps`.

Source maps are injected on every supported Node version EXCEPT the **26.2.x** patch band, where a Node regression makes a no-message `assert(false)` rethrow as a `TypeError` instead of an `AssertionError` when source maps are on. On 26.2.x Nub WITHHOLDS the flag, so stack traces there are not remapped. Every other version — 18.19 through 26.1, and 26.3+ — gets source maps.

## JSX

Files ending in `.jsx` and `.tsx` execute through the same load hook. JSX is recognized in `.jsx` / `.tsx` ONLY, never in plain `.js`. Defaults are the modern ones — automatic runtime, `react` as the import source — matching oxc-transformer, Vite's React plugins, Rolldown, and Bun, so a React project needs no setup.

```bash
nub render.tsx
```

### Honored `compilerOptions`

Configure the JSX runtime through `tsconfig.json`, the way the rest of your toolchain does. These `compilerOptions` are honored:

- **`jsx`** — the runtime mode: `"preserve"` | `"react"` | `"react-jsx"` | `"react-jsxdev"` | `"react-native"`.
- **`jsxImportSource`** — the package the automatic runtime imports from (e.g. `preact`).
- **`jsxFactory`** — the factory function for the classic runtime.
- **`jsxFragmentFactory`** — the fragment factory for the classic runtime.

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

### Per-file pragma

A per-file `/** @jsxImportSource ... */` pragma OVERRIDES the tsconfig import source for that one file — the standard mechanism for mixing JSX runtimes in a single project (a Hono route alongside React components). The pragma is read from the file source itself; no tsconfig entry is needed for it to take effect.

```tsx
/** @jsxImportSource hono/jsx */
export default function Page() {
  return <h1>Hello</h1>;
}
```

### Framework support

Preact, Hono, and Vue JSX work via passthrough. **Solid is the exception** — its JSX needs `babel-preset-solid`'s reactive-graph compilation, which a per-file transpiler can't do, so run Solid through its bundler (e.g. `nub run vite`).

## Decorators

Set `experimentalDecorators: true` in `tsconfig.json` and decorated classes run with no build step. This is the LEGACY decorator form the DI / ORM ecosystem (NestJS, TypeORM, Angular) is written against.

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

```ts
@Entity()
class Account {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  balance: number;
}
```

### `emitDecoratorMetadata`

When `emitDecoratorMetadata` is also set, Nub emits the `Reflect.metadata(...)` calls DI containers read for constructor-parameter type inference. The emitted code references `Reflect.metadata`, so INSTALL and IMPORT `reflect-metadata` yourself, exactly as on plain TypeScript — Nub does NOT auto-inject it.

### Stage 3 decorators are not supported

Stage 3 decorators — TypeScript 5's default when NEITHER flag is set — are NOT supported: that transform is an upstream gap in oxc (oxc-project/oxc#9170). Nub rejects Stage-3-shaped decorator syntax with a diagnostic pointing you at `experimentalDecorators: true`.

## Module resolution

Nub adds a TypeScript-aware resolution layer on top of Node's own resolver. It owns EXACTLY the cases Node has no opinion on:

- `tsconfig.json` `paths` / `baseUrl` aliases
- extensionless imports in TypeScript files
- the `.js`→`.ts` emit-convention swap

Everything else falls THROUGH to Node unchanged: `node_modules` resolution, `exports` / `imports` maps, export conditions, and package names. If your editor's Go-to-Definition works on an import and `tsc` accepts it, Nub resolves it the same way at runtime — no `tsconfig-paths` package, no build step.

```ts
import { db } from "@db";                 // tsconfig paths alias
import { config } from "./config";        // extensionless → ./config.ts
import { handler } from "./handler.js";   // .js→.ts swap → ./handler.ts when no .js exists
```

### `paths` and `baseUrl`

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@db": ["src/db/index.ts"]
    }
  }
}
```

Matching follows `tsc` rules: an EXACT pattern wins outright, and among wildcard patterns the LONGEST matching prefix wins. Node builtins ALWAYS take precedence — `import "os"` is `node:os`, never `baseUrl/os.ts`. Path aliases work from any file, including a `.js` file that imports a `paths` alias.

With `baseUrl` set and no matching `paths` entry, a bare specifier resolves RELATIVE to the base directory — `import "lib/config"` finds `<baseUrl>/lib/config.ts`. A bare specifier with no `baseUrl`-relative file on disk falls through to Node's `node_modules` resolution.

### `extends`

Nub walks up to the nearest `tsconfig.json` and follows `extends` chains, including:

- array `extends` (LATER entries win),
- package extends like `"@tsconfig/node20/tsconfig.json"`, resolved through `node_modules`,
- the TS 5.5 `${configDir}` template, interpolated against the consuming config's directory.

Configs are read ONCE per process. Edit your `tsconfig.json` and RESTART the process — or let `nub watch` restart it for you.

### Extensionless imports

In TypeScript-family files, extensionless imports resolve the way `tsc` resolves them (`import "./foo"` finds `./foo.ts`). The probe order is parent-EXTENSION-aware:

```text
.ts  parent →  .ts  .tsx  .js  .jsx  .json
.tsx parent →  .tsx  .ts  .jsx  .js  .json   # JSX extensions sort first
.mts parent →  .mts  .ts  .mjs  .js  .json
.cts parent →  .cts  .ts  .cjs  .js  .json
```

A directory import honors the directory's `package.json` `"main"` before falling back to probing `index.<ext>` in that same parent-aware order. Only `"main"` is consulted — `exports` is NEVER read for a directory-PATH import, matching Node (which honors `exports` only for package-name resolution).

This probing is scoped to TypeScript-family parent files (`.ts` / `.tsx` / `.mts` / `.cts`) with a RELATIVE specifier. A plain `.js` file stays strict about extensions, exactly like vanilla Node.

### `.js`→`.ts` resolution

With `moduleResolution: "nodenext"`, `tsc` wants a `.js` extension on relative imports even though the file on disk is `.ts`. Nub reverses that at runtime, so the same source runs before and after a build.

```ts
import { handler } from "./handler.js";   // resolves ./handler.ts when no ./handler.js exists
```

The LITERAL extension always wins first: a real on-disk `./handler.js` is used as-is, and the swap only fires when the written extension points at a file that DOESN'T exist. The same rewrite covers `.jsx → .tsx`, `.mjs → .mts`, and `.cjs → .cts` — and a real `.cjs` beats a sibling `.cts`. This is the `tsc`/`tsx` emit convention, not a guess at the file's type.

### Yarn Plug'n'Play

A project Yarn installed in PnP mode just runs — Nub enables Plug'n'Play automatically, no flag, no setup. Walking up from the working directory, Nub detects a `.pnp.cjs` at the project root and injects it AHEAD of its own preload (`--require .pnp.cjs` on the fast tier; the `NODE_OPTIONS` equivalent on the compat tier), so PnP's resolver patches install first and Nub's TypeScript resolution layers on top.

Both module systems resolve under PnP, by different paths:

| Module system | Resolved by |
|---|---|
| CommonJS (`require`) | PnP's own `_resolveFilename` patch, installed by the injected `--require .pnp.cjs` |
| ESM (`import`) | Nub's resolve hook calling `pnpapi.resolveRequest` — honoring import conditions and tagging the format (zip-stored pure-ESM loads as ESM) |

Nub does NOT register Yarn's `.pnp.loader.mjs` (its ESM resolver collides with the fast tier's `module.registerHooks`), so the same `pnpapi.resolveRequest` path serves both tiers. This works across the whole supported Node range (18.19+) on macOS, Linux, and Windows — including `import` of zip-stored packages. Nub RUNS a PnP project; it does NOT itself PRODUCE a PnP install — that stays Yarn's job. Package `extends` chains resolve through the `node_modules` walk rather than the PnP API.

## Environment files (`.env*`)

Nub reads your `.env*` files and injects them into the environment BEFORE Node starts — no `dotenv` import, no `--env-file` flag. Loading happens from the NEAREST directory with a `package.json` (walking up from your cwd), matching Vite's single-directory model. Works on every supported Node version (18.19+).

```bash
nub server.ts   # .env* in the project root are loaded automatically
```

### File precedence

Four filenames are loaded, highest priority first. The SHELL environment always wins over all of them — a value already set in the process environment is never overridden. Among the files, the FIRST to define a key wins (first-writer-wins).

1. `.env.[mode].local`
2. `.env.local`
3. `.env.[mode]`
4. `.env`

The `[mode]` slots exist only when a mode is set.

```bash
# reads .env.production.local, .env.local, .env.production, .env
APP_ENV=production nub server.ts
```

### Selecting the mode

`APP_ENV` is the PRIMARY selector: set it to a non-empty value matching `[A-Za-z0-9_.-]` and the matching `.env.[mode]` files load. It accepts any mode name and wins over `NODE_ENV` when both are set — a framework-neutral selector that drives which files load WITHOUT flipping `NODE_ENV`. A value with a path separator (a stray `APP_ENV=../other`) is ignored: the `[mode]` files are skipped, `.env` and `.env.local` still load, and no error is raised.

```bash
APP_ENV=production nub server.ts   # reads .env.production*
APP_ENV=staging nub server.ts      # reads .env.staging*
```

When `APP_ENV` is UNSET, `NODE_ENV` acts as a fallback — but Nub CLAMPS it to `development`, `production`, or `test` (matching Next.js and Bun). Those three values select the corresponding `.env.[mode]` files; any other value (a `NODE_ENV=staging`) is ignored for file selection, and only `.env` and `.env.local` load. For an arbitrary mode name, use `APP_ENV`.

```bash
NODE_ENV=production nub server.ts  # APP_ENV unset → reads .env.production*
NODE_ENV=staging nub server.ts     # not canonical → reads only .env, .env.local
```

Nub NEVER *sets* `NODE_ENV`, and a `.env` file cannot change it: a `.env` that assigns `NODE_ENV` has that one key IGNORED on load (matching dotenv, Next.js, and Vite) and Nub WARNS. Otherwise a `.env` pinning `NODE_ENV=development` would leak into production tooling (e.g. `next build` running its prerender workers in development mode).

### Test environment

When the mode is `test` — from `APP_ENV=test` or `NODE_ENV=test` — the `.env.local` slot is SKIPPED, so only `.env.test.local`, `.env.test`, and `.env` load. This keeps developer-machine secrets in `.env.local` out of the test environment.

### Variable expansion

Values support `${VAR}` and `$VAR` references. References resolve against the other loaded values first, then the shell environment; an undefined reference resolves to the EMPTY string. Expansion is MULTI-PASS, so a value can reference another value that itself references a third.

```bash
# .env
HOST=localhost
PORT=5432
DATABASE_URL=postgres://${HOST}:${PORT}/app   # $HOST is equivalent to ${HOST}
```

Escape a literal dollar sign with `\$`. FOOTGUN: `PASSWORD=foo$bar` truncates to `foo` when `bar` is unset, since `$bar` expands to the empty string — quote and escape it as `PASSWORD="foo\$bar"`.

### Flags

- **`--env-file=<path>`** — DISABLES automatic `.env*` discovery entirely; only the named file loads, read through the same parser and `${VAR}` expansion, with the shell env still winning. Repeatable — pass it more than once to load several files in order; a LATER file overrides a key set by an earlier one. A MISSING FILE IS AN ERROR.

  ```bash
  nub --env-file=.env.ci server.ts                        # only .env.ci; auto discovery skipped
  nub --env-file=.env --env-file=.env.production server.ts # both; .env.production wins shared keys
  ```

- **`--env-file-if-exists=<path>`** — the Node v22 variant; loads the file when present and SKIPS SILENTLY otherwise. Identical to `--env-file` in every other respect.

  ```bash
  nub --env-file-if-exists=.env.local server.ts
  ```

- **`--no-env-file`** — loads ZERO env files: automatic discovery is suppressed and any `--env-file` / `--env-file-if-exists` is IGNORED. Everything else Nub does — TypeScript, JSX, the module hooks — stays ON. It wins over both other flags, on every surface (a file run, `nub run`, `nubx`, and `nub watch`).

  ```bash
  nub --no-env-file --env-file=.env.ci server.ts   # --env-file ignored; child sees neither
  ```

For a persistent, whole-tree opt-out that ALSO disables the rest of Nub's augmentation (TS/JSX/hooks), use `--node` or `NODE_COMPAT=1` instead.

Ground truth: <https://nubjs.com/docs/runtime/typescript>, <https://nubjs.com/docs/runtime/jsx>, <https://nubjs.com/docs/runtime/decorators>, <https://nubjs.com/docs/runtime/resolution>, <https://nubjs.com/docs/runtime/env>.
