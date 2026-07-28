# Nub file runner — `nub <file>`

Run a source file directly on stock Node with no build step. Nub (nubjs) v0.6.0 is a Rust CLI that *augments* the user's installed Node through Node's own extension surfaces (`--import`/`--require` preload, `module.registerHooks()`, N-API addons, V8-flag injection) — it is not a fork, ships no patched Node, and embeds no runtime of its own. This reference covers executing files, drop-in `node` compatibility, delivery tiers, Node-version resolution, compatibility mode, and watch mode.

## Running a file

```sh
nub index.ts
nub server.tsx
nub script.js
```

Supported extensions — run directly, TypeScript-first, no `tsc`, no `tsx`, no `ts-node`, no `tsconfig` required:

```
.js  .mjs  .cjs  .ts  .mts  .cts  .jsx  .tsx
```

Startup is ~2.9× faster than `tsx`. On top of stock Node, `nub <file>` adds: full TypeScript (including non-erasable `enum`/`namespace`/parameter properties, `emitDecoratorMetadata`), JSX/TSX (automatic runtime by default), editor-style resolution (extensionless imports, `.js → .ts` rewriting, `tsconfig.json#paths`), transpiler-downleveled modern syntax (`using`), automatic `.env*` loading with `${VAR}` expansion, data-file imports (`.yaml`, `.toml`, `.jsonc`, `.json5`, `.txt`), version-banded modern globals (`Temporal`, `URLPattern`, `WebSocket`, `EventSource`, `node:sqlite`, …), and source maps in stack traces. (Augmentation detail lives in the runtime overview; this page is the runner mechanics.)

## Drop-in for `node`

Anything `node <args>` accepts, `nub <args>` accepts — pass-through is the default for the entire flag space; every flag reaches Node verbatim. There is no vendor-specific API surface and no lock-in.

| Category | Flags (pass through verbatim) |
|---|---|
| Diagnostics | `--prof`, `--cpu-prof`, `--report-*` |
| Module resolution | `--conditions`, `--preserve-symlinks` |
| Inspector | `--inspect`, `--inspect-brk` |
| Memory | `--max-old-space-size` |
| Preload | `--import`, `--require` |
| Warnings | `--no-warnings`, `--trace-deprecation` |

```sh
nub --max-old-space-size=4096 build.ts
nub --import ./instrument.js server.ts
nub --inspect-brk script.ts

# Everything after the file is the script's own argv:
nub script.ts --port 3000 --verbose

# stdin, exactly like `node -`:
echo 'console.log(1 + 1)' | nub -
```

Point a VS Code debugger at the `nub` binary to run a program through Nub with breakpoints and stepping.

## Delivery tiers

Above the floor, Nub delivers its augmentations through one of two tiers, selected automatically from the running Node version. The tiers are functionally equivalent — nothing about the code changes between them; they differ only in startup overhead.

| Tier | Hook API | Preload | Thread model |
|---|---|---|---|
| **Fast** | sync `module.registerHooks()` | `--require` (CJS) | in-thread, no loader-worker |
| **Compatibility** | async `module.register()` | `--import` (ESM) | loader-worker thread |

Sync `module.registerHooks()` landed in Node v23.5.0 and was backported to v22.15.0 — and never backported to the 20.x line. The fast-tier floor therefore lands differently per major:

| Node line | Minimum Nub supports | Fast-tier floor | Tier | Recommended |
|---|---|---|---|---|
| 18.x | 18.19 | — | Compatibility (no `registerHooks`) | |
| 20.x | all 20.x | — | Compatibility (`registerHooks` never backported to 20) | |
| 22.x | all 22.x | 22.15 | Fast at 22.15+, compatibility on 22.0–22.14 | ✓ at 22.15+ |
| 23.x | all 23.x | 23.5 | Fast at 23.5+, compatibility on 23.0–23.4 | ✓ at 23.5+ |
| 24.x | all 24.x | 24.0 | Fast (whole line) | ✓ |
| 25.x | all 25.x | 25.0 | Fast (whole line) | ✓ |
| 26.x | all 26.x | 26.0 | Fast (whole line) | ✓ **default** |

- **Hard floor: Node 18.19.** Below it no loader-hook API can carry the augmentations, so Nub refuses to run.
- A dash in the fast-tier column means that line has no fast-tier build — every patch runs the compatibility tier.
- **Node 26 is the recommended default** (newest major, fast tier whole-line).

**Compatibility-tier cost:** the async `module.register()` loader-worker costs about **1.4× slower cold start** than the fast tier — a fixed **~80 ms** startup overhead plus **~90 µs per module**. There is **zero runtime cost**: execution speed is identical, and the penalty is module loading only. The fast tier (22.15+) has none of it.

## Node version resolution

Nub infers the Node version the project expects, provisions it if missing (downloading and caching a matching stock build), and runs the file on it. Discovery walks **up** from the working directory to the nearest pin, taking the first source that yields a version. Highest precedence first:

| # | Source | Notes |
|---|---|---|
| 1 | `NODE_EXECUTABLE` | explicit path to a Node binary — hard override |
| 2 | `package.json` → `devEngines.runtime` | |
| 3 | `.node-version` | |
| 4 | `.nvmrc` | |
| 5 | `.tool-versions` | asdf/mise file; its `nodejs` line |
| 6 | `package.json` → `engines.node` | a range |
| 7 | `node` on `PATH` | used only when nothing is pinned |

```sh
$ echo 26 > .node-version
$ nub hello.ts
Using Node.js 26.3.0 (resolved from .node-version)
Installed in 9.8s
Hello world!
```

Discovery precision details:

