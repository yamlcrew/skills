# Nub script and package runners

Nub (nubjs) v0.6.0 is a Rust CLI that augments the user's installed Node.js — it is not a fork and ships no patched Node. This reference covers the four dispatch surfaces: the `package.json` script runner `nub run`, the local-first package runner `nubx`, the local-only bin runner `nub exec`, and the explicit-fetch remote runner `nub dlx` (alias `nub x`). All dispatch happens in Rust with no Node bootstrap in the wrapper, which is where the speed comes from.

Pick the surface by intent:

| Command | Reaches registry? | Prompts? | Runs in CI? | Use for |
|---|---|---|---|---|
| `nub run <script>` | never | no | yes | a `package.json` `"scripts"` key |
| `nub exec <bin>` | never (exit 127 on miss) | no | yes | a bin already in `node_modules/.bin` |
| `nubx <bin>` | local miss only | yes (first fetch) | fails closed unless `-y` | local-first, fetch-on-miss with consent |
| `nub dlx <pkg>` / `nub x` | always | no | yes | deliberate fetch-and-run |

## Script runner — `nub run`

Run a `package.json` script by name. `nub run` is a drop-in for `npm run` and `pnpm run`, carrying every flag over with the same spelling and semantics.

```bash
nub run build
nub run dev
nub run test
```

The name must match a key in the `package.json` `"scripts"` field. Barewords do NOT fall through to scripts: `nub build` never runs the `build` script. If `build` is a real script, Nub's error tells you to type `nub run build`. Running a script is always the explicit `nub run <script>` form.

Performance (script dispatch, warm, 50 runs):

| Command | Time | Relative |
|---|---|---|
| `nub run` | 14.7 ms | — |
| `node --run` | 32.2 ms | 2.2x |
| `npm run` | 329.9 ms | 22x |
| `pnpm run` | 442.7 ms | 30x |

That is roughly 24x faster than `npm run` on the cold path.

### Run several scripts with a regex selector

A slash-delimited `/regex/` literal in place of a script name runs every script whose name matches, mirroring `pnpm run`. This is the in-package equivalent of `npm-run-all`'s `run-p`, with no extra dependency and no per-task package-manager re-spawn — Nub spawns each script body directly.

```bash
nub run "/^build:/"     # runs build:js, build:css, build:types — concurrently
```

Matching scripts run concurrently, capped at `min(4, CPU count)`, each output line prefixed by its script name. Cap concurrency at one to serialize them (the `run-s` behavior), in `package.json` order:

```bash
nub run --workspace-concurrency 1 "/^build:/"
```

The selector must be a slash-delimited regular expression literal. A plain `build:*` is treated as a literal script name, not a glob. Regex flags are not supported. An exact name (no slashes) always runs that single script unchanged.

Coming from `npm-run-all` / `npm-run-all2`:

| npm-run-all | Nub |
|---|---|
| `run-p build:js build:css` | `nub run "/^build:(js|css)$/"` |
| `run-p "build:*"` | `nub run "/^build:/"` |
| `run-s "build:*"` | `nub run --workspace-concurrency 1 "/^build:/"` |

Selecting an arbitrary, unrelated set of scripts that share no name pattern (for example `build`, `lint`, `test` together) is not yet supported.

### Forward arguments

Trailing arguments after the script name pass straight through to the script — there is no `--` separator to remember (this matches `bun run`). The explicit `--` still works for muscle memory but is optional.

```bash
nub run test --watch          # forwards --watch to the test script
nub run build --target=esnext # forwards --target=esnext
nub run test -- --watch       # identical result; the -- is optional
```

The dividing line is the script name: a flag BEFORE `<script>` is Nub's, a flag AFTER `<script>` is the script's.

```bash
nub run --silent build        # --silent is Nub's (suppresses the preamble)
nub run build --silent        # --silent is forwarded to the build script
```

Consequently `nub run a b` runs script `a` with `b` as an argument — NOT two scripts.

### Lifecycle hooks

Nub runs `pre<script>` and `post<script>` hooks automatically, matching `npm run` semantics. A single `nub run build` runs `prebuild`, then `build`, then `postbuild` in order. Skip the hooks (for CI or a security-conscious run) with `--ignore-scripts`:

```bash
nub run --ignore-scripts build
```

### Dependency freshness and phantom-dependency checks

Before running, Nub checks the installed `node_modules` against `package.json`. When a dependency is missing or drifted out of its declared range (the "fresh clone, forgot to install" case), Nub warns and still runs, surfacing a clear message instead of a raw `command not found`. The check is marker-free and works whatever installed the tree (npm, pnpm, Yarn, Bun, or Nub). It errs toward silence: an ambiguous tree (Yarn PnP, an unparseable version, a production-only install) never warns.

Set the behavior with the `verify-deps-before-run` key in `.npmrc` — `warn` (default), `error` (refuse to run), or `off`:

```ini
# .npmrc
verify-deps-before-run = warn
```

Override for one shell with `NUB_VERIFY_DEPS_BEFORE_RUN`, or skip once with `--no-check` (aliased as `--no-install` on `nub run`):

```bash
nub run --no-check build
NUB_VERIFY_DEPS_BEFORE_RUN=off nub run build
```

Nub never installs on your behalf here: `install` is accepted as a value but behaves like `warn`. The freshness check also applies to `nub <file>`, `nub exec`, and `nubx`, and is skipped under `--node` and inside an already-running script.

Nub also flags a phantom dependency — a package your source imports but never declares, that resolves today only because a transitive dependency hoisted it into `node_modules`. It emits `WARN_PHANTOM_DEP`, naming the file and the fix, before an isolated install breaks it:

```
nub: src/index.ts imports `ansi-styles`, which isn't in package.json. Run `nub add ansi-styles` (WARN_PHANTOM_DEP).
```

The scan is conservative — it warns only on a package imported unguarded (a `try/catch` optional load is left alone), absent from every dependency field, yet present in `node_modules`. Builtins, self-imports, `@types/*`, and workspace packages never warn, and only first-party source is read. It is warn-only and never changes the exit code. Turn it off with the `phantom-check` key in `.npmrc` or the `NUB_PHANTOM_CHECK` variable:

```ini
# .npmrc
phantom-check = off
```

### The `npm_*` environment

Nub populates the child process with the full npm-compatible environment, so scripts and tooling that read `npm_*` variables behave exactly as under `npm run`. Locally installed CLIs are on `PATH` via the `node_modules/.bin` chain, callable by bare name. The injected set includes:

```
npm_lifecycle_event        npm_package_name
npm_lifecycle_script       npm_package_version
npm_execpath               npm_package_json
npm_node_execpath          npm_package_config_*
npm_command                npm_config_registry     # resolved registry from the .npmrc chain
npm_config_user_agent      npm_config_node_gyp     # path to a runnable node-gyp
INIT_CWD                    # the directory you invoked `nub run` from
```

### The script shell

Nub runs every script body through a POSIX `sh`, so one script behaves the same on macOS, Linux, and Windows: `rm -rf dist && mkdir dist`, `${PORT:-3000}`, `$(…)`, `&&`, and pipes work everywhere. On macOS and Linux that is the system `/bin/sh`; Windows has no POSIX shell, so Nub ships a small one (busybox) next to its binary and uses it by default instead of `cmd.exe`.

It is POSIX `sh`, not bash — bash-only extensions such as `[[ … ]]`, arrays, and `${VAR^^}` are not guaranteed (the same contract `npm` gives, whose `sh -c` is dash on Debian/Ubuntu). Pin a specific shell with the `script-shell` key in `.npmrc`, or per invocation with `--script-shell`:

```ini
# .npmrc
script-shell = /bin/bash
```

```bash
nub run --script-shell /bin/bash build
```

### Workspaces

`-r` (or `--recursive`, npm-style alias `--workspaces`) runs the script in every workspace package. Topology comes from `package.json`'s `"workspaces"` field (npm/Yarn/Bun) or `pnpm-workspace.yaml` (pnpm). Packages run in topological order by default — a package's dependencies build before it. Discovery walks up to the workspace root, so these work from anywhere inside the monorepo.

```bash
nub run -r build                 # run "build" in every package, topological order
nub run --recursive test
nub run --workspaces lint        # npm-style alias for -r
```

