# Nub — overview and installation (v0.6.0)

Nub is an all-in-one toolkit for Node.js, written in Rust. One binary (`nub`, plus `nubx`) runs TypeScript files and `package.json` scripts, installs dependencies, and provisions Node itself — **augmenting the user's installed Node rather than replacing it**. There is no new runtime and no lock-in.

## The augmenter model — not a fork, not a runtime

Nub is a Rust CLI that runs *on* stock Node. When `nub index.ts` runs, a stock `node` binary executes the code; Nub spawns it, registers a load hook, preloads polyfills where Node is behind, and gets out of the way. It does not patch Node source, ship a custom-built Node binary, or embed `libnode`.

Every augmentation rides on a public Node extension surface:

| Surface | Since | Role in Nub |
|---|---|---|
| `module.registerHooks()` | Node 22.15 (Apr 2025) | Synchronous loader hooks — the transpile-on-import path |
| `module.register()` | Node 20.6 (Aug 2023) | Programmatic loader registration (no `--loader` CLI dance) |
| `--import` preload | Node 19.0 (Oct 2022), stable 20.6 | Run setup before user `main`; installs polyfills + the load hook |
| `--require` preload | Node 1.6 (2012) | Older CJS-style preload for pre-ESM corners |
| `NODE_OPTIONS` / V8 flag injection | — | Turn on `--experimental-*` flags Node ships but keeps gated |
| N-API addons | stable Node 8.6 (Oct 2017) | ABI-stable native addons; Nub ships its `oxc` transpiler as one |

The mechanism test for any augmentation: *would a user on plain Node, plus the matching `module.register()` / `--import` / npm addon, get the same result?*

### The compatibility contract

> Code targeting Node runs on Nub byte-for-byte. Hitting a case where that is not true is a bug.

The compatibility surface **is** Node's — CommonJS, `require()`, `require.cache`, the `node:*` core modules (ESM and CJS), and N-API addons all work because Node is what runs underneath. Nub's load hook covers TypeScript / JSX / YAML / TOML / JSON5 / JSONC at the ESM and CJS entry points equivalently.

### What Nub is not

- **Not a dev server** — `nub run dev` runs the project's `dev` script; the dev server stays Vite / Next.js / whatever.
- **Not a test runner** — Nub runs `node:test`, Vitest, or Jest; workers spawned by the runner inherit augmentation, so TypeScript test files run without setup.
- **Not a bundler** — Vite / Rollup / Rolldown / esbuild / webpack / tsup keep shipping production artifacts. Nub's transpile path is for *execution*, not for artifacts.
- **Not a type-checker** — Nub transpiles TypeScript and executes it without checking types (types are removed, never verified). Use the installed `typescript` (`tsc --noEmit`) or the editor for checking.

## What Nub replaces

| Nub | Instead of |
|---|---|
| `nub <file>` | `node`, `tsx`, `ts-node`, `dotenv-cli` |
| `nub run <script>` | `npm run`, `pnpm run`, `yarn run` |
| `nubx` | `npx`, `pnpm dlx`, `pnpm exec`, `yarn dlx` |
| `nub install` | `npm`, `pnpm`, `yarn` |
| `nub watch` | `nodemon`, `node --watch`, `tsx watch` |
| `nub node` | `nvm`, `fnm`, `n`, `volta` |
| `nub pm` | `corepack` |

## Install

```bash
# macOS / Linux
curl -fsSL https://nubjs.com/install.sh | bash

# Windows (PowerShell)
irm https://nubjs.com/install.ps1 | iex

# Homebrew (macOS / Linux)
brew install nubjs/tap/nub

# Nix (flakes)
nix run github:nubjs/nub

# mise — puts nub and nubx on PATH
mise use -g nub

# npm (pnpm add -g / yarn global add work equivalently)
npm install -g @nubjs/nub
```

`npm install -g @nubjs/nub` installs the Rust binary plus the platform-specific N-API addons (the `@<scope>/<platform-arch>` distribution pattern used by `swc`, `esbuild`, `oxc`) and puts `nub` and `nubx` on `PATH`.

For containers, the official image is a `node` base with Nub layered on:

```dockerfile
FROM ghcr.io/nubjs/nub
```

For GitHub Actions, swap `actions/setup-node` for `nubjs/setup-nub` (one-to-one compatible):

```diff
- - uses: actions/setup-node@v4
+ - uses: nubjs/setup-nub@v0
```

### curl install script — env vars

The script drops a native binary into `~/.nub` and puts it on `PATH`, verifying the release archive against its SHA-256 sidecar before replacing an existing install. Two environment variables customize it (rustup/uv convention). Set them on the shell that runs the script — the right side of the pipe, not on `curl`:

