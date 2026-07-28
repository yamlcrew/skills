# Nub runtime APIs (v0.6.0)

Nub is a Rust CLI that augments the user's installed Node — it ships no runtime of its own. `nub <file>` layers data-file loaders, Web Storage, a browser-shape `Worker`, and a version-gated modern-API matrix on top of stock Node, delivered only through Node's own extension surfaces (`--import`/`--require` preload, `module.registerHooks()`, V8-flag injection, N-API addons). The support floor is Node 18.19; below it Nub refuses to run. Every gate below is exact — Nub fills a gap only where the running Node lacks the API. Pass `--node` or set a truthy `NODE_COMPAT` to turn all of it off.

## Data-format loaders

Import a config or data file directly. Each loader is keyed on file extension and returns a single parsed default export — exactly like Node's own JSON modules. There are no named exports; destructure the default to pull top-level keys.

```ts
import config from "./config.yaml";  // parsed object
import flags from "./feature.jsonc"; // parsed object (comments stripped)
import pkg from "./Cargo.toml";      // parsed object
import schema from "./schema.json5"; // parsed object (JSON5 superset)
import prompt from "./prompt.txt";   // raw string, no parsing
```

Supported extensions:

- `.jsonc` — JSON with comments
- `.json5` — the JSON5 superset
- `.toml`
- `.yaml` / `.yml`
- `.txt` — loaded as a string, not parsed

`.json` is INTENTIONALLY excluded — it is Node-native (`resolveJsonModule`), so Nub leaves it to Node.

Object formats are typed `Record<string, unknown>`, so destructured keys come out `unknown` — narrow or cast them at the use site. A data file whose top-level value is an array or scalar imports as that value through the default; cast it, since the wildcard type assumes an object.

```ts
import config from "./config.yaml"; // { host: "localhost", port: 5432 }
const { host, port } = config;      // both typed `unknown` — cast/narrow
```

Read any file's raw contents as a string with the `with { type: "text" }` import attribute, whatever the extension. The attribute wins over parsing — a `.yaml` or `.json` read this way is the raw source, never the parsed value. A text import is a single default export, like the data loaders; no named exports.

```ts
import readme from "./README.md" with { type: "text" }; // string
import query from "./query.sql" with { type: "text" };  // string
import raw from "./config.yaml" with { type: "text" };   // YAML source, unparsed
```

> The `.toml` / `.yaml` loader TS types come from `@nubjs/types` — `@types/node` does not declare them. Install `@nubjs/types` as a devDependency alongside `@types/node` (latest) to avoid compiler errors.

## Modern-API matrix

Modern globals and built-ins — TC39, web-platform, and newer Node modules — work out of the box, native where the running Node ships them and gap-filled where it does not. Two mechanisms do the work, picked per API: Nub either preloads a feature-detected JS polyfill (it steps aside the instant the native global appears) or injects the `--experimental-*` flag an older Node hides the API behind. Once Node stabilizes an API, it is native and Nub does nothing.

The **minimum Node** column is the lowest version where the API works under Nub. `18.19+` means the API works across the entire supported range; a numeric floor means the underlying Node mechanism does not exist below it.

| API | Minimum Node | Mechanism |
|---|---|---|
| `Temporal` | 18.19+ | polyfilled below Node 26, native 26+ |
| `URLPattern` | 18.19+ | polyfilled below Node 24, native 24+ |
| `RegExp.escape` | 18.19+ | polyfilled below Node 24, native 24+ |
| `Error.isError` | 18.19+ | polyfilled below Node 24, native 24+ |
| `Promise.try` | 18.19+ | polyfilled below Node 24, native 24+ |
| `Float16Array` | 18.19+ | polyfilled below Node 24, native 24+ |
| `navigator` | 18.19+ | backfilled below Node 21, native 21+ |
| `navigator.locks` | 18.19+ | polyfilled below Node 24.5, native 24.5+ |
| `reportError` | 18.19+ | polyfilled |
| `vm.Module` | 18.19+ | unflagged |
| Wasm module imports | 18.19+ | unflagged below Node 24.5 (22.19 on the 22.x line), native above |
| `WebSocket` | 20.10 | unflagged below Node 22, native 22+ |
| `EventSource` | 20.18 | unflagged below the native line, native above |
| `node:sqlite` | 22.5 | unflagged below Node 22.13, native 22.13+ |
| addon imports | 22.20 | unflagged, never native |
| text imports | 18.20 | polyfilled below Node 26.5, native 26.5+ |
| `node:stream/iter` | 25.9 | unflagged, never native |
| `node:ffi` | 26.1 | unflagged, never native |
| `node:vfs` | 26.4 | unflagged, never native |
| module-syntax detection | 20.10 | unflagged below the default-on line, native above |