`--filter` (or `-F`) takes pnpm's filter grammar verbatim. Multiple `--filter` flags compose as a union of the matched sets.

```bash
nub run --filter @org/api dev            # exact name
nub run --filter "@org/*" build          # scope glob
nub run --filter "*-utils" test          # name wildcard
nub run --filter "./packages/*" lint     # path glob
nub run --filter '!@org/legacy' build    # negation / exclude
nub run --filter @org/api --filter @org/web build   # union
```

Graph selectors walk the workspace package graph:

```bash
nub run --filter "@org/web..." build     # @org/web + its dependencies (downstream)
nub run --filter "...@org/web" build     # @org/web + its dependents (upstream)
nub run --filter "@org/web^..." build    # @org/web's dependencies only
nub run --filter "...^@org/web" build    # @org/web's dependents only
```

Changed-since selectors take a git ref (the common CI pattern):

```bash
nub run --filter "[main]" test           # packages changed since main
nub run --filter "[HEAD~1]" build        # changed since the last commit
nub run --filter "...[origin/main]" test # changed packages AND their dependents
```

Concurrency and ordering across a workspace:

```bash
nub run -r --workspace-concurrency 4 build   # cap concurrent scripts at 4
nub run -r --parallel dev                    # all at once, no topo order or cap
nub run -r --sequential migrate              # one at a time, ignore topology
nub run -r --no-bail test                    # run every package, report failures at end (default is --bail)
nub run -r --resume-from @org/api build      # skip topological predecessors, restart where it broke
```

Root vs member selection — note that `-w` is pnpm's boolean root selector, NOT npm's member selector:

```bash
nub run -w lint                              # run "lint" at the workspace root only
nub run -r --include-workspace-root lint     # all members PLUS the root
nub run --workspace @org/api --workspace @org/web build   # npm-style member selector (repeatable)
```

Output and reporting:

```bash
nub run -r --stream build                # force interleaved live output, "<pkg> | <line>"
nub run -r --aggregate-output build      # force per-package buffering (default off a TTY)
nub run -r --reporter ndjson build       # one JSON event per line, for CI parsing
nub run -r --reporter-hide-prefix build  # drop the per-package prefix
nub run --silent build                   # (-s) suppress Nub's "$ <command>" preamble, not the script's stdout
nub run -r --if-present test             # skip members missing the script
nub run -r --report-summary build        # stream results live via --reporter=ndjson (not a static file)
```

The legacy npm knobs `--scripts-prepend-node-path`, `--unsafe-perm`, and `--npm-path` are not needed and NOT accepted.

### `--node` on run

By default the `nub` executable is aliased as `node` for the duration of a `nub run` call, so any subprocess that spawns `node` (a shebang, `child_process.spawn("node", …)`) inherits Nub's augmentation. Pass `--node` to turn that off for one invocation.

```bash
nub run --node test
```

Under `--node`, everything else still happens: script lookup, workspace walk-up, `--filter` evaluation, `npm_*` env injection, `node_modules/.bin` on `PATH`, and the `pre`/`post` lifecycle hooks. Reach for it when a script's Node shebang chain expects plain Node, when bisecting a Nub bug, or when CI wants byte-exact Node behavior with Nub's workspace selection.

## Local-first package runner — `nubx`

Run a CLI by name whether or not the project has it installed. Resolution is local first: Nub walks the `node_modules/.bin` chain (nearest `node_modules/.bin`, then up to the workspace root) and execs the match directly in Rust — no network, no Node process in the wrapper. Yarn Plug'n'Play projects work too; PnP-registered bins resolve through `pnpapi`, the way `yarn exec` does.

```bash
nubx eslint . --fix        # installed — runs the local copy
nubx vitest run --coverage
nubx cowsay "hi"           # not installed — offers to fetch it
```

Only a local miss reaches the registry, and where `npx` downloads silently, `nubx` asks. The first fetch of a given tool prompts, runs it once you agree, and remembers the answer:

```
$ nubx cowsay "Hello"
The cowsay bin is not installed locally.
Install and run from the remote registry?
  ● Yes
  ○ No
  ○ Never (don't ask me again)
```

Later runs skip the prompt. A pinned version (`nubx cowsay@1.5.0`) is remembered indefinitely; a floating one (`nubx cowsay`, tracking `latest`) is re-confirmed after a day, so a tool that moved to a new version asks again before running new code.