- Walks **up** the directory tree to the nearest pin, and **skips** pin files inside an installed dependency (under `node_modules`) — a dependency's own CI pin never drives the project.
- The `package.json` fields (`devEngines.runtime`, `engines.node`) are read from the **workspace-root** manifest when one exists above the working directory — a monorepo pins Node once at the root.

Once a version is pinned, Nub finds a binary for it **in order**:

```
PATH (if it satisfies the pin — so fnm / Volta / mise auto-switching just works)
  → ~/.cache/nub/node/<version>/        (Nub's own download store)
  → an nvm-installed version
  → download the matching stock build from nodejs.org (SHA-256 verified, cached)
```

For manual version management (`nub node install` / `ls` / `uninstall` / `pin` / `which`) and package-manager provisioning, see `pm-and-node.md`.

## Compatibility mode — `--node` / `NODE_COMPAT`

Compatibility mode turns **every** augmentation off and runs the code on plain Node, exactly as `node <file>` would. It keeps **Node-version provisioning on**, so it runs the project's *pinned* Node vanilla — the additivity escape hatch and the differential-debugging tool ("would a plain-Node user get the same result?").

Turned off in compatibility mode:

- the transpile / load hook (`module.registerHooks()` / `module.register()`)
- the `--import` / `--require` preload
- experimental-API unflagging and polyfills
- automatic `.env*` loading
- the `node` PATH shim

Kept on: Node-version resolution + provisioning.

> **Distinct from the compatibility *tier*.** The tier (above) is *how* augmentation is delivered on Node lines without sync `registerHooks`; compatibility *mode* is *whether* augmentation runs at all. They are unrelated switches.

Two spellings, and they compose — either one forces compatibility mode:

### `--node` (per-invocation)

```sh
nub --node script.js     # the project's PINNED Node, vanilla (still provisioned)
node script.js           # the SHELL's Node, unaugmented AND unprovisioned
```

`nub --node` is the differential-debugging tool: it answers "does this reproduce on plain Node, on the exact version this project pins?" — which a bare `node script.js` cannot, because that runs the shell's Node, not the project's.

### `NODE_COMPAT` (tree-wide)

A truthy `NODE_COMPAT` is the project/tree-wide form of `--node` — identical effect (zero augmentation, provisioning stays on), but **persistent and inherited** by every descendant `node` / `nub` in the tree, so `--node` need not be repeated per invocation.

- Truthy values: `1`, `true`, `yes` — **case-insensitive**.
- Brand-clean (`NODE_` prefix; Node does not claim the name).

```sh
export NODE_COMPAT=1     # every nub/node in this shell now runs vanilla
nub script.ts            # plain Node, still on the project's pinned version
```

## Watch mode — `nub watch <file>` / `nub --watch <file>`

The watcher takes a **file, not a script name**. It runs the entry file, then restarts on any change to the file or anything it actually depends on. TypeScript, JSX, `.env*` loading, and `tsconfig.json` paths are all active — `nub watch` runs the same augmented Node as `nub <file>`.

```sh
nub watch src/server.ts
nub --watch src/server.ts   # exact alias — same code path, same defaults
```

The flag and subcommand are aliases: `nub --watch <file>` dispatches to the same path as `nub watch <file>`. The flag form exists so `node --watch script.ts` muscle memory lands in Nub's watcher.

### What triggers a restart

The watch set is loader-instrumented, not glob-based — only files actually loaded in the run, plus a small set of off-graph invalidators reported to Node's watcher explicitly. A restart fires on a change to:

| Trigger | Detail |
|---|---|
| Resolved dependency graph | every file loaded, including `.ts`/`.tsx` transpiled **in-memory** through `module.registerHooks()` that Node never sees on disk |
| `.env*` files | in normal precedence (`.env`, `.env.local`, `.env.[mode]`, …); read once at boot, so reported to the watcher explicitly |
| `--env-file` / `--env-file-if-exists` targets | watched the same way; every restart re-reads them (an edited value is live next run) |
| `tsconfig.json` extends chain | e.g. editing a `paths` mapping restarts even though tsconfig is imported by nothing |
| `package.json` | |

The engine underneath is Node's own `--watch`, run with **`--watch-preserve-output`** so a restart prints Node's status lines instead of wiping the terminal:

```console
$ nub watch src/server.ts
Completed running 'src/server.ts'. Waiting for file changes before restarting...
Restarting 'src/server.ts'
```

**Node-version gate:** off-graph `.env*` re-reading on restart needs **Node 20.6+** (the version that introduced the underlying flag). Below it, values are captured once at startup and an edit applies only after restarting `nub watch` itself.

### Gotchas

- **`--watch` after a script name is forwarded to the script, not to Nub's watcher.** `nub run test --watch` runs the test tool's own watch mode; it does *not* invoke Nub's watcher. Only `nub watch <file>` / `nub --watch <file>` engage Nub's watcher.
- **Off-graph edits don't restart.** Editing `dist/**` or `coverage/**` triggers nothing unless something in the run actually imported the changed file. A rebuild emitting `dist/foo.js` restarts only if `dist/foo.js` was imported.
- **No ignore list needed.** The loader-instrumented model makes the `ignore` / restart-loop-guard hygiene of glob-based watchers unnecessary.
- **A restart does not preserve in-memory state** — it is a full process restart.
- For byte-for-byte vanilla Node watch with no Nub-side glue (no banner, no off-graph reporting), run `node --watch script.js` directly; Nub's PATH shim is per-invocation, so the shell's `node` is always the real Node.

Ground truth: https://nubjs.com/docs/runtime, https://nubjs.com/docs/watch
