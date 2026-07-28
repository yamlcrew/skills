# Nub package meta-manager and Node version manager

Reference for Nub v0.6.0's two provisioning subsystems: `nub pm` (Corepack's job in native Rust — provision and run the exact package manager a project pins) and `nub node` (a Node version manager). Both are augmentation layers over stock Node: `nub pm` runs the pinned pnpm/npm/yarn on the project's Node; `nub node` provisions the stock Node build a project pins. Neither ships a patched Node or a new runtime.

## nub pm

Nub reads the project's package-manager pin, fetches that EXACT pnpm/npm/yarn version from the npm registry (integrity-verified), caches it under `~/.cache/nub/pm/<pm>/<version>`, and runs it under the project's Node. No `corepack`, no `enable` step, no baked version table — a six-month-old Nub binary provisions today's pnpm. Default usage needs none of the subcommands below: `nub install`, `nub add`, and `nub run` already provision and run the pin.

A cached exact pin runs fully offline — the registry is contacted only to resolve ranges and fetch missing versions. Provisioned managers run with a warm V8 compile cache (`NODE_COMPILE_CACHE`), so the manager's multi-megabyte bundle loads as cached bytecode instead of re-parsing on every call.

### Pin resolution

The pin is read from two `package.json` fields at the workspace root, in order:

1. `packageManager` — the Corepack field. EXACT only (`pnpm@9.15.4`, optionally `+sha512.<hash>`).
2. `devEngines.packageManager` — `{ name, version }`; the version MAY be a range.

Ranges belong in `devEngines`; Corepack, pnpm, and Yarn all reject a range in `packageManager`. With no pin in either field, `nub pm which` errors and points at `nub pm use`. A lockfile NEVER implies a pin.

Two managers' lockfiles side by side (e.g. `pnpm-lock.yaml` and `package-lock.json`) is ambiguous — Nub errors (`ERR_NUB_LOCKFILE_AMBIGUOUS`). Remove the stale one, or declare the pin with `nub pm use`.

Yarn Berry has an override: a committed Berry release (`.yarnrc.yml` `yarnPath`) wins over the pin fields. Nub runs the committed file directly and NEVER provisions Berry, so a `yarn@2+` pin without a committed release errors. Yarn classic (1.x) provisions like any other manager.

### `nub pm which`

Print the resolved package manager — path to stdout, provenance to stderr — so `PM=$(nub pm which)` captures just the path. Provisions the pinned version if it isn't cached yet.

```console
$ nub pm which
/Users/you/.cache/nub/pm/pnpm/9.15.4/package/bin/pnpm.cjs
» resolved from packageManager (pnpm@9.15.4)
```

### `nub pm use`

Declare the project's package manager — npm, pnpm, Yarn, or Bun. Resolves the version (exact, range, or dist-tag; bare means `latest`), fetches and verifies it, writes the pin fields, and aligns the lockfile.

```bash
nub pm use pnpm           # newest pnpm
nub pm use npm@10         # newest 10.x
nub pm use pnpm@9.15.4    # exact
```

Moving an npm project to pnpm:

```console
$ nub pm use pnpm
Fetching pnpm 11.5.3 (4 MB)...
using pnpm@11.5.3
  package.json: packageManager = pnpm@11.5.3 (+sha512)
  package.json: devEngines.packageManager =
    { name: "pnpm", version: "^11.5.3", onFail: "warn" }
  pnpm-lock.yaml: written (converted from package-lock.json)
  package-lock.json: removed (migrated)
```

What it writes:

- `package.json#/packageManager` — the exact version plus a `+sha512` hash from the verified tarball. What Corepack, pnpm, and turbo execute; `use` is the ONLY Nub command that writes this field.
- `package.json#/devEngines/packageManager` — `{ name, version: "^<exact>", onFail: "warn" }`, written beside the exact pin so the two can't drift.
- The lockfile, in the new manager's format. A lockfile in another format is CONVERTED (resolution state preserved) and the old file removed; one already in the target format is left untouched; with no lockfile, the next install creates it. The converted lockfile passes the active manager's frozen install (`pnpm install --frozen-lockfile`, etc.) byte-for-byte.

Every file written or removed is named in the output; rerunning is a no-op.

Refusals — all before anything is written:

- Multiple foreign-format lockfiles — remove the stale ones first.
- A binary `bun.lockb` source — regenerate it as text first with `bun install --save-text-lockfile`.
- `use yarn` onto a Berry (2+) `yarn.lock` — classic would downgrade the format; use `yarn set version`.
- `use yarn` on a graph using the `workspace:` protocol — classic Yarn can't express it.

A converting `use yarn` is otherwise fine — Nub writes a classic `yarn.lock` directly. `nub pm use bun` writes the pin and lockfile but does NOT provision bun.