| Env var | Effect |
|---|---|
| `NUB_INSTALL_DIR` | Install somewhere other than `~/.nub` (default). `nub upgrade` still updates it in place. |
| `NUB_NO_MODIFY_PATH` | Set truthy (`1`/`yes`/`true`/`on`) to skip the shell-profile edit; the script prints the `PATH` line to add manually. |

```bash
curl -fsSL https://nubjs.com/install.sh | NUB_INSTALL_DIR="$HOME/.local/nub" NUB_NO_MODIFY_PATH=1 bash
```

On Windows, set `$env:NUB_INSTALL_DIR` / `$env:NUB_NO_MODIFY_PATH` before the `irm | iex`.

### Upgrading and the canary channel

```bash
nub upgrade                  # self-update in place
npm install -g @nubjs/nub@latest   # for an npm install, match how it was installed
brew update && brew upgrade nub    # for a Homebrew install
```

Nub and Node version independently: upgrading Nub does not change the project's Node version, and vice versa.

Every push to `main` publishes a full 8-platform canary build (rolling GitHub release + npm `canary` dist-tag):

```bash
curl -fsSL https://nubjs.com/install.sh | bash -s canary   # macOS / Linux
npm install -g @nubjs/nub@canary
```

```powershell
iex "& { $(irm https://nubjs.com/install.ps1) } canary"    # Windows
```

Switch a script install between channels with `nub upgrade --canary` / `nub upgrade --stable`. On a canary build, a plain `nub upgrade` stays on canary. Canary versions are date-stamped (e.g. `v0.6.0-canary.20260724.117`). Homebrew and winget carry stable only.

## Requirements

- **Augmented modes require Node 18.19+** (Node 18 LTS — the floor for the loader-hook API on the transpile-on-import path). Below 18.19, augmented commands emit a tagged error to upgrade Node or use compat mode.
- **Fast tier: Node 22.15+** (synchronous `module.registerHooks`); 18.19–22.14 run the compat tier via the async loader-worker. See `file-runner.md` for the tier model.
- **Recommended: Node 26** (the latest major) for new projects, Dockerfiles, and `@types/node`.
- **Platforms:** macOS (arm64, x64), Linux (x64, arm64), Windows (x64, arm64).

Nub infers and provisions the Node version a project pins (installing it from nodejs.org on demand), falling back to the `node` on `PATH` when nothing is pinned. Resolution precedence:

```text
NODE_EXECUTABLE  →  package.json#devEngines  →  .node-version  →  .nvmrc  →  package.json#engines
```

## `nub init` — scaffold a TypeScript-first project

`nub init` writes five files, initializes git, and installs the TypeScript toolchain — a project that runs and typechecks immediately with zero runtime dependencies.

Files written: `package.json`, `tsconfig.json`, `index.ts`, `.gitignore`, `README.md`, plus `git init`.

devDependencies installed:

| Package | Range | Role |
|---|---|---|
| `@nubjs/types` | capped at the running Nub version | Ambient Nub TS declarations |
| `@types/node` | `^26` | Node type declarations |
| `typescript` | `^7` | Editor + typechecking (Nub itself transpiles) |

The `@nubjs/types` range caps at the running Nub version but allows an older release, so the default 24-hour cooling window can pick the newest mature declarations. The install step writes Nub's neutral lockfile, `nub.lock`.

### Generated `package.json`

```json
{
  "name": "my-app",
  "version": "0.0.1",
  "type": "module",
  "packageManager": "nub@0.6.0",
  "devEngines": {
    "packageManager": { "name": "nub", "version": "^0.6.0", "onFail": "warn" }
  },
  "scripts": {
    "start": "nub index.ts"
  },
  "devDependencies": {
    "@nubjs/types": "<capped at nub@0.6.0>",
    "@types/node": "^26",
    "typescript": "^7"
  }
}
```

The `packageManager` pin and `devEngines.packageManager` range both track the running Nub version. `onFail: "warn"` (not a hard block) means the project still runs on plain Node — the only change a non-Nub user makes is swapping the `start` script to a plain `node` invocation. Plain `node` runs the TS entry on Node ≥22.18 (type stripping); on older Node, scaffold with `--js`.