Why the floored rows have a real cutoff:

- `WebSocket` needs Node 20.10 — the flag Nub injects below the native line (Node 22) does not exist on older 20.x patches.
- `EventSource` needs Node 20.18, the patch where Node added the flag on the 20 LTS line.
- `node:sqlite` needs Node 22.5, where Node first shipped it; Nub injects the flag through 22.12 and steps aside from 22.13.
- addon imports (importing a native `.node` addon from an ES module) needs Node 22.20 (or 23.6 on the 23 line). Node keeps it behind the flag permanently, so Nub injects it on every version that has it — never native.
- text imports (`import readme from "./README.md" with { type: "text" }`) need Node 18.20, the first version whose parser accepts the `with` import-attribute syntax. Nub polyfills below Node 26.5, then steps aside to Node's native text imports on 26.5+ (injecting `--experimental-import-text`).
- `node:ffi` (26.1), `node:vfs` (26.4), and `node:stream/iter` (25.9) are experimental and default-off; Node keeps each behind an `--experimental-*` flag, so Nub injects it on every version that has the module — none goes native through Node 27 nightly.
- module-syntax detection runs an ambiguous `.js` (ES-module syntax, no `"type"` in `package.json`) as an ES module. Node hid it behind `--experimental-detect-module` from 20.10 (21.1 on the 21 line) until it became default-on at 20.19 and 22.7; Nub injects the flag in that window.

Polyfills are thin, feature-detected shims — the WinterTC Minimum Common Web API surface: `Temporal`, `URLPattern`, `WebSocket`, `Worker`, and the gap globals `reportError` / `self` / `PromiseRejectionEvent`. Each installs only when no native global is already present, so it never shadows what the running Node provides.

## Web Storage

Web Storage works under Nub without a flag to remember. Node hides `sessionStorage` and `localStorage` behind `--experimental-webstorage` on the 22.4–24 band (native from 25), so Nub injects that flag for you on exactly that band. BELOW Node 22.4 the flag does not exist and Web Storage is unavailable.

### `sessionStorage`

In-memory and per-process: created fresh each run, discarded when the process exits, never touching disk. Works out of the box on Node 22.4+ — nothing to pass.

```ts
sessionStorage.setItem("step", "1");
sessionStorage.getItem("step");   // "1"
sessionStorage.length;            // 1
sessionStorage.key(0);            // "step"
sessionStorage.removeItem("step");
sessionStorage.clear();
```

### `localStorage`

Persists across runs, so it needs a backing file on disk. Pass `--localstorage-file <path>` and Nub forwards it to Node verbatim; the flag is also honored when set in `NODE_OPTIONS`. Until you pass it, `localStorage` is `undefined` — so `typeof localStorage === "undefined"` is the feature check.

```ts
localStorage.setItem("token", "abc123");
localStorage.getItem("token"); // "abc123"
localStorage.removeItem("token");
localStorage.clear();
```

```console
$ nub --localstorage-file=./app.db write.ts
abc123
$ nub --localstorage-file=./app.db read.ts
abc123
```

If you pass `--experimental-webstorage` (or `--no-experimental-webstorage`) yourself, Nub respects it and injects nothing.

## Web Workers

