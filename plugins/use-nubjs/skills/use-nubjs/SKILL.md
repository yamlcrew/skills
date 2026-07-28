---
name: use-nubjs
description: >-
  Use this skill whenever working with nub (nubjs), the Rust CLI toolkit that augments Node.js:
  running files with `nub <file>` (TypeScript/JSX, no build step), `nub run` scripts, `nubx` /
  `nub dlx` / `nub x` / `nub exec` package execution, `nub install` and the pnpm-compatible package
  manager (`add`/`remove`/`update`/`ci`/`dedupe`/`import`), `nub pm` Corepack-style shims, `nub node`
  Node-version management, `nub init` / `nub upgrade` / `nub watch`, the `@nubjs/nub` binary or
  `@nubjs/types` package, migrating a project to nub (from Bun, pnpm, npm, or Yarn), or setting nub
  up in CI/Docker. Also use it for questions about nub's TypeScript/JSX runtime, data-format
  loaders, `.env` loading, or Node-version-gated web APIs.
---

# Using Nub (nubjs)

Act as a senior engineer who knows Nub 0.6.0 inside out. Nub is a **Rust CLI that _augments_ the
user's installed Node.js** — it is not a new runtime and not a Node fork. Ground every claim in the
local project's setup, then the references below, then upstream docs — never invent a `nub`
subcommand, flag, or config key.

## What Nub is (0.6.0)

One Rust binary (`@nubjs/nub`) that layers a Bun-like DX on top of stock `node` via Node's own
extension surfaces (`--import`/`--require` preload, `module.registerHooks()`, `NODE_OPTIONS`/V8-flag
injection, N-API addons — an embedded `oxc` transpiler). It replaces a **toolchain**, not the
runtime:

| Nub surface | Replaces |
| --- | --- |
| `nub <file>` | `node`, `tsx`, `ts-node`, `dotenv-cli` |
| `nub run <script>` | `npm run`, `pnpm run` |
| `nubx` / `nub dlx` / `nub x` / `nub exec` | `npx`, `pnpm dlx` / `pnpm exec` |
| `nub install` (+ `add`/`remove`/`ci`/…) | `npm`, `pnpm` (pnpm-compatible CLI) |
| `nub watch` | `nodemon`, `node --watch`, `tsx watch` |
| `nub pm` | `corepack` |
| `nub node` | `nvm`, `fnm`, `n`, `volta` |

**Compatibility is the contract.** Code written for Node runs on Nub byte-for-byte. Default mode =
augmentation on; `--node` (per-invocation) or `NODE_COMPAT=1` (tree-wide, inherited) = augmentation
off, plain Node — Node-version provisioning stays on either way.

**Requirements:** augmented modes need **Node 18.19+** (below that, augmented commands error). Nub
runs on macOS/Linux/Windows (arm64, x64). Examples target the latest Node major (currently **26**).

## Workflow

1. Detect how Nub is used in the project: runner, package manager, or both. Check for a lockfile,
   `packageManager` / `devEngines` in `package.json`, `.node-version`/`.nvmrc`, and `nub` in scripts
   or CI.
2. Read `references/overview-and-install.md` for the tool model and verb surface.
3. Read only the reference(s) that match the task (routing table below).
4. Prefer the least-surprising command; confirm a version-sensitive detail with `nub --help` /
   `nub <cmd> --help` against the installed binary rather than guessing.

## Critical rules

1. **Nub has zero nub-specific runtime APIs.** No `globalThis.nub`, no `nub:*` import namespace, no
   `@nub/*` scope, no `"nub"` `package.json` field. Never write nub-branded application code — a
   feature is either a standard Node/Web API or a normal npm import. Types are stripped, not
   checked (keep `tsc --noEmit`).
2. **The package-manager CLI mirrors pnpm — and only pnpm.** Use pnpm flag spellings, never npm-isms
   (`--omit`, `-S`/`--save`, `--no-save` as an npm alias, `--prefix`). `-w` means `--workspace-root`
   (boolean); select workspace members with `--filter`/`-F`, recurse with `-r`. Install dir flag is
   `--dir`/`-C`, not `--prefix`.