Config is NOT migrated. Switching managers converts the lockfile, not the config: `.npmrc`, any `pnpm.*` fields, `pnpm-workspace.yaml` settings, and other manager-specific config stay as they are — carry over whatever the new manager needs yourself. Install-engine inference (which lockfile format to install in) is a SEPARATE axis from the pin (which PM binary to run).

### `nub pm pin`

Lock the project to an EXACT Nub version. Bare, it pins the Nub you're running; pass a version to pin a specific one.

```bash
nub pm pin           # pin the running Nub
nub pm pin 0.6.0     # pin an exact version
```

```console
$ nub pm pin
pinned nub@0.6.0
  package.json: packageManager = nub@0.6.0
  package.json: devEngines.packageManager = { name: "nub", version: "^0.6.0", onFail: "warn" }
```

It writes ONLY the identity fields — the exact `packageManager` pin and the `devEngines.packageManager` caret beside it — and nothing else: NO lockfile conversion, NO config migration. The fuller switch onto Nub is `nub pm use nub`'s job; `pin` is the lightweight lock, the package-manager analog of a Node pin. The version MUST be exact — Nub is the binary you're running, not a registry package, so a range or dist-tag has nothing to resolve against.

### `nub pm update`

Bump the pin: resolve the newest version satisfying the `devEngines` range (or the registry `latest` if there's no range), provision it, and rewrite `packageManager` with a fresh hash. Alias: `nub pm up`.

```console
$ nub pm update
Fetching pnpm 9.15.9 (4 MB)...
updated pnpm 9.15.4 → 9.15.9
```

### `nub pm cache`

Inspect or clear the package-manager cache at `~/.cache/nub/pm/<pm>/<version>`.

```console
$ nub pm cache
pnpm@9.15.4
yarn@1.22.22
$ nub pm cache clear
```

### `nub pm shim` / `nub pm unshim`

Opt-in shims so a bare `pnpm`, `npm`, or `yarn` command routes through Nub to the pinned manager, with NO extra Node process in front. Default Nub usage needs none of this — `nub install`, `nub add`, and `nub run` already run the pin. Shims (`nub pm shim`) and pins (`nub pm use`) are two SEPARATE steps: the pin lives in `package.json` and sets which manager the project uses; the shim touches your PATH so bare commands are intercepted too.

After `nub pm shim`, bare `pnpm` resolves to a shim in `~/.nub/shims` — a HARDLINK to the Nub binary. (Corepack's shim is a Node script with a `#!/usr/bin/env node` shebang, so invoking it boots a Node interpreter first; Nub's is the already-running native process, so there's no extra interpreter in front of the manager.) On a cold cache, `pnpm --version` (or any pinned-PM command) provisions the pinned pnpm, then dispatches to it in-process under the project's Node. A dim `pnpm@9.5.0 (via nub shim)` line naming the manager and version prints to STDERR on every dispatch, so it never pollutes piped stdout.

```console
$ nub pm unshim
nub pm unshim: removed /Users/you/.nub/shims
  PATH: removed the shims block from /Users/you/.zshrc
```

STRICT by default: in a pinned project, a shim REFUSES to run a different package manager — a competing lockfile and `node_modules` are exactly what you don't want. Bare `yarn add react` in a pnpm-pinned project exits nonzero and names what to run instead:

```console
$ yarn add react
nub: the nub package-manager shims on your PATH (installed via
     `nub pm shim`) intercepted this.
This project pins pnpm (via package.json#packageManager) — refusing to run yarn.

  run instead:  pnpm add react
  to bypass:    invoke the system yarn by absolute path,
                or remove the shims: nub pm unshim
```

Transparent fallthrough (regardless of pin): the `npx` and `pnpx` tools and the `init` / `create` / `dlx` / `exec` verbs fall through to the system tool, so `npm create vite` works in a pnpm project. A package manager spawned by a running install (a lifecycle script shelling out to another) also falls through, so an install you never typed directly isn't broken.

No manager on PATH: an unpinned invocation falls through to the system manager. With NONE (fresh machine, minimal container), the shim runs a DYNAMIC default instead of failing — the version family the committed lockfile implies, or the registry `latest` when there's no lockfile. It announces the choice on stderr and writes NO pin. The `latest` resolution is remembered for 24 hours, so repeat invocations dispatch with no registry round-trip, and when the registry is unreachable the last resolved version keeps working.

### Pinning Nub itself

`packageManager` can also pin Nub — `nub@X.Y.Z`. When the running Nub is a different version, it fetches that exact release, checksum-verifies it, and hands off, so a project's installs don't depend on which Nub each contributor happens to have.

```json
{ "packageManager": "nub@0.6.0" }
```

The handoff runs ONLY on the install verbs — where the result is a committed lockfile and `node_modules`:

```console
$ nub install
nub: provisioning pinned nub@0.6.0 (darwin-arm64)...
nub: provisioned nub@0.6.0
```

The release comes from Nub's own channel and is checksum-verified before it runs; a corrupt, missing, or wrong-version build is a hard error, never a silent fallback. The store lives at `~/.cache/nub/self/<version>`, so a pinned version runs offline once provisioned. Everything else — the file runner, script running, `nubx`, version management, self-update — never reads the pin, so `nub script.ts` stays fast. The pin is EXACT-only; a non-exact pin runs in place with a notice. To run with your installed Nub regardless of the pin, `NUB_SELF_SHIM=0` disables the handoff for the whole tree:

```bash
NUB_SELF_SHIM=0 nub install
```

### `.npmrc` for the PM download

The PM download — packument and tarball — goes through your `.npmrc`: `registry=` picks the mirror, `//host/:_authToken=` authenticates.

```ini
registry=https://npm.corp.example
//npm.corp.example/:_authToken=${CORP_NPM_TOKEN}
```

Environment placeholders (`${VAR}`) in these values expand from the USER `~/.npmrc` and `npm_config_*` — but NOT from a PROJECT `.npmrc` committed to the repo, which is read LITERALLY. So a checked-in hostile `registry=` or auth line can't interpolate a secret like `${NPM_TOKEN}` into a request to an attacker's host. On trusted CI where the project file genuinely needs expansion, set `PNPM_CONFIG_NPMRC_AUTH_FILE=.npmrc` to opt back in — it comes from the environment, so a repo can't set it for itself. To fetch package managers from a different registry than your dependencies, `COREPACK_NPM_REGISTRY` (+ `COREPACK_NPM_TOKEN`) overrides the PM-download registry.

## nub node

Nub runs your code on stock Node and AUTO-PROVISIONS the right version on demand: pin a version, run a file, and the matching stock build is downloaded (SHA-256-verified) and cached under `~/.cache/nub/node` without a second command. The `nub node` subcommands do the same steps DELIBERATELY — warm the cache before a run, list what's installed, reclaim disk, record a pin.

```console
$ echo 26 > .node-version
$ nub index.ts
Using Node.js 26.3.0 (resolved from .node-version)
Installing from nodejs.org... (24 MB)
Installed in 8.0s
```

On a fresh machine with no Node at all, a plain `nub file.ts` still runs: with no pin and no `node` on PATH, Nub provisions the latest release (reusing the newest cached version before downloading).

### Version precedence — which version is pinned

Nub walks UP from the working directory to the nearest pin, highest precedence first:

1. `NODE_EXECUTABLE` — an absolute path to a Node binary. A HARD override: it bypasses pin-file reading, the cache, `nvm`, and any download, and uses that binary directly. Its version is still detected, so the Node floor check and tier dispatch still apply. The only version-management override.
2. `package.json#/devEngines/runtime` — the `node` entry (exact or range). A `devEngines.runtime` declaring a NON-Node runtime refuses by default; `onFail: "warn"` prints a notice and falls through, `onFail: "ignore"` falls through silently.
3. `.node-version`
4. `.nvmrc`
5. `.tool-versions` — the asdf/mise convention; also honored (per the runtime docs and the GitHub Action), read between `.nvmrc` and `engines.node`.
6. `package.json#/engines/node` — interpreted as a resolution RANGE, not an exact pin: Nub resolves to the newest available version satisfying it.
7. Nothing pinned anywhere up the tree — whatever `node` is on your PATH, or the latest release when there's no `node` at all.

Within a single directory, `.node-version` wins over `.nvmrc` (it's the tool-agnostic standard). Discovery walks UP the tree to the nearest pin and SKIPS pin files inside an installed dependency (under `node_modules`) — a dependency's own CI pin never drives your project. The `package.json` fields (`devEngines.runtime`, `engines.node`) are read from the WORKSPACE-ROOT manifest when one exists above you, else the nearest `package.json` — a monorepo pins its Node once at the root.

### Where the binary comes from

Once a version is pinned, Nub finds a binary for it in order:

1. `node` on PATH, if its version satisfies the pin — so `fnm` / `Volta` / `mise` auto-switching just works.
2. Nub's own download store (`~/.cache/nub/node/<version>/`).
3. An `nvm`-installed version (nvm scan).
4. Download the matching stock build from nodejs.org — SHA-256 verified and cached — otherwise error.

### `nub node install`

Provision a version into the cache NOW instead of on the next `nub <file>` — for warming a CI cache in a setup step, or fetching a Node before going offline.

```bash
nub node install 20          # newest 20.x
nub node install lts         # newest LTS line
nub node install 20.11.0     # an exact version
nub node install 20 22       # several at once
```

Aliases and ranges resolve the same way pins do — `lts`, `latest`, `lts/<codename>`, a bare major (`20`) or `major.minor` (`22.13`), or an exact version. Bare `nub node install` (no argument) reads the project's pin and provisions that. A version already in the cache is a no-op; a version already available on PATH (system install, `nvm`, `fnm`, …) is reported and SKIPPED rather than re-downloaded:

```console
$ nub node install 26.3.0
Node 26.3.0 is already available on PATH — skipped
```

### `nub node ls`

List the versions in Nub's cache, newest first. The `→` marker flags the version the current directory resolves to — but ONLY when that version is one Nub has cached. `ls` shows Nub's own download cache only; it does NOT enumerate `nvm` / `fnm` / system installs.

```console
$ nub node ls
→ 26.3.0
  22.13.0
  20.11.0
```

### `nub node uninstall`

Reclaim disk by deleting a CACHED version. Nub guards against removing the version the current directory resolves to. Operates on Nub's cache only.

```console
$ nub node uninstall 20.11.0
Removed Node 20.11.0 from the cache
```

### `nub node pin`

Write a `.node-version` at the project root so every later `nub` in that tree uses it — the explicit form of creating the pin file by hand. Works OFFLINE.

```console
$ nub node pin 26
pinned Node 26 → /path/to/project/.node-version
```

- It pins the PROJECT, not the subdirectory: run from anywhere inside and the file lands at the project root (the nearest `package.json` directory), not your current subfolder.
- In a workspace, it pins the WHOLE repo — the Node version is a property of the repository, so the pin is written at the workspace root.
- It edits the pin file you already have: if the project carries a `.nvmrc` but no `.node-version`, `pin` updates the `.nvmrc` in place.

Whatever spec you give is written VERBATIM — including an alias like `lts`. `.node-version` is the tool-agnostic convention (`nvm`, `fnm`, `volta`, `asdf` all read it), so the pin is portable.

### `nub node which`

Resolve which Node runs here and where it lives — binary path to stdout, a `» resolved from <source>` explainer to stderr, so it never pollutes a captured value. Composes as `NODE=$(nub node which)`.

```console
$ nub node which
/Users/you/.nvm/versions/node/v26.3.0/bin/node
» resolved from .node-version (26.3.0)
```

With no pin the explainer reads `» resolved from node on PATH`. Bare `nub node` (no subcommand) prints a STATUS BLOCK instead — the version, path, and resolution source on separate lines. There is NO `nub node <file>` passthrough — `nub node <file>` is an error (the `nub node` keyword is the version-management namespace).

### `nub node shim` / `nub node unshim`

Make `node` itself resolve through Nub, so a machine with no Node installed can run `node` at all. Installs a `node` link in `~/.nub/node-shim` and adds that directory to PATH.

```console
$ nub node shim
node shim in /Users/you/.nub/node-shim (created)
  `node` now resolves through nub (version management only — no augmentation; run `nub` for that)
  added /Users/you/.nub/node-shim to PATH in /Users/you/.zshrc
  restart your shell, or run: source /Users/you/.zshrc
```

The shimmed `node` runs stock Node, UNCHANGED — it resolves and provisions the version (the precedence above) but adds NOTHING else: no TypeScript, no injected globals, no automatic `.env`. So `node app.ts` type-strips exactly as stock Node does, while `nub app.ts` transpiles and runs it. This is VERSION MANAGEMENT ONLY. Opt-in and reversible, the same shape as `nub pm shim`. Because the shim directory comes first on PATH, a Node you install later (`brew install node`) is SHADOWED until you unshim. Re-run `nub node shim` after `nub upgrade` to re-link.

```console
$ nub node unshim
removed /Users/you/.nub/node-shim
  PATH: removed the node-shim block from /Users/you/.zshrc
```

### Mirrors and proxies

Node downloads honor `HTTP(S)_PROXY` and `NO_PROXY`, and TLS-intercepting corporate CAs work through the system trust store. To fetch Node from an internal mirror instead of nodejs.org, set the standard env var or the `.npmrc` key pnpm uses — Nub reads both, no Nub-specific config:

```ini
# .npmrc (project or ~)
node-mirror:release=https://artifactory.corp.example/node/
```

The `NODEJS_ORG_MIRROR` env var (the nvm/n convention) takes PRECEDENCE over the `.npmrc` `node-mirror:release` key. Use a mirror for musl builds too — point it at one carrying the `unofficial-builds` layout on Alpine.

Ground truth: <https://nubjs.com/docs/pm>, <https://nubjs.com/docs/pm/pm-shim>, <https://nubjs.com/docs/node>.