Browsers expose a `Worker` global; stock Node ships only `node:worker_threads.Worker`, a different class, and never a browser-shape global. Nub closes the gap with a polyfill preloaded on every supported Node (18.19+), so the browser constructor and messaging shape work unchanged — the `Worker` global is feature-detected and installs lazily on the first `new Worker(...)` (it steps aside when a native browser `Worker` is already present), so it adds nothing to cold start until first use. The worker entry can be TypeScript — Nub transpiles it like any other file.

```ts
const worker = new Worker(import.meta.resolve("./worker.ts"), { type: "module" });
worker.onmessage = (ev) => {
  console.log(ev.data); // → 42
  worker.terminate();
};
worker.postMessage({ n: 41 });
```

```ts
// worker.ts
self.onmessage = (ev) => {
  self.postMessage(ev.data.n + 1);
};
```

A listening worker keeps the process alive — call `worker.terminate()` from the main thread once you have the reply, or `self.close()` from inside the worker.

### Constructor inputs

The constructor takes the WHATWG script-URL inputs: a file path or `URL` (including `file://`), a `data:` URL, or a `blob:` URL.

- **Prefer `import.meta.resolve`** — resolves against the current module (never `process.cwd()`), build-free, TypeScript and all: `new Worker(import.meta.resolve("./worker.ts"))`.
- **Use `new URL("./worker.ts", import.meta.url)` when a bundler is in the pipeline** — Vite, webpack, and esbuild trace the `new URL(...)` form (pulling the worker into its own chunk) but do not yet trace `import.meta.resolve`. This form is bundler-traceable and runtime-correct.
- **A bare relative string resolves against `process.cwd()`, not the calling module** — matching `node:worker_threads` and Bun. It breaks for a nested file run from elsewhere; avoid unless the launch directory is fixed.
- **Inline sources skip resolution** — a `data:` URL runs directly; a `blob:` URL from `URL.createObjectURL` is snapshotted synchronously and spawned.

```ts
new Worker("data:text/javascript," + encodeURIComponent("self.postMessage('ready')"));
new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
```

For a raw source string, pass `{ eval: true }` — Node's inline form (see the compat section below).

### `WorkerOptions`

| Option | Values | Effect |
|---|---|---|
| `type` | `"module"` (default), `"classic"` | Which `importScripts` form the worker scope exposes — classic gets the synchronous loader, module the throwing form |
| `name` | string | Readable as `self.name` inside the worker |
| `eval` | `true` | Runs the constructor's first argument as the worker's source instead of resolving it as a URL |
| `execArgv` | string array | Node flags for the worker; merged onto the flags carrying Nub's preload |
| `env` | object | Environment for the worker thread |

### Messaging and transfer

Exchange messages with `postMessage` / `onmessage` (or `addEventListener("message")`). Inbound messages arrive as real `MessageEvent`s — the payload is on `ev.data`. A thrown error in the worker surfaces on the main thread as an `ErrorEvent` carrying `message`, `error`, and the source location.

```ts
worker.postMessage({ n: 41 });
worker.onmessage = (ev) => console.log(ev.data);              // MessageEvent — payload on .data
worker.addEventListener("message", (ev) => console.log(ev.data));
worker.onerror = (ev) => console.error(ev.message, ev.filename, ev.lineno);
```

Payloads are cloned with Node's structured serializer. Pass a transfer list as the second argument to move ownership instead of copying — transferring detaches the source:

```ts
const buf = new ArrayBuffer(8);
worker.postMessage(buf, [buf]); // buf.byteLength is now 0 on this side
```

| Category | Members |
|---|---|
| Cloned | plain objects and arrays, `Map` / `Set` / `Date`, typed arrays |
| Transferred | `ArrayBuffer`, `MessagePort`, `FileHandle` — Node's transferable set |
| Shared | `SharedArrayBuffer` (shared by reference, not copied) |
| Unavailable | `ImageBitmap`, `OffscreenCanvas`, stream transfer — no DOM substrate on Node |

### Inside the worker

Nub installs the WHATWG dedicated-worker scope on top of `node:worker_threads.parentPort`. `self` (=== `globalThis`) carries the messaging and lifecycle surface; call `self.close()` to stop the worker from the inside. `MessageEvent`, `MessageChannel`, and `MessagePort` are Node's own globals, available in a worker unchanged.

