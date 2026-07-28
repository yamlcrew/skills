# Nub package manager (`nub install`)

Nub ships its own install engine with a **pnpm-shaped CLI**. It does not impose a Nub-only format: it infers whatever package manager a project already uses and mirrors it — reading *and* rewriting that project's native lockfile and config. npm, pnpm, and Bun round-trip; Yarn is read-only. The engine is the vendored [aube](https://github.com/jdx/aube) library, embedded in-process and driven by Nub's own CLI; there is no aube subprocess. Two independent axes: the **CLI grammar is pnpm-only**, and **lockfile compatibility is multi-PM**. Target: nub 0.6.0.

## CLI grammar — pnpm only

The command grammar mirrors pnpm's exclusively — never npm's, Yarn's, or Bun's. When checking a flag, alias, or positional, the only question is "does real pnpm accept it?"

- No npm-isms: no `--omit`, no `-S`/`--save`, no npm-style `--workspaces` / `-w <name>` member selectors.
- `-w` = `--workspace-root` (a boolean), *not* a member selector. Select members with `--filter`/`-F`; recurse with `-r`/`--recursive`.
- Directory is `--dir`/`-C` (pnpm's spelling), never npm's `--prefix`.

### Verb set

All verbs are engine-routed in-process. Registered surface:

| Group | Verbs |
|---|---|
| Install | `install` / `i`, `ci` |
| Mutate deps | `add` / `a`, `remove` (`rm` / `uninstall` / `un` / `uni`), `update` / `up` |
| Graph | `dedupe`, `import`, `why`, `outdated`, `list` / `ls`, `prune` |
| Patch | `patch`, `patch-commit`, `patch-remove` |
| Builds | `approve-builds`, `ignored-builds`, `rebuild`, `fetch` |
| Link | `link`, `unlink` |
| Inspect | `audit`, `licenses`, `peers`, `bin`, `root`, `store`, `config`, `pkg` |
| Publish | `publish`, `pack`, `version` |
| Run | `dlx`, `create` |

`nub pm` is a **separate** surface — the meta-manager that provisions and runs the pinned npm/pnpm/yarn binary (Corepack's job). It is not part of the install engine. `nub pm shim` routes bare `npm`/`pnpm`/`yarn` through the project's pin.

## Verbs and flags

### `nub install` / `nub ci`

`nub install` resolves the graph and links `node_modules`. `nub ci` is a clean install from the lockfile (frozen; drift is a hard error).

| Flag | Effect |
|---|---|
| `--frozen-lockfile` / `--no-frozen-lockfile` / `--prefer-frozen-lockfile` | Lockfile freshness policy; `--frozen-lockfile` fails if out of date |
| `-P` / `--prod` / `--production` | Production install |
| `-D` / `--dev` | Dev dependencies only |
| `--ignore-scripts` | Skip dependency build scripts this install |
| `--no-optional` | Skip optional dependencies |
| `--offline` / `--prefer-offline` | Force offline / try the cache first |
| `--lockfile-only` | Refresh the lockfile, skip `node_modules` |
| `--force` | Force re-resolution |
| `--node-linker <isolated\|hoisted>` | Layout (isolated default; no `pnp`) |
| `--registry <url>` | Default registry override |
| `--dir <path>` / `-C <path>` | Run as if in `<path>` (pnpm's spelling) |
| `--reporter <default\|append-only\|silent>` | Output mode |
| `--silent` / `-s` | Alias for `--reporter=silent` — only fatal errors to stderr |
| `--loglevel <debug\|info\|warn\|error\|silent>` | Log verbosity; `error` hides warnings |

`--reporter=append-only` drops the live progress display but keeps the dependency summary. These spellings apply to every install-family command, before or after the verb (`nub install --silent` or `nub --silent install`).

**Workspace selectors** (on both `install` and `ci`):

| Flag | Effect |
|---|---|
| `--filter <sel>` / `-F <sel>` | pnpm's full selector grammar — exact / `@org/*` / globs / `!neg`, graph (`...@pkg`, `@pkg...`) and changed-since (`[ref]`) selectors, same as the runner (see `script-and-package-runner.md`); install only matched packages |
| `--recursive` / `-r` | Every workspace package |
| `--filter-prod <sel>` | Selector, production deps only |
| `--include-workspace-root` | Add the root package to the recursive set |
| `--fail-if-no-match` | Error if the filter selects zero packages |

### `nub add`

Resolves a package, links it, and writes the dependency into `package.json`. Alias: `a`.

| Flag | Effect |
|---|---|
| `-D` / `--save-dev` | devDependencies |
| `-E` / `--save-exact` | Pin exact (no `^`) |
| `-O` / `--save-optional` | optionalDependencies |
| `--save-peer` | peer + dev (pnpm parity) |
| `-g` | Global install |
| `-w` | Write to the workspace root (`--workspace-root`, boolean) |
| `--save-catalog` | Add into the workspace catalog |
| `--allow-build=<pkg>` | Pre-approve that package's build scripts for this install |
| `--no-save` | Link without persisting to `package.json` |
| `--lockfile-only` | Refresh the lockfile, skip `node_modules` |

Positional forms: `nub add <pkg>`, `nub add <pkg>@<version>` (pin exact).

### `nub remove`

Drops a dependency and relinks. Aliases: `rm`, `uninstall`, `un`, `uni`. Flags: `-D` (devDependencies only), `-g` (global), `-w` (workspace root).

### `nub update`

Re-resolves within ranges. Alias: `up`. `--latest` rewrites `package.json` ranges to the newest resolved versions.

| Form / flag | Effect |
|---|---|
| `nub update` | Refresh all deps within range |
| `nub update <pkg>` | Update a single dependency |
| `nub update <pkg>@<version>` | Pin one dep, keeping its `^`/`~` operator |
| `nub update <pkg>@<tag>` | Move one dep to a dist-tag (`beta`, `next`) as an exact pin |
| `-i` / `--interactive` | Per-package picker (keep / latest-in-range / latest) |
| `-L` / `--latest` | Move past the manifest range |
| `-E -L` | Pin the rewritten range to an exact version |
| `-D` | devDependencies only |
| `-P` | Production only |
| `--lockfile-only` | Refresh the lockfile, leave `node_modules` alone |

The interactive picker selects nothing by default; only rows you flip are updated, and a `latest` that would downgrade a prerelease pin is never offered.

### `nub dedupe`

Collapses duplicate versions to fewer shared resolutions. `nub dedupe --check` exits non-zero if dedupe would change anything (CI gate).

### `nub import`

Converts another manager's lockfile to `pnpm-lock.yaml` **without installing**. Reads `package-lock.json`, `yarn.lock`, or `bun.lock`. `nub import --force` overwrites an existing `pnpm-lock.yaml`. There is no path that converts *to* `yarn.lock`.

### Compat escape hatch

`--node` (or a truthy tree-wide `NODE_COMPAT`) runs the project's *pinned* Node vanilla — version provisioning stays on, runtime augmentation comes off. See the runner reference for the full contract.

## Incumbent inference

Nub never asks which package manager you use — it infers the incumbent and mirrors it. Precedence chain, highest first:

1. **`packageManager`** — the Corepack standard field
2. **`devEngines.packageManager`** — object or array form
3. **Lockfile on disk** — in a workspace, Nub walks up from any member to the root, which carries the declaration and lockfile

Two lockfiles for different managers with no declaration is a hard error, `ERR_NUB_LOCKFILE_AMBIGUOUS`. A declaration whose lockfile is missing is `ERR_NUB_LOCKFILE_DECLARATION_MISMATCH`. Under Nub identity, a `nub.lock` beside a foreign lockfile is the ambiguity error too.

This inference picks the *install engine's* incumbent (the format Nub reads/writes). It is distinct from the version `nub pm` provisions, which resolves a *pin* to fetch a PM binary.

## Lockfile round-trip

| Incumbent | Lockfile | Round-trip |
|---|---|---|
| **npm** | `package-lock.json` (v2/v3), `npm-shrinkwrap.json` | Read + write. v2/v3 byte-for-byte; a no-op reproduces npm's exact bytes (`npm ci` accepts it unchanged). A no-op keeps the incoming `lockfileVersion`; the first **mutating** op (`add`/`remove`) rewrites as v3. `npm-shrinkwrap.json` preserved. v1 (npm 5/6) read and lifted into the v2/v3 scheme; git/`file:` deps encoded in v1's `version` field are **not** read — re-lock under npm 7+ first. |
| **pnpm** | `pnpm-lock.yaml` **v9** (`lockfileVersion: '9.0'`) | Read + write. v6 (pnpm 8) and v5.4 (pnpm 7) are **declined** up front with `ERR_NUB_LOCKFILE_UNSUPPORTED_FORMAT` (node_modules + lockfile left untouched) — re-lock under pnpm 9+. |
| **Yarn** | `yarn.lock` (Classic v1 + Berry v2+) | **Read-only.** Any mutating op refuses before touching anything, naming the exact `yarn` command to run instead. |
| **Bun** | `bun.lock` (text, Bun 1.2+) | Read + write; round-trips byte-for-byte, writes no foreign lockfile. Binary `bun.lockb` is rejected with `ERR_NUB_LOCKFILE_PARSE` — run `bun install --save-text-lockfile` first. |
| **Nub** | `nub.lock` (pnpm-v9 bytes under Nub's own basename) | Read + write. |

A **no-churn guard** leaves a graph-equal lockfile untouched, and Nub never drops its own `nub.lock` into a project it doesn't own. A pre-npm-5 fully-hoisted shrinkwrap with no `requires` edges can't place every transitive — Nub installs what it can and warns with `WARN_NUB_LOCKFILE_LEGACY_INCOMPLETE_GRAPH`.

## Compat mode — config Nub reads per incumbent

Config reads are symmetric with the lockfile: under each incumbent Nub reads that tool's branded config and **no other's**. The neutral `.npmrc` cascade and `npm_config_*` are read under **every** incumbent.

| Incumbent | Branded config read | Build-permission field |
|---|---|---|
| **npm** | `package-lock.json`, `npm-shrinkwrap.json`, the `.npmrc` cascade, `overrides` (npm 8.3+), `workspaces` (+ `--workspace`/`--workspaces`), `engines`/`os`/`cpu`/`libc`, `NPM_CONFIG_*`/`NPM_TOKEN` | neutral `allowBuilds` + `nub approve-builds` |
| **pnpm** | `pnpm-lock.yaml` v9, `pnpm-workspace.yaml` (`packages:`, `catalog:`/`catalogs:`), `namedRegistries`, `pnpm.overrides`/`pnpm.packageExtensions`/`pnpm.patchedDependencies`, `.pnpmfile.cjs`/`.pnpmfile.mjs`, `dependenciesMeta.injected`, `resolutions`, `pnpm_config_*` | `pnpm.onlyBuiltDependencies` / `pnpm.allowBuilds`; deny via `pnpm.neverBuiltDependencies` |
| **Yarn** (read-only) | `yarn.lock`, a `.yarnrc.yml` subset, classic `.yarnrc` core fields, `YARN_*` env, `resolutions`, `packageExtensions`, `dependenciesMeta.*.built`, protocols `workspace:`/`npm:`/`portal:`/`patch:` | `dependenciesMeta.*.built` |
| **Bun** | `bun.lock`, `bunfig.toml` `[install]` section only, `trustedDependencies`, `overrides`, `resolutions`, `patchedDependencies`, `workspaces`, `catalog`, `workspace:`, `BUN_CONFIG_REGISTRY`/`BUN_CONFIG_TOKEN` | `trustedDependencies` |
| **Nub** identity | neutral only — see below | neutral `allowBuilds` |

Top-level `overrides` vs `resolutions` follows the incumbent: npm and Bun read `overrides` (npm drops a stray top-level `resolutions` with a warning); Yarn and pnpm read `resolutions` (pnpm ignores top-level `overrides`; use `pnpm.overrides`).

### npm

- **`.npmrc` cascade**, highest first: CLI flags → `npm_config_*` → project `./.npmrc` → user `~/.npmrc` → global `$PREFIX/etc/npmrc` → builtin.
- **Custom CAs** via standard TLS keys — top-level or per-registry:
  ```ini
  cafile=./corp-ca.pem                          # PEM bundle, all registries
  //registry.example.com/:cafile=./corp-ca.pem  # per-registry override
  ca="-----BEGIN CERTIFICATE-----..."           # inline; repeat ca[]= to stack
  strict-ssl=false                              # user/global scope ONLY — a project .npmrc cannot disable it
  ```
- `overrides` is npm's own pin field, applied during resolution and written to the lock.

### pnpm

- `pnpm-workspace.yaml`: `packages:` globs, `catalog:`/`catalogs:` maps.
- `namedRegistries`: alias→registry-URL map (from `pnpm-workspace.yaml` or global pnpm `config.yaml`); a `<alias>:` spec resolves from that registry; built-in `gh:` → GitHub Packages; auth rides existing `//host/:_authToken=` entries.
- `pnpm.overrides`, `pnpm.packageExtensions`, `pnpm.patchedDependencies` (wired to `nub patch`/`patch-commit`/`patch-remove`). Read from either the `pnpm.*` namespace or the matching `pnpm-workspace.yaml` key.
- `.pnpmfile.cjs`/`.pnpmfile.mjs`: `readPackage`, `preResolution`, `afterAllResolved` hooks run. **Not** supported: new importers/packages, identity rewrites, `updateConfig` hooks, config-dependency pnpmfiles. Under a non-pnpm incumbent a stray `.pnpmfile.cjs` is ignored *with a warning* (silently under Nub identity); `--pnpmfile <path>` always loads.
- **No `pnp` node-linker** — `node-linker=pnp` (or `--node-linker pnp`) is refused, not silently downgraded.
- `deploy` and `sbom` are not wired (honest unsupported-command errors).

### Yarn (read-only)

- Both formats read: Classic (no `__metadata`, Yarn 1.x) and Berry (`__metadata`/`version`, Yarn 2+).
- `.yarnrc.yml` subset: `npmRegistryServer`, `npmScopes.<scope>.*`, `npmAuthToken`/`npmAuthIdent`, `npmAlwaysAuth` (attaches credentials to cross-origin tarball requests too), `packageExtensions`, `dependenciesMeta.*.built`, `supportedArchitectures` (filters optional/platform deps by the declared `os`/`cpu`/`libc`), CA (`httpsCaFilePath`, per-host `networkSettings.<host>.httpsCaFilePath`), mTLS client cert/key (`httpsCertFilePath`/`httpsKeyFilePath` + the per-host `networkSettings` forms), `httpProxy`/`httpsProxy`, `enableStrictSsl`. **`nodeLinker` mapping:** `node-modules` → hoisted, `pnpm` → isolated, `pnp` → **ABORT** `ERR_NUB_PNP_UNSUPPORTED` (both `nub install` and `nub ci` abort before mutation). **Not read:** per-host proxies, PnP, constraints, plugins, patch-folder config, cache layout.
- Classic `.yarnrc`: registry + auth core fields only (`_authToken`/`_auth`); other keys ignored.
- `YARN_*` env: registry, auth token/ident, node-linker, CA file, proxy, strict-SSL; map-shaped and scoped env config not translated.
- **Supported PnP workflow:** install with `yarn`, run with `nub`. Nub-the-runtime fully honors `.pnp.cjs` at run time (`nub <file>`, `nub run`, `nubx`); it just cannot *produce* a PnP install.

### Bun

- `bunfig.toml` `[install]` only: `registry` (string URL or `{ url, token, username, password }`), `[install.scopes]`, `linker = "hoisted" | "isolated"` (→ `nodeLinker`), `cafile`/`ca`. Global `.bunfig.toml` from `XDG_CONFIG_HOME`/`HOME`; project wins. Invalid TOML is ignored, not fatal.
- `BUN_CONFIG_REGISTRY`/`BUN_CONFIG_TOKEN` outrank the file config.
- Runtime/test/serve fields, the security scanner, cache/global-dir behavior, and the wider `BUN_CONFIG_*` install family have no effect.

### Nub identity

A project is Nub's own when it declares Nub (`nub pm use nub`), when `nub.lock` is the only lockfile signal, or when a fresh project has no declaration and no lockfile. Under Nub identity Nub reads **only neutral, cross-tool config** — never another manager's branded fields/files:

- Fields: `overrides`, `resolutions`, `packageExtensions`, `patchedDependencies`, `catalog:`, `workspace:`, `workspaces`, `allowBuilds`, `engines.node`, `scripts`.
- Config/env: the `.npmrc` cascade, `npm_config_*`, neutral env (`CI`, proxies), plus `NUB_CACHE_DIR`, `NUB_CONCURRENCY`, `NUB_PRIMER_TTL`.
- Lockfile: `nub.lock` (pnpm-v9 bytes).

A fresh `nub install` records `devEngines.packageManager` `{ name: "nub", version: "^<version>", onFail: "warn" }` — a non-locking caret floor, **never** an exact `packageManager` pin. To hard-pin (corepack-visible), opt in with `nub pm use nub@<version>`; bare `nub pm use nub` writes only the range. A stray `pnpm-workspace.yaml` is **not read** under Nub identity — Nub warns and tells you to migrate it, delete it, or run `nub pm use pnpm`.

## Lifecycle scripts and supply-chain security

### Deny-by-default builds

Dependency `preinstall`/`install`/`postinstall` scripts do **not** run indiscriminately (unlike npm). You control which packages build:

```bash
nub approve-builds                # record approval AND build in the same invocation (no follow-up install)
nub add --allow-build=<pkg> <pkg> # pre-approve as you add
nub rebuild                       # re-run scripts for already-approved packages
nub install --ignore-scripts      # skip all dependency build scripts this install
nub ignored-builds                # list packages whose builds were skipped
```

The permission field tracks the incumbent (pnpm `onlyBuiltDependencies`/`allowBuilds`, Bun `trustedDependencies`, neutral `allowBuilds`). An **explicit denial always wins** (`allowBuilds: { pkg: false }`, `neverBuiltDependencies`). A package that wants to build but isn't allowed is skipped and named with `WARN_NUB_IGNORED_BUILD_SCRIPTS`, pointing at `nub approve-builds`. Set `strictDepBuilds=true` to fail installs that have unreviewed builds.

### Default-trust floor

Beyond packages you approve explicitly, a curated set of well-known packages may build **without approval** — but only when **all three** gates hold at once:

| Gate | Requirement | On failure |
|---|---|---|
| **Registry provenance** | Resolved from a registry. Git, `file:`, `link:`, tarball, and npm-alias specifiers never qualify (an alias can't borrow a listed name's trust). | Not built |
| **Advisory vetting** | An OSV `MAL-*` check ran against this graph, *or* the graph was inherited from an already-checked lockfile (frozen install, `nub ci`, a teammate's clone). | Not built |
| **Cooling window** | Resolved version's publish time is older than `minimumReleaseAge` (default 24 h). | Not built — **fails closed on unknown publish time** |

Explicit decisions outrank the floor **both ways**: an approved package builds regardless of the gates; an explicit denial always wins. A fresh resolve or a lockfile Nub wrote (which carries the `time:` block) gives the floor everything it needs, so curated packages like `esbuild` build automatically. When a gate fails, the floor steps aside — the package is skipped and disclosed with `WARN_NUB_IGNORED_BUILD_SCRIPTS`, never guessed. A foreign lockfile with no publish-time data — notably `bun.lock` — trips the fail-closed path, so over `bun.lock` the floor is **inert**: only `trustedDependencies` builds anything (exactly Bun's model).

### OSV advisory gate

The check queries `api.osv.dev` on a fresh resolve. A confirmed `MAL-*` hit is a **hard block** — the install aborts with `ERR_NUB_MALICIOUS_PACKAGE`, never a skip-and-warn. An osv.dev **outage fails open** (warns and proceeds) so a network blip can't brick an offline install — unless `advisoryCheck=required` (bundled into `paranoid`), which fails closed on outages. Frozen reinstalls (`nub ci`, `--frozen-lockfile`, a clone) inherit the recorded vetting and skip the round-trip, but still enforce the cooling and provenance gates every install.

### Build jail

An OS-level, **network-blocked, filesystem-scoped sandbox** around every build script. Compiled in but **off by default**. Opt in with the neutral `paranoid` / `npm_config_paranoid` setting (which also flips the advisory gate to fail-closed). Covers macOS and Linux; Windows is a passthrough.

### Trust downgrades

Nub weighs trust *evidence* across a package's release history (OIDC provenance, a trusted publisher, a staged-publish approval). A resolved version carrying **weaker evidence than an earlier-published version** stops the install with `ERR_NUB_TRUST_DOWNGRADE` — the shape of a token-theft supply-chain attack. Comparison is by publish date, so a legitimate backport on an older major can trip it; versions younger than 14 days are exempt. Tune in `.npmrc`:

```ini
trustPolicyIgnoreAfter=20160          # age exemption in minutes (default 14 days)
trustPolicyExclude[]=tailwind-merge   # exempt one package regardless of age
trustPolicy=off                       # disable the check entirely
```

### `minimumReleaseAge`

For a Nub-identity project it is the `.npmrc` key `minimum-release-age`, expressed in **minutes** (default 24 h). Bun's bunfig expresses the equivalent in **seconds**; Nub converts. Tightening it past every published version fails even a curated package closed.

## Virtual store (default isolated linker)

Regardless of incumbent, Nub installs through a global content-addressed store and links into an isolated virtual store — aube's scheme under Nub's own directory names.

### Global content store

Files are deduplicated by content hash at `$XDG_DATA_HOME/nub/store/v1/` (default `~/.local/share/nub/store/v1/`); `nub store path` prints it. Every install imports from it, so a package version lands on disk once and is shared across projects. Files materialize into `node_modules` by **reflink** (APFS/btrfs), **hardlink** (ext4), or **copy** fallback.

### One symlink per package

The default `node_modules` layout is **isolated**: direct dependencies at the top level, transitive packages linked into `node_modules/.store/` (pnpm uses `node_modules/.pnpm/` — same shape, not byte-shared). Two consequences:

- **Warm installs are O(packages), not O(files)** — one symlink per package instead of one hardlink/copy per file.
- **The store is a sealed world** — Node resolves a symlink to its real path before loading, so a package resolves only its *declared* dependencies. An **undeclared (phantom) import fails at resolve time** instead of resolving by accident. When one does fail, Nub's error names the package and points at the flat opt-out.

### Phantom detection and ejection

As each tarball is imported, Nub parses that version's published code with [Oxc](https://oxc.rs): it walks the module graph from `exports`/`main`/`bin` and checks every static, unguarded import against declared dependencies. Verdicts are computed once per content fingerprint and cached machine-wide; the scan overlaps network time on the download threads. At link time a flagged package is **ejected** — hardlinked into the project as real files instead of symlinked — so its resolution walk passes back through the project and the undeclared target is found. Everything that transitively imports a flagged package is ejected with it. The ejected closure measures 0.3–2.1% of real large trees; the symlinked majority keeps the fast relink. Detection and ejection are on for every install, no configuration.

### Flat opt-out

Get a plain, flat npm-style `node_modules` (no virtual store):

```ini
node-linker=hoisted          # .npmrc — whole project
```
```bash
nub install --node-linker hoisted   # single command
```

`node-linker` is a neutral key honored under **every** incumbent and Nub identity. Per-incumbent flat-layout config:

| Incumbent | Its own flat config | Under Nub |
|---|---|---|
| **pnpm** | `node-linker=hoisted` in `.npmrc`, or `nodeLinker: hoisted` in `pnpm-workspace.yaml` | Honored |
| **npm** | `install-strategy=hoisted` | Ignored (it's npm's default, no signal) — set `node-linker=hoisted` |
| **Yarn** | `nodeLinker: node-modules` in `.yarnrc.yml` | Not read as a layout request — set `node-linker=hoisted` |
| **Bun** | none (always flat-materialized) | set `node-linker=hoisted` |
| **Nub** | `node-linker=hoisted` | Honored |

`node-linker` picks the **layout** (`isolated` vs `hoisted`). It is unrelated to `hoist`, `shamefully-hoist`, and `public-hoist-pattern`, which lift packages within the isolated layout and leave the virtual store in place.

### Project-local opt-out

```ini
enableGlobalVirtualStore=false   # keep isolated layout + phantom protection; store moves into the project
```

This keeps the isolated layout and phantom-dependency protection but relocates the store from the shared per-machine location to `node_modules/.store/` inside the project, making the tree self-contained — it survives a Docker `COPY --from` into a fresh image. Nub does this **automatically in CI and under `nub ci`**, and automatically for toolchains whose resolvers can't follow symlinks out of the project: Next.js (Turbopack), bare React Native / Metro (and Expo before SDK 56), Prisma (so `prisma generate` stays project-local), and runtime-backend adapters like `@hookform/resolvers/zod`. Detection is automatic (it scans each package's real published code). Extend it:

```ini
disableGlobalVirtualStoreForPackages[]=my-bundler
```

Vite keeps the shared store: Nub writes `node_modules/.modules.yaml` (Vite 8.1+ reads it natively; older Vite gets a backported check) so the dev server serves store-resident modules over `/@fs` without a `403 … outside of Vite serving allow list`.

### Warm-reinstall benchmark

Warm reinstall, 1,168 packages / 81,398 files, Linux (ubuntu-latest), `node_modules` cleared between runs, store populated, no network (hyperfine, 25 runs / 6 warmup; bun 1.3.14, pnpm 10.34.4, npm on Node 24):

| Command | Time | vs nub default |
|---|---|---|
| `nub install` (default isolated) | 346 ms | — |
| `nub install --node-linker hoisted` | 1461 ms | 4.2× |
| `bun install` | 1896 ms | 5.5× |
| `pnpm install` | 3453 ms | 10× |
| `npm ci` | 12945 ms | 37.4× |

The two `nub` rows isolate the layout's contribution: hoisted mode links Bun's exact flat layout with the same per-file hardlink syscall; the default row is the same install with the one-symlink-per-package relink. This is the **warm-reinstall** case only — a cold install (empty store, fetching from the registry) is a different workload where Nub does not lead.

```bash
nub install                   # offline when the store already holds every package
nub install --offline         # force offline
nub install --prefer-offline  # try the cache first
```

## Error and warning codes

| Code | Meaning |
|---|---|
| `ERR_NUB_LOCKFILE_AMBIGUOUS` | Two lockfiles for different managers, no declaration |
| `ERR_NUB_LOCKFILE_DECLARATION_MISMATCH` | Declared manager's lockfile is missing (a different one is present) |
| `ERR_NUB_LOCKFILE_UNSUPPORTED_FORMAT` | pnpm v6/v5.4 lockfile — re-lock under pnpm 9+ |
| `ERR_NUB_LOCKFILE_PARSE` | Unparseable lockfile (e.g. binary `bun.lockb`) |
| `ERR_NUB_PNP_UNSUPPORTED` | Yarn PnP requested (`nodeLinker: pnp`) — install with Yarn, run with Nub |
| `ERR_NUB_MALICIOUS_PACKAGE` | Confirmed OSV `MAL-*` advisory — hard block |
| `ERR_NUB_TRUST_DOWNGRADE` | Resolved version carries weaker provenance than an earlier one |
| `WARN_NUB_IGNORED_BUILD_SCRIPTS` | A package wanted to build but wasn't allowed — run `nub approve-builds` |
| `WARN_NUB_LOCKFILE_LEGACY_INCOMPLETE_GRAPH` | Legacy shrinkwrap without `requires` edges couldn't place every transitive |

Ground truth: <https://nubjs.com/docs/install> and its subpages <https://nubjs.com/docs/install/virtual-store>, <https://nubjs.com/docs/install/npm>, <https://nubjs.com/docs/install/pnpm>, <https://nubjs.com/docs/install/yarn>, <https://nubjs.com/docs/install/bun>.