3. **No implicit script shortcuts.** Always `nub run <script>`. A bare `nub build` / `nub test` does
   not run the script — it errors with a hint to type `nub run build`.
4. **`nub <file>` is the runtime; `nubx`/`nub dlx`/`nub exec` are the package runners.** The file
   runner accepts `.js .mjs .cjs .ts .mts .cts .jsx .tsx`. There is **no `nub run <file>`** — `nub
   <file>` runs a file, `nub run <script>` runs a `package.json` script.
5. **Disable augmentation with `--node` or `NODE_COMPAT`, never by "using plain Node."** These run
   the project's *pinned* Node with zero augmentation (for differential debugging); provisioning
   stays on. `NODE_COMPAT` is truthy for `1`/`true`/`yes` and is inherited tree-wide.
6. **Node is auto-provisioned by precedence:** `NODE_EXECUTABLE` → `package.json#devEngines.runtime`
   → `.node-version` → `.nvmrc` → `.tool-versions` → `package.json#engines.node` → `node` on PATH.
   Nub fetches (SHA-256-verified) and caches that version.
7. **Modern web/JS APIs are Node-version-gated** — unflagged, polyfilled, or transpiler-downleveled,
   per API and per Node floor (e.g. `Temporal` polyfilled below Node 26; `node:sqlite` from 22.5).
   Never claim a feature "works on every Node version"; state the floor. See `runtime-apis.md`.
8. **The package manager is secure by default:** lifecycle (postinstall) scripts are **denied by
   default**, an OSV `MAL-*` advisory check runs on resolve, provenance downgrades are refused, and a
   24-hour `minimumReleaseAge` cooling window applies. Approve builds with `nub approve-builds` /
   `--allow-build=<pkg>`. Know these are on before diagnosing an install that "refuses" a package.
9. **CLI-compat and lockfile-compat are separate axes.** The CLI grammar is pnpm-only, but Nub is
   lockfile-compatible with whatever the project uses — npm / pnpm / Bun **round-trip**, Yarn is
   **read-only** (a mutating install is refused with the exact `yarn` command). Nub runs in
   **compat-mode**, faithfully mirroring the incumbent PM's config.
10. **A nub-identity project reads only neutral config** (`overrides`, `resolutions`, `catalog`,
    `workspaces`, `packageExtensions`, `patchedDependencies`, `allowBuilds`) — never another PM's
    branded fields; its lockfile is `nub.lock`. Ambient TypeScript types ship as the `@nubjs/types`
    devDep; pair with `@types/node` (latest major).

## Task routing

| Task | Read |
| --- | --- |
| Tool model, installing nub, `nub init`/`upgrade`, verb surface, plugins, `@nubjs/types` | `references/overview-and-install.md` |
| `nub <file>`, supported extensions, tiers, Node provisioning, `--node`/`NODE_COMPAT`, `nub watch` | `references/file-runner.md` |
| TypeScript/JSX transpile, decorators, module resolution, `.env*` loading | `references/runtime-typescript.md` |
| Data-format loaders, web storage, Workers, debugging, version-gated web-API matrix | `references/runtime-apis.md` |
| `nub run` (workspaces, `--filter`, `--stream`), `nubx` / `nub dlx` / `nub exec` | `references/script-and-package-runner.md` |
| `nub install`/`add`/`remove`/`update`/`ci`/`dedupe`/`import`, security, compat-mode, virtual store | `references/package-manager.md` |
| `nub pm` shims (Corepack-style) and `nub node` version management | `references/pm-and-node.md` |
| Docker, the `nubjs/setup-nub` GitHub Action, migrating from Bun, Turborepo, Vite | `references/deployment-and-guides.md` |

## Ground truth

Verify anything the references do not cover against, in order: the installed binary (`nub --help`,
`nub <cmd> --help`, `nub --version`), then the official docs, then the source.

- Docs: <https://nubjs.com/docs>
- Source / issues: <https://github.com/nubjs/nub>
- Published binary: `@nubjs/nub`; ambient types: `@nubjs/types`.

Do not assume this skill's version is current — confirm the project's installed `nub --version` and
prefer its `--help` output when a detail is version-sensitive.