A module worker is the default and gets a throwing `importScripts`. A classic worker (`{ type: "classic" }`) instead gets the synchronous `importScripts()` loader, which evaluates local files and `data:` URLs in order — remote `http:` / `https:` URLs are unsupported (no synchronous network on Node). The `type` option chooses only which loader the scope exposes; Node still decides module-vs-CommonJS parsing by file extension and the nearest `package.json` `"type"`, the same rule Nub applies to the main entry.

```ts
// worker.cjs — a classic worker
importScripts("./setup.cjs"); // fetch + run synchronously, in order
self.onmessage = (ev) => self.postMessage(ev.data);
```

### `node:worker_threads` compatibility

The same handle also mirrors `node:worker_threads.Worker` for Node-style code: its `EventEmitter` methods, the `online` and `exit` lifecycle events, a `Promise`-returning `terminate()`, and `{ eval: true }` for an inline source string. On the node channel, `message` listeners get the raw posted value and `error` listeners a bare `Error` — Node's shapes, not the `MessageEvent` / `ErrorEvent` the web channel keeps. Both channels live on one handle.

```ts
const worker = new Worker(
  `const { parentPort } = require("node:worker_threads");
   parentPort.on("message", (n) => parentPort.postMessage(n * 2));`,
  { eval: true },
);
worker.on("online", () => console.log("started"));
worker.on("message", async (value) => {
  console.log(value);                     // raw value, not a MessageEvent
  const code = await worker.terminate();  // Promise<number>
});
worker.postMessage(21);
```

### TypeScript and constraints

The main-thread `Worker` global and `WorkerOptions` are typed by `@nubjs/types` (install alongside `@types/node` latest). The declaration steps aside when `lib: ["dom"]` is in your `tsconfig.json` — the DOM's own `Worker` type wins there. Inside a worker file the scope is the dedicated-worker scope, which neither `@types/node` nor `@nubjs/types` declares: set `lib: ["webworker"]` for full worker-scope types, or drop a one-line shim (`declare var self: Worker;`) for the common handlers. `self.close()` and `importScripts()` are worker-scope-only — reach for `lib: ["webworker"]` if you use them.

Two constraints worth knowing:

- **No `SharedWorker`** — it needs a browser document and origin model with no server-side equivalent. Use a single worker with message passing.
- **Workers are real OS threads** — each has its own V8 isolate and module graph, heavier than a browser worker. Pool them for hot paths instead of spawning one per task.

## Debugging

VS Code's Node debugger launches your program with its own `node`, skipping Nub. Point `runtimeExecutable` at the `nub` binary instead and Nub launches the file for you — the inspector comes up and the debugger attaches with no extra setup.

```json
// .vscode/launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Debug (nub)",
  "runtimeExecutable": "nub",
  "program": "${workspaceFolder}/src/index.ts",
  "skipFiles": ["<node_internals>/**"]
}
```

VS Code injects `--inspect-brk` ahead of your file and Nub forwards it to the Node child it spawns, so the inspector binds to the port VS Code chose and attaches; the first stop lands on the first line of your file, not inside Nub's internals.

- **Breakpoints in `.ts` source land on the right line.** Nub transpiles TypeScript with an inline source map and injects `--enable-source-maps`, so the debugger maps running code back to your original file — no build step and no `outFiles` configuration.
- **Pass program argv through `args`.** Each entry lands on `process.argv`, exactly as it would after the file on the command line: `"args": ["--out", "./dist", "--verbose"]`.
- **Debug on plain Node** by adding `"runtimeArgs": ["--node"]` — every augmentation off, the project's pinned version still used. It answers the differential question: does the bug still reproduce with none of Nub's runtime changes?
- **If `nub` isn't found**, VS Code resolves `runtimeExecutable` against its own `PATH`. Set the field to the absolute path that `which nub` prints (for example `~/.nub/bin/nub`).

Ground truth: https://nubjs.com/docs/runtime/loaders · https://nubjs.com/docs/runtime/web-storage · https://nubjs.com/docs/runtime/workers · https://nubjs.com/docs/runtime/debugging
