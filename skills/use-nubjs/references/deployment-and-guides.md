# Nub deployment and integration guides

Nub (nubjs) v0.6.0 is a Rust CLI that augments the user's installed Node.js — it is not a fork and ships no patched Node. This reference covers getting the `nub` CLI into a build or deploy environment (the GitHub Action, the official Docker images, the devDependency pattern for hosted builders) and the integration/migration guides (Bun → Nub, Turborepo, Nub vs Vite+).

## Deployment

A Nub project needs the `nub` CLI present wherever it builds. Which path to use depends on whether the environment gives you a setup step:

| Environment | Path |
|---|---|
| GitHub Actions | the [`nubjs/setup-nub`](#github-action--nubjssetup-nubv0) action |
| A Dockerfile you control | the [official images](#docker) or one line onto your own `node` base |
| A hosted builder that runs the install itself (Cloudflare Workers Builds, Netlify, some Vercel) | the [devDependency pattern](#hosted-builders--devdependency-pattern) |

### Hosted builders — devDependency pattern

Hosted build environments run the install themselves from your lockfile and provision Node from `.node-version`/`.tool-versions`. There is no seam to add a setup step, so a `package.json` script that shells out to `nub` fails before it starts:

```console
sh: nub: not found
```

Add `@nubjs/nub` as a devDependency and call it from your scripts:

```json
{
  "devDependencies": {
    "@nubjs/nub": "^0.6.0"
  },
  "scripts": {
    "build": "nubx vite build"
  }
}
```

The package declares `bin: { nub, nubx }`, so any installer — including the pnpm these builders run — links both onto `node_modules/.bin`, and your scripts resolve them no matter who ran the install. This holds even under pnpm's default blocking of dependency build scripts (pnpm 10+): bin-linking is independent of script approval, and Nub's launcher sets its own execute bit at runtime, so there is nothing to allowlist.

It coexists with the project's real package manager — Nub reads the existing lockfile, so `@nubjs/nub` sits in `devDependencies` alongside pnpm, npm, or bun without conflict.

The builder still provisions Node from your version pin — set it so the build Node matches the version Nub resolves at runtime. Precedence:

- `package.json` → `devEngines.runtime`
- `.node-version`
- `.nvmrc`
- `package.json` → `engines.node`

### Version managers

Environments driven by `.tool-versions` can provision the CLI directly. [mise](https://mise.jdx.dev) ships a `nub` entry, so `mise use nub@latest` puts `nub` and `nubx` on PATH.

### GitHub Action — `nubjs/setup-nub@v0`

A drop-in for [`actions/setup-node`](https://github.com/actions/setup-node). Swap one line and the workflow keeps working:

```diff
steps:
  - uses: actions/checkout@v4
-   - uses: actions/setup-node@v4
+   - uses: nubjs/setup-nub@v0
  - run: nub install
  - run: nub run test
```

`actions/checkout` MUST run before the action, because the Node pin lives in the repository. The action installs the `nub` CLI, eagerly provisions the project's pinned Node into Nub's cache during setup (downloaded and ready before any step runs, never lazily mid-build), and adds that Node's bin directory to the runner's global PATH — so bare `node`, `npm`, and `npx` in later steps run the pinned version.

```yaml
- uses: actions/checkout@v4
- uses: nubjs/setup-nub@v0
- run: node --version   # the project's pinned Node, not the runner default
- run: nub install
```

All `actions/setup-node` inputs are accepted, so the swap is always mechanical — inputs Nub cannot honor are accepted and ignored rather than erroring. A project with no pin is fine: the eager step skips cleanly and Nub provisions at runtime instead.

Pin resolution order (the version the action provisions and fronts):

1. `package.json#/devEngines/runtime`
2. `.node-version`
3. `.nvmrc`
4. `.tool-versions` (the asdf/mise file's `nodejs` line)
5. `package.json#/engines/node`

#### Inputs

| Input | Default | Description |
|---|---|---|
| `nub-version` | `latest` | Version of Nub to install — any semver range npm understands. |
| `node-version` | | Provision this version and front it on PATH instead of the project pin. Warns if it differs from the project's declared pin. |
| `node-version-file` | | Read a version from a file and front it on PATH. Accepts `.node-version`, `.nvmrc`, `package.json` (reads `devEngines.runtime`, then `engines.node`). |
| `cache` | auto | Cache Nub's store and provisioned toolchains. Auto-enables on a lockfile or a `package.json` declaring `packageManager`/`devEngines`; an explicit boolean wins. A PM name (`npm`/`pnpm`/`yarn`/`bun`) is accepted for compatibility and treated as on. |
| `package-manager-cache` | `true` | The disable knob for the automatic caching above; set `false` to turn caching off without setting `cache`. |
| `cache-dependency-path` | | Lockfile path(s), glob, or newline-delimited list whose hash keys the cache. |
| `cache-key-prefix` | | Prefix injected into the cache key (`nub-<os>-<arch>-<prefix>-<hash>`) to scope or bust caches independently of the lockfile. |
| `working-directory` | checkout root | Directory to resolve the pin and lockfile from, for monorepo subdirectories. |
| `registry-url` | | Registry to set up for auth; writes a temporary user-level `.npmrc` via `NPM_CONFIG_USERCONFIG` and wires the token to `NODE_AUTH_TOKEN`. |
| `scope` | | Scope for a scoped registry; falls back to the repository owner for GitHub Packages. |
| `always-auth` | `false` | Write `always-auth=true` to authenticate on every registry request. |
| `token` | `github.token` | Token for GitHub-API rate-limit relief when resolving Nub's version range (and Node downloads on GHES). |

Accepted-and-ignored setup-node inputs (present so a swap never errors, no effect): `check-latest`, `architecture`, `mirror`, `mirror-token`. The `version` input is a **deprecated alias** for `nub-version` and emits a warning.

Cache-key lockfile auto-detect order:

1. `pnpm-lock.yaml`
2. `package-lock.json`
3. `bun.lock`
4. `bun.lockb`
5. `yarn.lock`

Authenticated registry example (GitHub Packages — scope defaults to the repo owner):

```yaml
- uses: nubjs/setup-nub@v0
  with:
    registry-url: https://npm.pkg.github.com
- run: nub install
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Front a version instead of the project pin (Nub still runs the declared pin when invoked as `nub`, so the action warns on a mismatch):

```yaml
- uses: nubjs/setup-nub@v0
  with:
    node-version: 26
```

#### Outputs

| Output | Description |
|---|---|
| `nub-version` | The installed Nub version. |
| `node-version` | The Node version provisioned during setup; **empty when nothing was provisioned**. |
| `cache-hit` | Whether an exact store-cache match was restored; **empty on a miss**, mirroring `actions/cache`. |
| `caching-enabled` | Whether caching is active for this run, independent of whether a cache was hit. |

Differences from setup-node: `cache` is a boolean rather than a PM name (a PM name still works, treated as on — Nub keeps one store regardless of package manager); the registry `.npmrc` is written fresh to `$RUNNER_TEMP` and pointed at via `NPM_CONFIG_USERCONFIG` rather than merged into the user `.npmrc` (both parse identically).

### Docker

Nub augments the Node already in your image — it is not a separate runtime. The official images start from an official `node` base and layer Nub on top, so `node`, `npm`, and `nub` are all present.

```dockerfile
FROM ghcr.io/nubjs/nub
COPY --chown=node:node . .
RUN nub install
CMD ["nub", "run", "start"]
```

The image runs as the non-root `node` user (uid 1000), so copy your project in with `--chown=node:node` — a bare `COPY . .` lands root-owned files that `nub install` then cannot write alongside. The entrypoint passes any non-command argument to `nub`:

```bash
docker run --rm -v "$PWD:/app" ghcr.io/nubjs/nub script.ts
```

Signals reach the runtime: `docker stop` delivers `SIGTERM` to `nub`, which forwards it to the Node process for a clean shutdown. When you bind-mount a directory that `nub install` must write into, run with `--user "$(id -u)"` so the writes land with your host ownership.

Variants — digest-pinned, published for `linux/amd64` and `linux/arm64`, both on the current Node release line:

| Tag | Base | libc |
|---|---|---|
| `latest`, `<version>`, `slim`, `<version>-slim` | `node:26-slim` | glibc |
| `alpine`, `<version>-alpine` | `node:26-alpine` | musl |

#### Adding Nub to your own image

Install Nub with one line. At install time npm selects the correct per-platform binary (including the musl build on Alpine) and the postinstall sets the execute bit, so installing as root and then dropping to a non-root user works.

```dockerfile
FROM node:26-slim
RUN npm install -g @nubjs/nub
```

On Alpine, add `libgcc` and `libstdc++` for the native addon:

```dockerfile
FROM node:26-alpine
RUN apk add --no-cache libgcc libstdc++ && npm install -g @nubjs/nub
```

To pin the fast-tier floor Node version instead of the current line, use a `22` base (`node:22-slim` or `node:22-alpine`) — the lowest version Nub's fast tier supports.

#### Multi-stage builds

Install with `nub ci` in the BUILD stage. It writes a self-contained `node_modules` — real files, project-local links — that survives a `COPY --from` into the final stage. A plain `nub install` shares packages through a machine-global store the final stage does not have, so a copied tree would point at files that are not there.

```dockerfile
FROM node:26-slim AS build
RUN npm install -g @nubjs/nub
WORKDIR /app
COPY . .
RUN nub ci

FROM node:26-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
CMD ["nub", "run", "start"]
```

## Guides

### Migrating from Bun to Nub

Nub runs your TypeScript directly on stock Node (the version your project pins, provisioned on demand), your package manager and lockfile stay where they are, and the `Bun.*` APIs your code calls get swapped for their Node or npm-ecosystem equivalents. Most of the work is the last part.

#### Runtime and TypeScript execution

Bun runs `.ts` files directly; so does Nub — point it at an entry file and it transpiles TypeScript (and JSX, enums, namespaces, parameter properties, `emitDecoratorMetadata`) on stock Node, with no `tsconfig` build step and no separate loader.

```bash
bun run src/index.ts          # before
nub src/index.ts              # after
```

There is **no `nub run <file>` form for a bare file**. `nub <file>` is the file runner; `nub run <script>` is the `package.json` script runner. Keep the two straight: `nub run dev` runs the `"dev"` script, `nub src/server.ts` runs the file.

For differential debugging — to rule out a transpile or augmentation difference — `nub --node <file>` runs the file on plain Node with Nub's augmentation off, still on the project's pinned version. A truthy `NODE_COMPAT` env var does the same thing tree-wide and persistently.

#### Choosing a Node version

Bun bundles its runtime; on Nub you pick a real Node version, because Nub runs *your* Node. Pin it the ecosystem way (`.nvmrc`, a `packageManager`/`devEngines` entry, or `nub node pin`). Pick a version your dependencies actually support — a too-old floor fails at runtime on missing globals, not at install. Tiers: the **fast tier is Node 22.15+** (synchronous module hooks); the **compat tier is 18.19–22.14** (async loader-worker path). Both transpile TypeScript; the mechanism differs.

#### Package manager and lockfile

Nub's PM CLI mirrors pnpm's command grammar:

| Bun | Nub |
|---|---|
| `bun install` | `nub install` (alias `nub i`) |
| `bun add <pkg>` | `nub add <pkg>` |
| `bun remove <pkg>` | `nub remove <pkg>` |
| `bunx <pkg>` | `nubx <pkg>` (always-fetch: `nub dlx <pkg>`) |

Nub is **lockfile-compatible** with what your project already uses — it round-trips npm, pnpm, and bun lockfiles and reads yarn's — so you do not convert your lockfile to adopt Nub. The CLI grammar is pnpm's; the lockfile axis is multi-PM.

One real difference from Bun: Nub follows pnpm's dependency model, which does **NOT auto-install peer dependencies**. Packages that worked under Bun because Bun silently installed their peers surface as missing — add the peers explicitly to `package.json`. This is the single most common post-migration install surprise.

#### Scripts: parallel and sequential

`nub run` mirrors pnpm's script grammar, not Bun's `--parallel`/`--sequential`:

- A single script name runs that script: `nub run build`.
- A `/regex/` literal runs every script whose name matches, in `package.json` order: `nub run "/^build:/"`. The matched set runs concurrently by default (`--sequential` serializes it).
- Space-separated `nub run a b` is **NOT** a multi-script form — exactly as in pnpm, that runs script `a` with `b` as an argument. `nub run lint test` does not run two scripts.

There is no native `run-p`/`run-s` with an explicit list of named scripts. If your Bun setup leaned on `--parallel <a> <b> <c>`, use [`npm-run-all2`](https://github.com/bcomnes/npm-run-all2), which runs cleanly under Nub:

```jsonc
// package.json
{
  "scripts": {
    "check": "run-p lint typecheck test",   // parallel
    "release": "run-s build publish"         // sequential
  }
}
```

If script names share a prefix, the regex selector needs no dependency: name them `check:lint`, `check:typecheck`, `check:test` and run `nub run "/^check:/"`.

#### Environment files

Nub auto-discovers and loads `.env*` files for the file runner, `nub run`, and `nub watch`, and accepts an explicit `--env-file`:

```bash
bun --env-file=.env.production src/index.ts
nub --env-file=.env.production src/index.ts
```

- Passing any `--env-file` flag **suppresses** Nub's automatic `.env*` discovery — only the named file(s) load ("explicit means explicit"). This matches Bun and Node.
- Nub **expands `${VAR}`** cross-references in env-file values (both the auto-load and explicit-flag paths). Plain Node's `--env-file` parser does not expand; Nub closes that gap.
- The **shell environment wins** over file values (a var already set is not overwritten).
- `--env-file-if-exists=<path>` behaves like `--env-file` but **skips a missing file silently** instead of erroring — reach for it for optional overrides such as `.env.local`. It loads through Nub's own `.env` layer (same `${VAR}` expansion, shell env still wins), and `--no-env-file` overrides it.

#### The `Bun.*` / `bun:*` API map

Standard Web APIs (`fetch`, `Request`/`Response`, `Headers`, `FormData`, `WebSocket` client, `crypto.subtle`, `crypto.randomUUID`, `structuredClone`, streams) are built-in on Node and Nub — nothing to migrate. `Bun.Transpiler` is unnecessary under Nub. The genuinely Bun-only batteries map to a maintained Node primitive or npm package:

| Bun API | Recommended replacement |
|---|---|
| `Bun.serve` | [Hono](https://hono.dev) (`@hono/node-server`), [Fastify](https://fastify.dev), or [Express](https://expressjs.com); `node:http` raw |
| `Bun.serve` WebSocket handler | [`ws`](https://github.com/websockets/ws) |
| `Bun.$` (shell) | [`dax`](https://github.com/dsherret/dax) (closest chainable mirror, cross-platform) or [`zx`](https://github.com/google/zx) |
| `Bun.spawn`, `Bun.spawnSync` | [`execa`](https://github.com/sindresorhus/execa) or `node:child_process` |
| `Bun.sql`, `Bun.SQL` (Postgres) | [`postgres`](https://github.com/porsager/postgres) (postgres.js — near-drop-in) or [`pg`](https://github.com/brianc/node-postgres) |
| `bun:sqlite` | [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) or `node:sqlite` (Node 22.5+) |
| `Bun.redis` | [`ioredis`](https://github.com/redis/ioredis) or [`redis`](https://github.com/redis/node-redis) |
| `Bun.s3`, `Bun.S3Client` | [`@aws-sdk/client-s3`](https://github.com/aws/aws-sdk-js-v3) |
| `Bun.password` | `node:crypto` `scrypt` or [`@node-rs/argon2`](https://github.com/napi-rs/node-rs/tree/main/packages/argon2) (argon2id) |
| `bun:test` | [Vitest](https://vitest.dev) or `node:test` |
| `Bun.Glob` | [`tinyglobby`](https://github.com/SuperchupuDev/tinyglobby) or [`fast-glob`](https://github.com/mrmlnc/fast-glob); `node:fs` `glob` (Node 22+) |
| `Bun.file` / `Bun.write` | `node:fs`/`node:fs/promises` (`fs.openAsBlob` for a real Blob, Node 20+) |
| `bun:ffi` | [`koffi`](https://github.com/Koromix/koffi) |
| `HTMLRewriter` | [`cheerio`](https://github.com/cheeriojs/cheerio) or [`node-html-parser`](https://github.com/taoqf/node-html-parser) (DOM-buffered) — **true streaming rewrite is a genuine gap; Nub ships no rewriter** |
| `Bun.CryptoHasher`, `Bun.sha` | `node:crypto` `createHash`/`createHmac` |
| `Bun.gzipSync`/`Bun.deflateSync`/zstd | `node:zlib` (zstd on Node 22.15+/23.8+) |
| `Bun.env`, `Bun.argv`, `Bun.main` | `process.env`, `process.argv`, `process.argv[1]` / `import.meta.main` (Node 24+) |
| `Bun.build`, `Bun.plugin` | [esbuild](https://github.com/evanw/esbuild), [tsup](https://github.com/egoist/tsup), [rolldown](https://github.com/rolldown/rolldown); the bundler's plugin API |

For high-frequency APIs (`Bun.file`, `Bun.write`, `Bun.spawn`, `Bun.$`), write one small shim module that re-exports Node primitives under the call shapes your code uses — the diff stays localized to that file.

`import.meta` renames (mechanical, ESM): `import.meta.dir` → `import.meta.dirname`; `import.meta.file` → `import.meta.filename`; `__dirname`/`__filename` in ESM → the `import.meta.*` forms; `import.meta.main` is native on Node 24+ (otherwise compare `process.argv[1]` to the resolved module path).

#### Supply-chain cooldown (`minimumReleaseAge`)

Nub honors the same gate as Bun's `bunfig.toml` `[install].minimumReleaseAge`. As a Nub-identity project it lives in `.npmrc` as `minimum-release-age`, in **MINUTES**:

```ini
# .npmrc
minimum-release-age=1440   # one day
```

Note the unit change from bunfig, which expresses it in **seconds** (`nub install` converts, rounding up so a small non-zero gate never collapses to zero). Bun's `minimumReleaseAgeExcludes` maps to Nub's `minimumReleaseAgeExclude`.

#### Production server, Docker, CI, and bots

For a built, already-transpiled server bundle, run it with `node` directly and reach for Nub in the build stage (install, run scripts, run TypeScript entrypoints). If your runtime targets Bun (e.g. Nitro's `bun` preset), switch it to the Node target and change the Docker base:

```dockerfile
FROM node:26-slim
RUN npm install -g @nubjs/nub
# ... copy app, nub install, build ...
CMD ["node", ".output/server/index.mjs"]
```

- **CI:** replace the Bun setup action with [`nubjs/setup-nub`](#github-action--nubjssetup-nubv0).
- **Dependabot / Renovate:** no native Nub support. Use `package-ecosystem: "npm"` so the bot understands your manifest, and add a workflow step that runs `nub install` after the bot's update to regenerate the lockfile in Nub's format — otherwise `package.json` and the lockfile drift.

#### Gotchas worth pre-empting

- **Peer dependencies are not auto-installed** — the biggest behavioral difference from Bun; expect more than one to surface.
- **`nub run a b` is not multi-script** — use a `/regex/` selector or `npm-run-all2`.
- **`--env-file` suppresses auto-discovery** — pass every file you need, or rely on auto-discovery.
- **Pin a realistic Node version** — a too-old floor fails at runtime, not install.
- **Memory profile differs** — Node generally uses more memory than Bun for the same parallel fan-out; cap concurrency if heavy parallel tasks OOM after migrating.

### Using Nub with Turborepo

Turborepo and Nub compose without either knowing about the other: **Turborepo owns the task graph and cache; Nub is the runtime and package manager underneath.** You do not reconfigure Turborepo to adopt Nub — you keep your existing setup and run Turborepo *through* Nub.

The whole integration:

- Keep your `package.json` `packageManager` field and existing lockfile exactly as they are.
- Install with `nub install` instead of your old package manager.
- Run Turborepo under Nub — `nub run <script>` where the script is `turbo run …`, or `nubx turbo run …`.

You do **not** tell Turborepo to use Nub. Turborepo infers the PM from the `packageManager` field (Corepack format, e.g. `pnpm@9.12.0`) plus the lockfile; it recognizes npm/pnpm/yarn/bun and there is no Nub identifier for it to recognize. Because Nub is lockfile-compatible, Turborepo keeps seeing the incumbent PM and stays happy.

```bash
pnpm install          # before
nub install           # after — same lockfile, same node_modules layout
```

**Mechanism (why augmentation reaches into a task):** `turbo run build` does not execute each package's script body itself — for every package defining the task it spawns the repo's PM (`pnpm run build` in the package directory). That subprocess inherits its environment from Turborepo, which inherits it from whatever launched Turborepo. When Turborepo runs under Nub, Nub has already set the augmentation environment (a `NODE_OPTIONS` preload and a `node` shim on PATH), and that flows down the whole tree. The result: a package whose build script is plain `node ./build.ts` runs TypeScript directly and loads that package's `.env` — inside a Turborepo task, with no per-package configuration.

```jsonc
// packages/lib/package.json
{ "name": "@acme/lib", "scripts": { "build": "node ./build.ts" } }
```

```bash
nub run build         # root script: "turbo run build"
```

Gotchas:

- **Turborepo MUST run under Nub, every time.** A bare `turbo run` from a plain shell will not carry the augmentation, and a `.ts` entry fails to parse. Keep the entry point a `nub run` script (or `nubx turbo`) so it is automatic for everyone and in CI.
- **Nub's `.env` loading is task-level and independent of Turborepo's cache hashing.** Nub augments the Node that runs each script, so each task gets its package's `.env`. Turborepo's own `env`/`globalEnv` declarations control cache hashing, not loading — if a value must affect the cache, it still belongs in `turbo.json`. Nub's augmentation rides in `NODE_OPTIONS`, which Turborepo passes through but does not fold into the hash unless you declare it, so adopting Nub does not by itself invalidate your cache.
- **Do not rewrite package scripts to say `nub`.** A script of `node ./build.ts` is enough — Nub's augmentation is what turns that into a TypeScript-aware run.

Pin the Node version the ecosystem way (`.nvmrc`, `packageManager`/`devEngines`, or `nub node pin`); Nub provisions it and every task across the monorepo runs on the same version without nvm or Corepack.

### Nub vs Vite+

Nub is a better developer experience on stock `node` plus a full package manager; [Vite+](https://viteplus.dev) is the Vite team's integrated frontend toolchain. They overlap on the everyday Node workflow and diverge on scope.

| Functionality | Nub | Vite+ |
|---|:-:|:-:|
| Script runner (`npm run`) | ✅ | ✅ |
| Bin runner (`npx`) | ✅ | ✅ |
| Node version manager (`nvm`) | ✅ | ✅ |
| TypeScript runner (`tsx`) | ✅ | ❌ |
| Package manager | ✅ | ❌ — passthrough |
| PM shims (`corepack`) | ✅ | 🟡 — npm only |
| Dev server | ❌ — bring your own | ✅ — Vite |
| Bundler | ❌ — bring your own | ✅ — Rolldown |
| Formatter | ❌ — bring your own | ✅ — Oxfmt |
| Linter | ❌ — bring your own | ✅ — Oxlint |
| Type checker | ❌ — bring your own | ✅ — tsgo (embedded) |
| Test runner | ❌ — bring your own | ✅ — Vitest |

Running a file is where the difference shows:

```bash
nub app.ts        # augmented, on stock Node
vp node app.ts    # plain Node
```

`nub app.ts` augments stock Node — full TypeScript syntax (enums, decorators, parameter properties, `import =`, extensionless imports), JSX/TSX with the runtime resolved from `tsconfig`, `tsconfig` module resolution (`paths`, `baseUrl`, `extends`) applied at runtime, automatic `.env`/`.env.[mode]` loading, data imports (YAML/TOML/JSON5/JSONC/text load like JSON), and polyfilled newer globals (`Worker`, web storage, `Temporal`, `URLPattern`). `vp node app.ts` is unaugmented — it defers to Node's own native type-stripping, with no `tsconfig`-aware resolution and none of those loaders or polyfills.

Two more distinctions:

- **Package management.** Nub is a full package manager (embedded [aube](https://github.com/jdx/aube) engine) — it resolves the graph, links `node_modules`, and round-trips whatever lockfile your project uses. Vite+ is a passthrough: in a pnpm project, `vp install` runs pnpm's install.
- **Type checking.** Nub transpiles but **never type-checks** — bring your own type checker. Nub is deliberately unopinionated on the frontend toolchain, leaving the dev server, bundler, formatter, linter, and test runner to whatever you pull in as `devDependencies`.

Ground truth: https://nubjs.com/docs/deployment · https://nubjs.com/docs/deployment/github-action · https://nubjs.com/docs/deployment/docker · https://nubjs.com/guides/bun-to-nub · https://nubjs.com/guides/turborepo · https://nubjs.com/guides/vite-plus