Outside a terminal there is no way to ask, so the fetch FAILS CLOSED — in CI, and any time stdin is not a terminal:

```
$ nubx cowsay "hi"          # in CI
nubx: refusing to download cowsay in CI.
  A CI job should declare the tool as a dependency, or pass -y to fetch it.
```

Pass `-y` (`--yes`) to consent up front: it lets a fetch through in CI or any non-interactive context and skips the first-run prompt.

```bash
nubx -y cowsay "hi"
```

Answering **Never** turns the implicit fetch off for good — Nub records `exec.implicitDlx` in its global settings file (`~/.config/nub/nub.jsonc`), and a local miss then stops instead of offering a download. Explicit fetches (`nub dlx`, `nubx -y`) are unaffected, because asking for them is itself the consent. Restore the prompt with:

```bash
nub config set exec.implicitDlx prompt
```

A fetched package runs through Nub's normal install resolver, so the registry safeguards apply: the `minimumReleaseAge` cooling window and skipped lifecycle scripts (see `nub dlx` below for the full posture).

Arguments after the tool name are forwarded untouched — no `--` separator. `--node` runs the tool with augmentation disabled; resolution, the registry fetch, and `nubx`'s own machinery still run.

```bash
nubx eslint . --fix --max-warnings 0
nubx --node prisma generate
```

## Local-only bin runner — `nub exec`

Run a CLI already installed in the project, by name. `nub exec` resolves an executable on the `node_modules/.bin` chain (nearest first, then up to the workspace root) and execs it directly. It NEVER reaches the registry — on a miss it prints an install hint and exits 127. For a name that might need fetching, use `nubx`.

```bash
nub exec eslint . --fix
nub exec tsc --noEmit
nub exec vitest run --coverage
```

Performance (dispatch a locally-installed CLI, 50 runs):

| Command | Time | Relative |
|---|---|---|
| `nub exec` | 11.6 ms | — (tie with `bun x` at 10.6 ms) |
| `pnpm exec` | 175 ms | 15x |
| `npm exec` | 201 ms | 17x |

The walk-up happens in Rust, so the full-Node-bootstrap overhead `npx` and `pnpm exec` pay per call approximately disappears. Yarn Plug'n'Play projects work too — `nub exec` finds PnP-registered bins that tools walking only `node_modules/.bin` miss.

Arguments after the bin name are forwarded untouched — no `--` separator. `--node` disables runtime augmentation.

```bash
nub exec eslint . --fix --max-warnings 0
nub exec --node tsc --noEmit
```

## Remote bin runner — `nub dlx` / `nub x`

Fetch a package from the registry and run its bin, explicitly. `nub x` is the short alias, mirroring `bunx` / `bun x`. Invoking the command IS the consent: unlike `nubx`'s implicit fallthrough (which prompts on the first fetch and fails closed in CI), `nub dlx` downloads without a prompt and runs in CI, because asking for it is already the deliberate gesture. Both share the same persistent cache and registry safeguards.

```bash
nub dlx create-vite my-app
nub x create-vite my-app                       # short alias
nub dlx -p cowsay -c 'cowsay hi | tr a-z A-Z'  # shell pipeline
```

`-p` / `--package` names the package when the bin name differs from it:

```bash
nub dlx -p @angular/cli ng new my-app
```

`-c` / `--shell-mode` runs a shell one-liner with the fetched package's bin on `PATH`:

```bash
nub dlx -p cowsay -c 'cowsay hi | tr a-z A-Z'
```

A fetched package's `preinstall` / `install` / `postinstall` scripts stay skipped — downloading a tool is not consent to run its dependencies' build scripts. Approve a package with `--allow-build=<pkg>`, the same allowlist `nub install` uses.

A fetch runs through Nub's normal install resolver, so the `minimumReleaseAge` cooling window applies: a resolved version must be older than the window (default 24 hours) before it is used.

## Ground truth

Verify against the docs — `https://nubjs.com/docs/runner`, `https://nubjs.com/docs/runner/run`, `https://nubjs.com/docs/runner/exec`, `https://nubjs.com/docs/runner/dlx`.