### Generated `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "es2024",
    "lib": ["es2024"],
    "types": ["node", "@nubjs/types"],
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
    // ...
  }
}
```

`noEmit` is set because Nub transpiles; the installed `typescript` is for the editor and typechecking.

### Flags and behavior

| Flag | Effect |
|---|---|
| `-y`, `--yes` | Skip all prompts, take defaults |
| `--js` | JavaScript variant: writes `index.js`, no tsconfig, no devDependencies |
| `--name <name>` | Project name (default: sanitized directory name; scoped `@scope/pkg` preserved) |
| `--no-git` | Skip `git init` |
| `--no-install` | Skip the install step |
| `--force` | Overwrite existing files |

In a terminal, `nub init` asks three questions — project name, TypeScript or JavaScript, and whether to `git init`; every prompt has a default and `-y` skips them all. Outside a terminal (CI, piped stdin) the defaults apply automatically, so the command never hangs. An existing `.git/` is never touched.

`nub init` refuses to overwrite existing target files, naming the conflicts, and writes nothing partial:

```console
$ nub init -y
Error: nub: refusing to overwrite existing files: package.json, tsconfig.json, index.ts, .gitignore, README.md
  (pass --force to overwrite)
```

### Templates are `nub create`, not `init`

Framework templates belong to `nub create`, which resolves the ecosystem's `create-*` convention (`vue` → `create-vue`, `@scope/foo` → `@scope/create-foo`), fetches the scaffolder, and runs it. Everything after the template name passes through to the scaffolder unchanged.

```bash
nub create vue my-app        # runs create-vue
```

`nub init` takes no arguments and points to `nub create` when given one:

```console
$ nub init vite
Error: nub: `init` does not accept arguments (got "vite")
  (to scaffold from a template: nubx create-vite)
```

## Plugins — `nub <verb>` extensibility

An unknown verb `nub <verb>` resolves and runs an executable named `nub-<verb>`, forwarding the rest of the arguments untouched — the same convention as `git-foo` / `cargo-foo`. A plugin is just a package that installs a `nub-<verb>` bin; there is no manifest, registration step, or config field.

```bash
nub add -D nub-changeset     # ships a nub-changeset bin
nub changeset publish        # resolves and runs nub-changeset publish
```

Resolution order (only the prefixed `nub-<verb>` name is ever probed — never the bare verb, so `nub bnuild` fails cleanly):

1. `node_modules/.bin` — project-local, walking up from the current directory.
2. `PATH` — a globally-installed plugin.

**Built-ins always win.** Native commands and package-manager verbs (`run`, `install`, `add`, …) match before any plugin lookup, so a `nub-run` bin never shadows `nub run`. **Script names take the same priority:** a verb naming a local `package.json` script, or one of the conventional names `dev`, `build`, `test`, `start`, `lint`, resolves to a `nub run <verb>` hint before plugin lookup — so a `nub-build` / `nub-test` plugin is never reached through its bare verb. Name plugins for non-script verbs (`nub-changeset`, `nub-release`), or invoke a script-named one via `nub run` or its bin directly.

A JavaScript plugin runs under Nub's runtime augmentation (the version-gated globals are present); a native executable just runs; the plugin's exit code is what Nub returns. Installed bins are not transpiled — the byte-parity boundary keeps `node_modules` identical to plain Node — so the entry that runs must be JavaScript or native. Disable augmentation for a plugin by passing `--node` **before** the verb (`nub --node changeset`); a `--node` after the verb is forwarded to the plugin as an argument.

## Zero lock-in

Nub adds nothing to application code and reads only standard, existing fields:

- **No `globalThis.nub`**, no `nub:*` module namespace, no `@nub/*` npm scope, no `"nub"` field in `package.json`.
- `package.json` fields read: `scripts`, `workspaces`, `bin`, `type`, `exports`, `imports`, `engines.node` (plus `packageManager` / `devEngines` for version pins).
- `tsconfig.json` read the way `tsc` does: `paths`, `baseUrl`, `extends` chains, `jsx`, `experimentalDecorators`.

Package identity:

- **`@nubjs/nub`** — the binary package installed globally.
- **`@nubjs/types`** — ambient TypeScript declarations, a types-only devDep (paired with the latest `@types/node`, currently `26`), never a runtime import.

If Nub disappeared, the codebase keeps working on plain Node unchanged — the worst case is reinstating a separate TS compile step and `dotenv`.

## Packages Nub lets a project drop

Replaced directly by Nub:

```text
dotenv, cross-env          # nub loads .env* automatically (Vite-style precedence)
tsx, ts-node               # nub <file> runs TS with the full TS surface
nodemon                    # nub watch
tsconfig-paths             # tsconfig paths applied at runtime
npx                        # nubx / nub exec
nvm, fnm                   # the pin file alone provisions the right Node
corepack                   # nub pm
the PM CLI itself          # nub install / nub run against the existing lockfile
```

## Compat escape hatch

Both `--node` (per-invocation) and a truthy `NODE_COMPAT` env var (tree-wide) run with zero runtime augmentation while keeping Node-version provisioning on — full contract in `file-runner.md`.

---

**Ground truth:** <https://nubjs.com/docs> · <https://nubjs.com/docs/init> · <https://nubjs.com/docs/plugins> · <https://nubjs.com/docs/faq>
