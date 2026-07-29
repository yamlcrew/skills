#!/usr/bin/env node
// opencode-cc.mjs — the single CLI for the opencode-agent-cc plugin.
//
// Two jobs in one entry point:
//   doctor  — read-only, dependency-free environment report (is opencode set up? what will it run?)
//   tasks   — delegate work to OpenCode asynchronously over a single managed headless server
//
// Delegate work, check whether a task is still processing, and read its result or a generated
// summary — all from the command line. Designed for "submit a task, come back later".
//
// The SDK is loaded lazily: `doctor` and `help` work without it, which matters because a missing
// SDK is one of the things doctor exists to diagnose.
//
// It talks to a running `opencode serve` instance (auto-started and reused across calls). Every
// task is just an OpenCode *session* on that server; "status" reads the live session, so there is
// no flaky local state to go stale.
//
//   opencode-cc doctor              # environment report (--pretty for humans)
//   opencode-cc run "Refactor src/auth.ts into smaller modules"
//   opencode-cc status            # one task, or all running
//   opencode-cc wait  <id>        # block until a task finishes, then print its output
//   opencode-cc result <id>       # full assistant output of a finished task
//   opencode-cc summary <id>      # generate a concise summary of a task's outcome
//   opencode-cc list              # recent tasks
//   opencode-cc cancel <id>       # abort a running task
//   opencode-cc serve [--port P]  # start/reuse the background server explicitly
//   opencode-cc stop              # stop the server this CLI started
//
// The task subcommands REQUIRE the OpenCode SDK: `npm install -g @opencode-ai/sdk` (resolved
// automatically). `doctor` does not. The `opencode` CLI must be installed and a provider
// authenticated. Model: defaults to the user's configured model; override with `--model p/m`.
//
// Usage: `node opencode-cc.mjs <command> [options]`  (or chmod +x and call directly).

import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

// Don't crash when output is piped into something that closes early (e.g. `… | head`).
process.stdout?.on?.("error", (e) => {
  if (e?.code === "EPIPE") process.exit(0);
});
process.stderr?.on?.("error", (e) => {
  if (e?.code === "EPIPE") process.exit(0);
});

// --- paths & config --------------------------------------------------------
const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

// Per-user state lives outside the repo: XDG on Linux/macOS, LOCALAPPDATA on Windows.
const DATA_DIR =
  process.env.OPENCODE_TASKS_DIR ||
  (IS_WINDOWS
    ? join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "opencode-agent-cc")
    : join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode-agent-cc"));
// server.json is the generated, declarative record of the ONE server this CLI manages.
// server.lock is a mutex held only while starting one, so concurrent invocations cannot each
// spawn their own.
const SERVER_FILE = join(DATA_DIR, "server.json");
const LOCK_FILE = join(DATA_DIR, "server.lock");
const DEFAULT_PORT = Number(process.env.OPENCODE_PORT) || 4198;
const DEFAULT_HOST = process.env.OPENCODE_HOST || "127.0.0.1";
const LOCK_STALE_MS = 90_000; // a starter that holds the lock longer than this is presumed crashed
const START_TIMEOUT_MS = 40_000;
const HEALTH_TIMEOUT_MS = 3_000; // never block forever on a port that accepts but does not answer

// --- minimal arg parsing ---------------------------------------------------
const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "help";
const rest = command === "help" ? argv : argv.slice(1);

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--wait" || a === "-w") flags.wait = true;
    else if (a === "--raw") flags.raw = true;
    else if (a === "--verbose") flags.verbose = true;
    else if (a === "--no-summary") flags.noSummary = true;
    else if (a === "--all") flags.all = true;
    else if (a === "--model" || a === "-m") flags.model = args[++i];
    else if (a === "--title" || a === "-t") flags.title = args[++i];
    else if (a === "--agent" || a === "-a") flags.agent = args[++i];
    else if (a === "--file" || a === "-f") (flags.files ||= []).push(args[++i]);
    else if (a === "--url") flags.url = args[++i];
    else if (a === "--port") flags.port = Number(args[++i]);
    else if (a === "--host") flags.host = args[++i];
    else if (a === "--timeout") flags.timeout = Number(args[++i]);
    else if (a === "--dir" || a === "-d") flags.dir = args[++i];
    else if (a === "--force") flags.force = true;
    else if (a === "--pretty") flags.pretty = true;
    else if (a === "--dangerously-skip-permissions") flags.skipPerms = true;
    else if (a.startsWith("--")) flags[a] = args[++i]; // ignore unknown valued flags
    else positional.push(a);
  }
  return { flags, positional };
}

const out = {
  emit(obj) {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  },
  print(s = "") {
    process.stdout.write(s + "\n");
  },
};

// --- SDK loader (local install, then global node_modules, then env) ---------
async function loadSDK() {
  const tries = [];
  // 1. ordinary bare import (local node_modules)
  tries.push(() => import("@opencode-ai/sdk"));
  // 2. global install, resolved to a file:// URL (ESM ignores NODE_PATH)
  tries.push(() => {
    // On Windows npm is npm.cmd (there is no npm.exe) and Node's path search only appends
    // .com/.exe, so this must go through a shell there or it throws ENOENT and the global SDK
    // — the only documented install — can never be found.
    const root = execFileSync("npm", ["root", "-g"], {
      encoding: "utf8",
      ...(IS_WINDOWS ? { shell: true } : {}),
    }).trim();
    const pjPath = join(root, "@opencode-ai", "sdk", "package.json");
    const pj = JSON.parse(readFileSync(pjPath, "utf8"));
    const rel = pj.exports?.["."]?.import || pj.module || "dist/index.js";
    return import(pathToFileURL(join(root, "@opencode-ai", "sdk", rel)).href);
  });
  // 3. explicit env override
  if (process.env.OPENCODE_SDK_PATH)
    tries.push(() => import(pathToFileURL(process.env.OPENCODE_SDK_PATH).href));

  for (const t of tries) {
    try {
      return await t();
    } catch {
      /* next */
    }
  }
  out.print(
    "OpenCode SDK not found. Install it once:\n" +
      "  npm install -g @opencode-ai/sdk\n" +
      "(already installed globally? set OPENCODE_SDK_PATH to its dist/index.js)"
  );
  process.exit(1);
}

// --- server lifecycle ------------------------------------------------------
function readServer() {
  try {
    return JSON.parse(readFileSync(SERVER_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeServer(s) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SERVER_FILE, JSON.stringify(s, null, 2));
}
function clearServer() {
  try {
    rmSync(SERVER_FILE);
  } catch {
    /* ignore */
  }
}
function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A bounded check is essential: a port held by something that accepts TCP but never answers HTTP
// (a half-dead process, an unrelated service) would otherwise hang this request — and every caller
// waiting on it — forever.
async function healthOk(client, timeoutMs = HEALTH_TIMEOUT_MS) {
  try {
    const r = await client.session.list({ signal: AbortSignal.timeout(timeoutMs) });
    return Array.isArray(r?.data ?? r);
  } catch {
    return false;
  }
}

const clientFor = (sdk, url) => sdk.createOpencodeClient({ baseUrl: url, throwOnError: false });
const targetOf = (flags) => {
  const host = flags?.host || DEFAULT_HOST;
  const port = flags?.port || DEFAULT_PORT;
  return { host, port, url: `http://${host}:${port}` };
};

// --- startup mutex ---------------------------------------------------------
// Without this, two concurrent invocations both see "no server" and both spawn one. `wx` fails if
// the file exists, and that check-and-create is atomic, so exactly one caller wins the race.
let lockHeld = false;
function acquireLock() {
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    const fd = openSync(LOCK_FILE, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }, null, 2));
    closeSync(fd);
    lockHeld = true;
    return true;
  } catch (e) {
    if (e?.code !== "EEXIST") throw e;
    return false;
  }
}
// `process.exit()` skips `finally`, so a failed start would otherwise leave the lock behind. It
// would eventually be treated as stale, but until then `server` reports a lock nobody holds.
process.on("exit", () => {
  if (lockHeld) {
    try {
      rmSync(LOCK_FILE);
    } catch {
      /* ignore */
    }
  }
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    releaseLock();
    process.exit(130);
  });
}
function readLock() {
  let raw;
  try {
    raw = readFileSync(LOCK_FILE, "utf8");
  } catch {
    return null; // genuinely absent
  }
  try {
    const parsed = JSON.parse(raw);
    if (Number.isInteger(parsed?.pid)) return parsed;
  } catch {
    /* fall through */
  }
  // `wx` creates the file empty and the contents land a moment later, so a concurrent reader can
  // see 0 bytes. Treating that as "no lock" would let it steal a lock somebody is mid-way through
  // taking — two starters. With no pid to check, fall back to the file's own age.
  try {
    return { pid: null, at: statSync(LOCK_FILE).mtimeMs };
  } catch {
    return null;
  }
}
function releaseLock() {
  lockHeld = false;
  try {
    rmSync(LOCK_FILE);
  } catch {
    /* ignore */
  }
}
// A lock whose holder died (or has held it absurdly long) must not wedge the CLI forever.
function lockIsStale(lock) {
  if (!lock) return true;
  // Holder unknown (see readLock): judge on age alone, never on a pid we could not read.
  if (lock.pid === null) return Date.now() - (lock.at || 0) > LOCK_STALE_MS;
  if (!pidAlive(lock.pid)) return true;
  return Date.now() - (lock.at || 0) > LOCK_STALE_MS;
}

// --- resolve / adopt / start ------------------------------------------------
// Returns { url, client, pid, managed } or null.
async function adoptRecorded(sdk) {
  const rec = readServer();
  if (!rec?.url) return null;
  const client = clientFor(sdk, rec.url);
  if (await healthOk(client)) {
    return { url: rec.url, client, pid: rec.pid, managed: rec.managed !== false };
  }
  // The record points at nothing that answers. If the recorded process is still alive it is
  // probably still booting, so give it a moment before declaring the record dead.
  if (pidAlive(rec.pid)) {
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      if (await healthOk(client)) {
        return { url: rec.url, client, pid: rec.pid, managed: rec.managed !== false };
      }
    }
  }
  clearServer();
  return null;
}

// Which process is actually listening on the port. `spawn()` returns the pid of the launcher,
// which for the `opencode` shim is a short-lived wrapper that exits — recording it meant `stop`
// later killed a dead pid, reported success, and left a live server orphaned. Asking the OS who
// owns the port is authoritative, works the same for a server we started and one we adopted, and
// needs no shell tricks (so it behaves on Windows too).
function listenerPid(port) {
  const attempts = IS_WINDOWS
    ? [["netstat", ["-ano", "-p", "tcp"]]]
    : IS_MAC
      ? [["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]]]
      : [
          ["ss", ["-lptnH", `sport = :${port}`]],
          ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]],
        ];
  for (const [cmd, args] of attempts) {
    try {
      const text = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const pid = parseListenerPid(text, port);
      if (pid) return pid;
    } catch {
      /* tool missing or no match — try the next one */
    }
  }
  return null;
}

// Output shapes handled:
//   linux   ss -lptnH   LISTEN 0 511 127.0.0.1:4198 0.0.0.0:* users:(("opencode",pid=1234,fd=20))
//   macOS   lsof -t     a bare pid per line
//   windows netstat -ano  TCP  127.0.0.1:4198  0.0.0.0:0  LISTENING  4321
// The Windows branch keys on the LOCAL ADDRESS column, not the state word: netstat localises the
// state ("ABHÖREN", "NASŁUCHIWANIE", …), so matching /LISTENING/ silently finds nothing outside
// English installs. Keying on the local address is also what makes it reject the two look-alikes —
// a longer port ending in the same digits (`:14198`), and our port appearing as the FOREIGN address
// of an established connection. Any row whose LOCAL address is our port belongs to the server
// anyway, whether it is the listening socket or an accepted connection on it.
function parseListenerPid(text, port) {
  const ss = text.match(/pid=(\d+)/); // ss: users:(("opencode",pid=1234,fd=20))
  if (ss) return Number(ss[1]);
  for (const line of text.split(/\r?\n/)) {
    if (IS_WINDOWS) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4 || !/^(TCP|UDP)$/i.test(parts[0])) continue;
      if (!parts[1].endsWith(`:${port}`)) continue;
      const n = Number(parts[parts.length - 1]);
      if (Number.isInteger(n) && n > 0) return n;
    } else {
      const n = Number(line.trim()); // lsof -t prints bare pids
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return null;
}

// `opencode` on Windows is a .cmd shim, which Node cannot exec without a shell. Because that means
// the arguments pass through a shell there, host/port are validated before use.
function spawnServer(host, port) {
  const args = ["serve", "--hostname", host, "--port", String(port)];
  const opts = { detached: true, stdio: ["ignore", "ignore", "ignore"] };
  const child = IS_WINDOWS
    ? spawn("opencode", args, { ...opts, shell: true, windowsHide: true })
    : spawn("opencode", args, opts);
  child.unref();
  return child;
}

function assertSafeTarget(host, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    out.print(`Invalid port: ${port}. Expected an integer between 1 and 65535.`);
    process.exit(1);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(host)) {
    out.print(`Invalid host: ${host}. Expected a plain hostname or IP address.`);
    process.exit(1);
  }
}

// Terminate a server. Only group-kills a server we started ourselves: an adopted server may share
// its process group with the user's shell, and killing that group would take the shell down too.
function killServer(rec, force) {
  const signal = force ? "SIGKILL" : "SIGTERM";
  if (IS_WINDOWS) {
    const args = ["/PID", String(rec.pid), "/T"];
    if (force) args.push("/F");
    try {
      execFileSync("taskkill", args, { stdio: "ignore" });
    } catch {
      /* already gone */
    }
    return;
  }
  if (rec.pgid && rec.managed !== false) {
    try {
      process.kill(-rec.pgid, signal);
    } catch {
      /* group already gone */
    }
  }
  try {
    process.kill(rec.pid, signal);
  } catch {
    /* already gone */
  }
}

// Start exactly one server on the requested port. Deliberately does NOT scan for a free port:
// drifting to the next one is how a machine ends up with a pile of untracked servers.
async function startServer(flags, sdk) {
  const { host, port, url } = targetOf(flags);
  assertSafeTarget(host, port);
  const client = clientFor(sdk, url);

  // Someone else's server already listening there? Adopt it rather than add another.
  if (await healthOk(client)) {
    const rec = { pid: listenerPid(port), pgid: null, url, port, host, startedAt: null, managed: false };
    writeServer(rec);
    return { ...rec, client };
  }

  // Who (if anyone) already held the port. Needed for the cleanup below: resolving the victim from
  // the port alone would target THIS process — the very thing that made us fail — and SIGTERM an
  // innocent bystander (`run --port 3000` would kill a dev server on 3000).
  const preexisting = listenerPid(port);

  const child = spawnServer(host, port);
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(1000);
    if (await healthOk(client)) {
      // detached:true puts the child in its own process group, so pgid === child.pid.
      const rec = {
        pid: listenerPid(port) ?? child.pid,
        pgid: child.pid,
        url,
        port,
        host,
        startedAt: Date.now(),
        managed: true,
      };
      writeServer(rec);
      return { ...rec, client };
    }
  }

  // Clean up only what WE started. If the port owner is unchanged it is not ours — leave it alone.
  const owner = listenerPid(port);
  const ourPid = owner && owner !== preexisting ? owner : child.pid;
  let cleanedUp = false;
  if (ourPid && ourPid !== preexisting) {
    killServer({ pid: ourPid, pgid: child.pid, managed: true }, false);
    for (let i = 0; i < 6 && pidAlive(ourPid); i++) await sleep(500);
    if (pidAlive(ourPid)) killServer({ pid: ourPid, pgid: child.pid, managed: true }, true);
    for (let i = 0; i < 6 && pidAlive(ourPid); i++) await sleep(500);
    cleanedUp = !pidAlive(ourPid);
  }

  out.print(`Could not start an opencode server on ${url}.`);
  out.print(`  Nothing healthy answered there within ${Math.round(START_TIMEOUT_MS / 1000)}s.`);
  if (cleanedUp) out.print(`  The process we started was stopped again rather than left behind.`);
  else if (ourPid && pidAlive(ourPid)) out.print(`  Warning: pid ${ourPid} that we started is still alive — stop it manually.`);
  if (preexisting) out.print(`  Port ${port} was already held by pid ${preexisting}, which was left untouched.`);
  out.print("");
  out.print("Most likely the port is taken by something that is not an opencode server. Either:");
  out.print(`  free port ${port}, or`);
  out.print("  pick another:      --port <n>   (or OPENCODE_PORT)");
  out.print("  use your own:      --url http://127.0.0.1:4096   (or OPENCODE_URL)");
  process.exit(1);
}

// Resolve which URL to use, honouring an explicit --url/OPENCODE_URL. Returns
// { url, client, pid, managed, external } or, for an unreachable explicit url, { unreachable }.
async function resolveServer(flags, sdk) {
  const explicitUrl = flags?.url || process.env.OPENCODE_URL;
  if (explicitUrl) {
    const client = clientFor(sdk, explicitUrl);
    if (await healthOk(client)) return { url: explicitUrl, client, external: true, managed: false };
    return { url: explicitUrl, client, external: true, managed: false, unreachable: true };
  }
  return adoptRecorded(sdk);
}

async function ensureServer(flags, sdk) {
  const explicitUrl = flags?.url || process.env.OPENCODE_URL;
  if (explicitUrl) {
    const existing = await resolveServer(flags, sdk);
    if (existing?.unreachable) {
      out.print(`No opencode server answering at ${explicitUrl}.`);
      out.print("Start one with `opencode serve`, or drop --url/OPENCODE_URL to let this CLI manage one.");
      process.exit(1);
    }
    return existing;
  }

  const existing = await adoptRecorded(sdk);
  if (existing) {
    warnPortIgnored(flags, existing);
    return existing;
  }

  // Only one invocation may start a server; the rest wait for the winner to publish it. Bounded by
  // an overall deadline rather than a retry count — counting attempts meant that stealing one stale
  // lock used up an attempt and the next iteration reported a timeout that had not happened.
  const giveUpAt = Date.now() + START_TIMEOUT_MS * 2;
  while (Date.now() < giveUpAt) {
    if (acquireLock()) {
      try {
        // Double-checked: another invocation may have finished between our check and the lock.
        const now = await adoptRecorded(sdk);
        if (now) {
          warnPortIgnored(flags, now);
          return now;
        }
        return await startServer(flags, sdk);
      } finally {
        releaseLock();
      }
    }

    if (lockIsStale(readLock())) {
      releaseLock(); // holder is gone — drop it and try to take it on the next pass
      await sleep(100); // don't hot-spin if another process keeps recreating it
      continue;
    }

    // Someone is starting one right now — wait for them rather than racing.
    await sleep(1000);
    const ready = await adoptRecorded(sdk);
    if (ready) {
      warnPortIgnored(flags, ready);
      return ready;
    }
  }

  out.print("Timed out waiting for another invocation to start the opencode server.");
  out.print(`Check it with: opencode-cc server   (state: ${SERVER_FILE})`);
  process.exit(1);
}

// Single-instance means an explicit --port/--host cannot be honoured while a server is already up.
// Say so instead of silently ignoring it.
function warnPortIgnored(flags, server) {
  if (!flags?.port && !flags?.host) return;
  const { url } = targetOf(flags);
  if (url === server.url) return;
  process.stderr.write(
    `note: reusing the running server at ${server.url}; ignoring ${url}.\n` +
      `      stop it first (opencode-cc stop) to start one elsewhere.\n`
  );
}

// --- opencode session helpers ----------------------------------------------
const dataOf = (r) => r?.data ?? r;

function extractText(message) {
  if (!message || !Array.isArray(message.parts)) return "";
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}
function extractReasoning(message) {
  if (!message || !Array.isArray(message.parts)) return "";
  return message.parts
    .filter((p) => p.type === "reasoning")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

// last assistant message, if any
function lastAssistant(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].info?.role === "assistant") return messages[i];
  }
  return null;
}

// {state: 'running'|'done'|'error'|'empty', message}
function classify(messages) {
  if (!messages.length) return { state: "empty" };
  const last = messages[messages.length - 1];
  const asst = lastAssistant(messages);
  if (!asst) return { state: "running", message: last }; // prompt sent, no reply yet
  const completed = asst.info?.time?.completed;
  if (asst.info?.error) return { state: "error", message: asst };
  if (completed) return { state: "done", message: asst };
  return { state: "running", message: asst };
}

async function fetchMessages(client, id) {
  const r = await client.session.messages({ path: { id } });
  return dataOf(r) || [];
}

// Sessions the server is actively working on. One call: the status map only carries sessions that
// are not idle. Returns null when it cannot be determined (server unreachable, old server, …) so
// callers can distinguish "nothing running" from "don't know".
async function activeSessions(client) {
  try {
    const r = await client.session.status({ signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const map = dataOf(r);
    if (!map || typeof map !== "object") return null;
    return Object.entries(map)
      .filter(([, s]) => s?.type === "busy" || s?.type === "retry")
      .map(([id, s]) => ({ id, state: s.type }));
  } catch {
    return null;
  }
}

async function titlesFor(client, ids) {
  const titles = new Map();
  try {
    const list = dataOf(await client.session.list()) || [];
    for (const s of list) if (ids.includes(s.id)) titles.set(s.id, s.title || "");
  } catch {
    /* titles are a nicety, not required */
  }
  return titles;
}

// build the prompt body, optionally attaching files as text context
function buildBody(flags, promptText) {
  const parts = [];
  let text = promptText;
  if (flags.files?.length) {
    const blocks = [];
    for (const f of flags.files) {
      try {
        const content = readFileSync(f, "utf8");
        blocks.push(`--- ${f} ---\n${content}`);
      } catch {
        blocks.push(`--- ${f} ---\n(could not read file)`);
      }
    }
    text = (text ? text + "\n\n" : "") + "Attached files:\n\n" + blocks.join("\n\n");
  }
  if (text) parts.push({ type: "text", text });
  const body = { parts };
  if (flags.model) {
    const idx = flags.model.indexOf("/");
    if (idx > 0)
      body.model = {
        providerID: flags.model.slice(0, idx),
        modelID: flags.model.slice(idx + 1),
      };
  }
  return body;
}

// --- model validation ------------------------------------------------------
// A model the server cannot resolve is never reported as an error: the session is created, the
// prompt is accepted, and no assistant message is ever produced — indistinguishable from "still
// thinking", so `wait` spins until it times out. Catch it before the task is submitted.
function capped(items, max = 24) {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown}, … +${items.length - max} more` : shown;
}

function exitUnavailable(headline, source, detail) {
  out.print(headline);
  out.print(`  source: ${source}`);
  out.print(`  ${detail}`);
  out.print(
    source === "--model"
      ? "Pass an available model with --model <provider/model>."
      : 'Fix the "model" field in opencode.json, or pass --model <provider/model> for this task.'
  );
  process.exit(1);
}

async function assertModelAvailable(client, flags) {
  const source = flags.model ? "--model" : "the configured default (opencode.json)";
  let effective = flags.model;
  if (!effective) {
    try {
      effective = dataOf(await client.config.get())?.model;
    } catch {
      return; // config unreadable — let the server decide
    }
  }
  if (!effective) return; // nothing configured anywhere — the server picks its own

  let listed;
  try {
    listed = dataOf(await client.provider.list());
  } catch {
    return; // provider list unreachable — let the server decide
  }
  if (!Array.isArray(listed?.all)) return; // unknown shape — do not block

  // `all` lists every known provider, so narrow to the ones actually connected.
  const connected = new Set(listed.connected ?? []);
  const usable = listed.all.filter((p) => connected.size === 0 || connected.has(p.id));
  const slash = effective.indexOf("/");
  const providerID = slash > 0 ? effective.slice(0, slash) : effective;
  const modelID = slash > 0 ? effective.slice(slash + 1) : "";
  const provider = usable.find((p) => p.id === providerID);

  if (provider) {
    const models = Object.keys(provider.models ?? {});
    if (!models.length) return; // provider advertises no models — cannot verify, do not block
    if (models.includes(modelID)) return;
    exitUnavailable(
      `Model "${effective}" is not available.`,
      source,
      `${providerID} models: ${capped(models.sort())}`
    );
  } else {
    exitUnavailable(
      `Model "${effective}" is not available (provider "${providerID}" is not connected).`,
      source,
      `connected providers: ${capped(usable.map((p) => p.id).sort())}`
    );
  }
}

// --- commands --------------------------------------------------------------
async function cmdRun(sdk) {
  const { flags, positional } = parseFlags(rest);
  let prompt = positional.join(" ").trim();
  if (!prompt && !process.stdin.isTTY) {
    prompt = readFileSync(0, "utf8").trim();
  }
  if (!prompt && !flags.files?.length) {
    out.print("Usage: opencode-cc run \"<prompt>\"   (or pipe via stdin, add -f <file>)");
    process.exit(1);
  }

  const { url, client } = await ensureServer(flags, sdk);

  await assertModelAvailable(client, flags);

  // --dir sets the session's working directory server-side. It used to be parsed and then ignored,
  // so the flag was documented but did nothing.
  let directory = null;
  if (flags.dir) {
    directory = resolve(flags.dir);
    if (!existsSync(directory)) {
      out.print(`No such directory: ${directory}`);
      process.exit(1);
    }
  }

  const created = await client.session.create({
    ...(directory ? { query: { directory } } : {}),
    body: { title: flags.title || prompt.slice(0, 60) || "task" },
  });
  const session = dataOf(created);
  const id = session?.id;
  if (!id) {
    out.print("Failed to create a session on the server.");
    process.exit(1);
  }

  const body = buildBody(flags, prompt);

  if (flags.wait) {
    // foreground: block on the synchronous prompt
    out.print(`Running (foreground) on ${url} — ${id}`);
    const r = await client.session.prompt({ path: { id }, body });
    const msg = dataOf(r);
    printResult(msg, flags);
    return;
  }

  // async: fire promptAsync, return immediately
  await client.session.promptAsync({ path: { id }, body });
  if (flags.json) {
    out.emit({ id, url, status: "running", title: flags.title || prompt.slice(0, 60) });
    return;
  }
  out.print(`Submitted task ${id}`);
  out.print(`  status:  opencode-cc status ${id}`);
  out.print(`  wait:    opencode-cc wait ${id}`);
  out.print(`  result:  opencode-cc result ${id}`);
}

// Start the managed server explicitly, or report the one already there.
async function cmdServe(sdk) {
  const { flags } = parseFlags(rest);
  const explicitUrl = flags.url || process.env.OPENCODE_URL;
  const existing = await resolveServer(flags, sdk);

  if (existing && !existing.unreachable) {
    // `managed` — not the never-assigned `ours` the old line read, which made this suffix dead code.
    const own = existing.external ? " (external, via --url/OPENCODE_URL)" : existing.managed ? " (started by this CLI)" : " (adopted)";
    out.print(`Server already running at ${existing.url}${own}`);
    return;
  }

  // An explicit url that does not answer must not silently become "start one somewhere else".
  if (explicitUrl) {
    out.print(`No opencode server answering at ${explicitUrl}.`);
    out.print("This CLI will not start a server while --url/OPENCODE_URL is set — it does not own that one.");
    out.print("Start it yourself (`opencode serve`), or drop --url/OPENCODE_URL to let this CLI manage one.");
    process.exit(1);
  }

  const { url, pid } = await startServer(flags, sdk);
  out.print(`Started opencode server at ${url} (pid ${pid}). Stop with: opencode-cc stop`);
}

// Stop the recorded server and CONFIRM it is gone. The old version killed the pid, printed
// "Stopped", and deleted the record unconditionally — so a failed kill silently orphaned a live
// server that the CLI could then never see or stop again.
async function cmdStop(sdk) {
  const { flags } = parseFlags(rest);
  const rec = readServer();
  if (!rec) {
    out.print("No server recorded by this CLI.");
    const { port } = targetOf(flags);
    const stray = listenerPid(port);
    if (stray) {
      out.print(`Note: something is listening on port ${port} (pid ${stray}) that this CLI did not record.`);
      out.print(`      Stop it yourself, or adopt it with: opencode-cc server`);
    }
    return;
  }

  // Re-resolve the pid from the port: the recorded one may be stale after a restart.
  const pid = listenerPid(rec.port) ?? rec.pid;
  if (!pid || !pidAlive(pid)) {
    clearServer();
    out.print(`Server ${rec.url} was already gone; cleared the record.`);
    return;
  }

  // Don't yank the server out from under work in flight. Killing it mid-task loses that task's
  // output: the session survives on disk but the assistant message it was producing does not.
  if (!flags.force) {
    const client = clientFor(sdk, rec.url);
    const active = await activeSessions(client);
    if (active === null) {
      out.print(`Warning: could not check whether ${rec.url} is busy (it did not answer in time).`);
      out.print("Stopping anyway. Use `server` to inspect it first if that was unexpected.");
    } else if (active.length) {
      const titles = await titlesFor(client, active.map((a) => a.id));
      out.print(`Refusing to stop ${rec.url}: ${active.length} session(s) still working.`);
      out.print("");
      for (const a of active) {
        const t = titles.get(a.id);
        out.print(`  ${a.id}  [${a.state}]${t ? `  ${truncate(t, 48)}` : ""}`);
      }
      out.print("");
      out.print("Stopping now would lose the output those sessions are producing. Either:");
      out.print("  wait for them:   opencode-cc wait <id>");
      out.print("  cancel one:      opencode-cc cancel <id>");
      out.print("  stop regardless: opencode-cc stop --force");
      process.exit(1);
    }
  }

  const target = { ...rec, pid };
  killServer(target, false);
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if (!pidAlive(pid)) break;
  }
  if (pidAlive(pid)) {
    killServer(target, true); // escalate
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (!pidAlive(pid)) break;
    }
  }

  if (pidAlive(pid)) {
    out.print(`Could not stop the server at ${rec.url} (pid ${pid}) — it is still running.`);
    out.print("Keeping the record so it stays visible to `opencode-cc server`.");
    process.exit(1);
  }

  // Only now is it safe to forget it.
  clearServer();
  out.print(`Stopped server ${rec.url} (pid ${pid}).`);
  if (sdk) {
    const still = listenerPid(rec.port);
    if (still) out.print(`Note: port ${rec.port} is still in use by pid ${still} (a different process).`);
  }
}

// Everything the user asked to be able to see: port, pid, is the pid alive, does it answer.
async function cmdServer(sdk) {
  const { flags } = parseFlags(rest);
  const rec = readServer();
  const lock = readLock();
  const { port: wantPort, url: wantUrl } = targetOf(flags);

  // An explicit --url/OPENCODE_URL is what every other command talks to, so report on THAT server,
  // not on the managed target. Otherwise `server` describes a different process than `run` uses.
  const explicitUrl = flags.url || process.env.OPENCODE_URL;
  const url = explicitUrl || rec?.url || wantUrl;
  let port = rec?.port ?? wantPort;
  if (explicitUrl) {
    try {
      const u = new URL(explicitUrl);
      port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
    } catch {
      /* keep the fallback */
    }
  }
  // Only trust a port-derived pid for a server on this machine; for a remote url it would name an
  // unrelated local process that happens to hold the same port number.
  const local = !explicitUrl || /^(127\.|localhost$|\[?::1\]?$|0\.0\.0\.0$)/.test(new URL(url).hostname);
  const pid = local ? listenerPid(port) ?? (explicitUrl ? null : rec?.pid ?? null) : null;
  const alive = pidAlive(pid);
  const client = clientFor(sdk, url);
  const responding = await healthOk(client);
  const busy = responding ? await activeSessions(client) : null;
  const uptime =
    rec?.startedAt && responding ? Math.round((Date.now() - rec.startedAt) / 1000) : null;

  if (flags.json) {
    out.emit({
      state: responding ? "running" : rec ? "recorded-but-not-responding" : "stopped",
      url,
      port,
      pid,
      pidAlive: alive,
      responding,
      managed: rec ? rec.managed !== false : null,
      recorded: Boolean(rec),
      uptimeSeconds: uptime,
      busySessions: busy,
      stateFile: SERVER_FILE,
      lock: lock ? { pid: lock.pid, holderAlive: pidAlive(lock.pid), stale: lockIsStale(lock) } : null,
    });
    return;
  }

  out.print(responding ? "opencode server: RUNNING" : rec ? "opencode server: NOT RESPONDING" : "opencode server: stopped");
  out.print(`  url:        ${url}`);
  out.print(`  port:       ${port}`);
  out.print(`  pid:        ${pid ?? "-"}${pid ? (alive ? " (alive)" : " (DEAD)") : ""}`);
  out.print(`  responding: ${responding ? "yes" : "no"}`);
  if (explicitUrl) out.print(`  ownership:  external — --url/OPENCODE_URL; this CLI neither starts nor records it`);
  else if (rec) out.print(`  ownership:  ${rec.managed === false ? "adopted (started outside this CLI)" : "started by this CLI"}`);
  if (uptime !== null) out.print(`  uptime:     ${uptime}s`);
  if (busy?.length) {
    out.print(`  busy:       ${busy.length} session(s) working — 'stop' will refuse without --force`);
    for (const b of busy) out.print(`                ${b.id} [${b.state}]`);
  } else if (responding) {
    out.print("  busy:       no active sessions");
  }
  out.print(`  record:     ${rec ? SERVER_FILE : "none — no server recorded"}`);
  if (lock) {
    out.print(
      `  lock:       held by pid ${lock.pid} (${pidAlive(lock.pid) ? "alive" : "dead"}${lockIsStale(lock) ? ", stale" : ""})`
    );
  }
  if (!responding && explicitUrl) {
    out.print("");
    out.print("Nothing answers at that url. This CLI will not start one while --url/OPENCODE_URL is set.");
  } else if (!responding && rec) {
    out.print("");
    out.print("The record points at a server that does not answer. Clear it with: opencode-cc stop");
  } else if (!rec && !responding) {
    out.print("");
    out.print("A server starts automatically on the next command, or explicitly with: opencode-cc serve");
  }
}

async function cmdStatus(sdk) {
  const { flags, positional } = parseFlags(rest);
  const { client } = await ensureServer(flags, sdk);
  const id = positional[0];
  if (id) return printOne(client, id, flags);
  return printAll(client, flags);
}

async function cmdList(sdk) {
  const { flags } = parseFlags(rest);
  const { client } = await ensureServer(flags, sdk);
  await printAll(client, flags);
}

async function cmdWait(sdk) {
  const { flags, positional } = parseFlags(rest);
  const id = positional[0];
  if (!id) {
    out.print("Usage: opencode-cc wait <id>");
    process.exit(1);
  }
  const { client } = await ensureServer(flags, sdk);
  const start = Date.now();
  const limit = (flags.timeout ? flags.timeout : 1800) * 1000;
  let dots = 0;
  while (true) {
    const messages = await fetchMessages(client, id);
    const { state, message } = classify(messages);
    if (state === "done" || state === "error") {
      if (state === "error") {
        out.print("Task ended with an error.");
        out.print(message?.info?.error?.message || extractText(message) || "(no details)");
        process.exit(1);
      }
      if (flags.json) {
        out.emit({ id, status: "done", output: extractText(message) });
      } else {
        printResult(message, flags);
      }
      return;
    }
    if (Date.now() - start > limit) {
      out.print(`Timed out waiting for ${id} (still ${state}).`);
      process.exit(1);
    }
    if (!flags.json) {
      process.stderr.write("." + (dots++ % 10 === 9 ? "\n" : ""));
    }
    await sleep(2000);
  }
}

async function cmdResult(sdk) {
  const { flags, positional } = parseFlags(rest);
  const id = positional[0];
  if (!id) {
    out.print("Usage: opencode-cc result <id>");
    process.exit(1);
  }
  const { client } = await ensureServer(flags, sdk);
  const messages = await fetchMessages(client, id);
  const asst = lastAssistant(messages);
  if (!asst) {
    out.print(`No assistant output yet for ${id}. Is it still running? Try: opencode-cc status ${id}`);
    process.exit(1);
  }
  printResult(asst, flags);
}

async function cmdSummary(sdk) {
  const { flags, positional } = parseFlags(rest);
  const id = positional[0];
  if (!id) {
    out.print("Usage: opencode-cc summary <id>");
    process.exit(1);
  }
  const { client } = await ensureServer(flags, sdk);
  // blocking follow-up turn in the same session — the user asked for the summary now, so waiting is expected
  const body = buildBody(
    {},
    "Summarize the work done in this session in 3-5 concise bullets. Focus on outcome and any files changed. Reply with bullets only."
  );
  out.print(`Generating summary for ${id} …`);
  const r = await client.session.prompt({ path: { id }, body });
  const msg = dataOf(r);
  const text = extractText(msg);
  if (flags.json) out.emit({ id, summary: text });
  else out.print(text || "(empty summary)");
}

async function cmdCancel(sdk) {
  const { flags, positional } = parseFlags(rest);
  const id = positional[0];
  if (!id) {
    out.print("Usage: opencode-cc cancel <id>");
    process.exit(1);
  }
  const { client } = await ensureServer(flags, sdk);
  try {
    await client.session.abort({ path: { id } });
    out.print(`Cancelled ${id}.`);
  } catch {
    out.print(`Could not cancel ${id} (it may have already finished).`);
  }
}

async function cmdHelp() {
  out.print(`opencode-cc — one CLI for the opencode-agent-cc plugin

Commands:
  doctor                    Environment report: opencode binary + version, configured default and
                            small model, providers (baseURL only), available models, MCP servers,
                            the managed server, and live opencode processes. Never prints secrets.
                            Works WITHOUT the SDK — reach for it first when something is broken.
    --pretty                Human-readable text instead of JSON.
  run "<prompt>"            Submit a task asynchronously (returns a session id).
    --wait / -w             Run in the foreground; print output when done.
    --model provider/model  Override the configured default model.
    --title <t>             Name the task.
    --file <path> / -f      Attach a file (added as context). Repeatable.
    --dir <path> / -d       Working directory for this task's session (default: cwd).
  status [id]               Show one task's state, or all recent/running tasks.
  list                      Same as 'status' with no id.
  wait <id>                 Block until <id> finishes, then print its output.
    --timeout <sec>         Give up after N seconds (default 1800).
  result <id>               Print the full output of a finished task.
    --raw                   Print only the text (no header), for piping.
    --verbose               Include the model's reasoning.
  summary <id>              Generate a concise bullet summary of a task.
  cancel <id>               Abort a running task.
  serve [--port P]          Start (or reuse) the background server.
  server                    Show the server: url, port, pid, whether the pid is alive, whether
                            it responds, uptime, ownership, busy sessions and lock state.
                            --json for machine use.
  stop                      Stop the server, confirming it actually died before forgetting it.
                            Refuses while any session is still working, listing them.
    --force                 Stop anyway — kills the process even mid-task (last resort; the
                            output those sessions were producing is lost).

Server (exactly one, ever):
  The CLI auto-starts a background 'opencode serve' (default port ${DEFAULT_PORT}) and reuses it across
  calls. Concurrent invocations cannot each start their own: whoever wins an atomic lock starts
  the server and the rest wait for it. If something healthy is already listening on the port it is
  adopted rather than duplicated, and the port is never auto-incremented — so a machine cannot
  accumulate stray servers. Inspect with 'server', shut down with 'stop'.

  State (generated, declarative):
    ${SERVER_FILE}
    ${LOCK_FILE}   (only while a server is being started)

  To use a server you already run, pass --url <url> or set OPENCODE_URL — that path never spawns
  or records anything. Override the managed port with --port / OPENCODE_PORT.

Global flags: --json (machine-readable output). Requires: npm i -g @opencode-ai/sdk`);
}

// --- doctor: environment report (no SDK, no server) -------------------------
// Answers "is opencode set up, and what will it run?" straight from the CLI, so it works when the
// SDK is missing or no server is up. Everything here is read-only.
//
// SECRET SAFETY: `opencode debug config` contains plaintext API keys (provider.*.options.apiKey)
// and MCP auth (mcp.*.headers.Authorization / .environment / credentials in .url). This NEVER emits
// those — output is built field-by-field from an allowlist; raw config subtrees are never
// serialized. Verify with:  opencode-cc doctor | grep -iE 'apikey|authorization|bearer'
function sh(cmd, cmdArgs, timeout = 8000) {
  try {
    return execFileSync(cmd, cmdArgs, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
      ...(IS_WINDOWS ? { shell: true } : {}),
    }).trim();
  } catch {
    return null;
  }
}

const safeHost = (u) => {
  try {
    return new URL(u).host || null;
  } catch {
    return null;
  }
};
const baseName = (p) => p.split(/[\\/]/).pop() || p;

// Live `opencode` processes. POSIX gets the full command line from ps; Windows has no equivalent in
// tasklist, so it reports image name + pid only. Both branches matter: `ps` and `which` do not
// exist on Windows, so a POSIX-only implementation reports nothing there at all.
function runningOpencode() {
  if (IS_WINDOWS) {
    const raw = sh("tasklist", ["/FI", "IMAGENAME eq opencode.exe", "/FO", "CSV", "/NH"]);
    if (!raw) return null;
    const found = [];
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m) found.push({ pid: Number(m[2]), etime: null, cmd: m[1] });
    }
    return found;
  }
  const raw = sh("ps", ["-eo", "pid,etime,command"]);
  if (!raw) return null;
  const found = [];
  const self = String(process.pid);
  for (const line of raw.split("\n").slice(1)) {
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pid, etime, cmd] = m;
    if (pid === self || cmd.includes("opencode-cc.mjs") || /\bgrep\b/.test(cmd)) continue;
    if (!(/(^|\/)opencode\b/.test(cmd) && /\bopencode\b.*\b(run|serve)\b/.test(cmd))) continue;
    found.push({ pid: Number(pid), etime, cmd: cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd });
  }
  return found;
}

function collectDoctor() {
  const binary = sh(IS_WINDOWS ? "where" : "which", ["opencode"])?.split(/\r?\n/)[0] || null;
  const version = sh("opencode", ["--version"]);
  if (!binary && version === null) {
    return {
      ok: false,
      installed: false,
      error: "opencode CLI not found on PATH",
      hint: "Install it (e.g. npm install -g opencode-ai) and configure a provider; this plugin assumes opencode is already set up.",
    };
  }

  const warnings = [];
  const paths = {};
  const rawPaths = sh("opencode", ["debug", "paths"]);
  if (rawPaths) {
    for (const line of rawPaths.split(/\r?\n/)) {
      const m = line.match(/^(\S+)\s+(.+?)\s*$/);
      if (m) paths[m[1]] = m[2];
    }
  } else warnings.push("could not read `opencode debug paths`");

  let defaultModel = null;
  let smallModel = null;
  const providers = [];
  const mcpServers = [];
  let configParseError = null;
  const rawCfg = sh("opencode", ["debug", "config"]);
  if (rawCfg) {
    let cfg = null;
    try {
      cfg = JSON.parse(rawCfg);
    } catch (e) {
      configParseError = String(e?.message ?? e);
    }
    if (cfg && typeof cfg === "object") {
      defaultModel = typeof cfg.model === "string" ? cfg.model : null;
      smallModel = typeof cfg.small_model === "string" ? cfg.small_model : null;
      for (const [id, v] of Object.entries(cfg.provider ?? {})) {
        const opts = v && typeof v === "object" ? v.options : null;
        providers.push({
          id,
          npm: typeof v?.npm === "string" ? v.npm : null,
          // baseURL is safe; apiKey (its sibling) is deliberately never read.
          baseURL: typeof opts?.baseURL === "string" ? opts.baseURL : null,
        });
      }
      for (const [name, v] of Object.entries(cfg.mcp ?? {})) {
        const entry = { name, type: typeof v?.type === "string" ? v.type : null };
        if (typeof v?.url === "string") entry.host = safeHost(v.url); // hostname only
        if (v?.headers && typeof v.headers === "object") entry.hasAuthHeaders = true; // boolean only
        if (v?.environment && typeof v.environment === "object") entry.hasEnv = true;
        if (Array.isArray(v?.command) && v.command.length) entry.command = baseName(String(v.command[0]));
        mcpServers.push(entry);
      }
    }
  } else warnings.push("could not read `opencode debug config`");

  const rawModels = sh("opencode", ["models"]);
  const models = rawModels ? rawModels.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  if (defaultModel && models.length && !models.includes(defaultModel)) {
    warnings.push(
      `configured model "${defaultModel}" is not in \`opencode models\` — tasks on it produce no output ` +
        "(an unresolvable model is not reported as an error)"
    );
  }

  // The managed server, from the same state this CLI uses everywhere else.
  const rec = readServer();
  const managed = rec
    ? {
        url: rec.url,
        port: rec.port,
        pid: listenerPid(rec.port) ?? rec.pid,
        pidAlive: pidAlive(listenerPid(rec.port) ?? rec.pid),
        ownedByCli: rec.managed !== false,
      }
    : null;

  return {
    ok: true,
    installed: true,
    platform: process.platform,
    binary,
    version,
    paths,
    defaultModel,
    smallModel,
    providers,
    models,
    mcpServers,
    mcpWarning:
      "OpenCode auto-loads these MCP servers on every run and may defer to one instead of answering. " +
      "For pure-analysis runs, instruct it to answer directly and not call tools; always wrap runs in `timeout`.",
    managedServer: managed,
    running: runningOpencode(),
    stateDir: DATA_DIR,
    warnings,
    configParseError,
  };
}

async function cmdDoctor() {
  const { flags } = parseFlags(rest);
  const d = collectDoctor();
  // Default to JSON (this is a machine-read report); --pretty for humans.
  if (!flags.pretty) {
    out.emit(d);
    return;
  }
  if (!d.installed) {
    out.print("OpenCode: NOT installed / not on PATH.");
    if (d.hint) out.print("  " + d.hint);
    return;
  }
  out.print(`OpenCode ${d.version || "?"}  (${d.binary || "?"})  [${d.platform}]`);
  out.print(`Default model: ${d.defaultModel || "(none configured)"}`);
  if (d.smallModel) out.print(`Small model:   ${d.smallModel}`);
  if (d.providers.length) out.print("Providers:     " + d.providers.map((p) => p.id).join(", "));
  if (d.models.length) out.print(`Models:        ${d.models.length} available`);
  if (d.mcpServers.length) out.print("MCP servers:   " + d.mcpServers.map((m) => m.name).join(", "));
  if (d.managedServer) {
    const m = d.managedServer;
    out.print(`Managed server: ${m.url} (pid ${m.pid ?? "-"}${m.pidAlive ? ", alive" : ", DEAD"})`);
  } else {
    out.print("Managed server: none recorded");
  }
  if (d.running) {
    out.print(`Running opencode processes: ${d.running.length}`);
    for (const r of d.running) out.print(`  [${r.pid}]${r.etime ? " " + r.etime : ""}  ${r.cmd}`);
  } else {
    out.print("Running opencode processes: (could not enumerate)");
  }
  out.print(`State dir:     ${d.stateDir}`);
  if (d.warnings.length) for (const w of d.warnings) out.print(`Warning: ${w}`);
}

// --- printing --------------------------------------------------------------
function badge(state) {
  return (
    state === "running" ? "RUNNING" :
    state === "done" ? "done" :
    state === "error" ? "ERROR" :
    "empty"
  );
}

function fmtTokens(t) {
  if (!t) return "";
  const out = t.output ? `${t.output} out` : "";
  const inp = t.input ? `${t.input} in` : "";
  return [inp, out].filter(Boolean).join(", ") || "";
}

async function printOne(client, id, flags) {
  const [sess, messages] = await Promise.all([
    client.session.get({ path: { id } }).then(dataOf).catch(() => null),
    fetchMessages(client, id),
  ]);
  const { state, message } = classify(messages);
  if (flags.json) {
    out.emit({
      id,
      title: sess?.title || null,
      state,
      model: message?.info?.modelID ? `${message.info.providerID}/${message.info.modelID}` : null,
      tokens: message?.info?.tokens || null,
      cost: message?.info?.cost ?? null,
      finish: message?.info?.finish || null,
      preview: state === "done" || state === "error" ? extractText(message).slice(0, 300) : null,
    });
    return;
  }
  out.print(`${id}  [${badge(state)}]`);
  if (sess?.title) out.print(`  title: ${sess.title}`);
  if (message?.info?.modelID)
    out.print(`  model: ${message.info.providerID}/${message.info.modelID}`);
  if (message?.info?.tokens) out.print(`  tokens: ${fmtTokens(message.info.tokens)}`);
  if (state === "done") {
    const text = extractText(message);
    out.print("  result:");
    out.print(indent(text.slice(0, 500) + (text.length > 500 ? "\n  …" : ""), "    "));
    out.print(`\n  full output: opencode-cc result ${id}`);
  } else if (state === "error") {
    out.print(`  error: ${message?.info?.error?.message || "(see result)"}`);
  } else if (state === "running") {
    out.print("  still processing — try: opencode-cc wait " + id);
  } else {
    out.print("  (no messages yet)");
  }
}

async function printAll(client, flags) {
  const list = dataOf(await client.session.list()) || [];
  // newest first; show running first when not --all
  const order = [...list].sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));
  const rows = [];
  for (const s of order) {
    const messages = await fetchMessages(client, s.id);
    const { state, message } = classify(messages);
    if (!flags.all && state === "empty") continue;
    rows.push({ id: s.id, state, title: s.title || "", model: message?.info?.modelID || "", tokens: fmtTokens(message?.info?.tokens) });
  }
  if (flags.json) {
    out.emit(rows);
    return;
  }
  if (!rows.length) {
    out.print("No tasks yet. Submit one with: opencode-cc run \"<prompt>\"");
    return;
  }
  out.print("ID".padEnd(34) + "STATE".padEnd(10) + "MODEL".padEnd(18) + "TOKENS".padEnd(16) + "TITLE");
  for (const r of rows) {
    out.print(
      r.id.padEnd(34) +
        badge(r.state).padEnd(10) +
        (r.model || "-").padEnd(18) +
        (r.tokens || "-").padEnd(16) +
        truncate(r.title, 40)
    );
  }
  out.print(`\n${rows.length} task(s). Detail: opencode-cc status <id>`);
}

function printResult(message, flags) {
  if (!message) {
    out.print("(no output)");
    return;
  }
  if (flags.json) {
    out.emit({
      text: extractText(message),
      reasoning: flags.verbose ? extractReasoning(message) : undefined,
      model: message.info?.modelID ? `${message.info.providerID}/${message.info.modelID}` : null,
      tokens: message.info?.tokens || null,
      finish: message.info?.finish || null,
    });
    return;
  }
  if (flags.verbose) {
    const reasoning = extractReasoning(message);
    if (reasoning) {
      out.print("--- reasoning ---");
      out.print(reasoning);
      out.print("--- result ---");
    }
  }
  const text = extractText(message);
  if (flags.raw) {
    process.stdout.write((text || "") + (text.endsWith("\n") ? "" : "\n"));
  } else {
    out.print(text || "(no text output)");
  }
}

// --- utils -----------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function indent(s, pad) {
  return s
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}
function truncate(s, n) {
  s = (s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// --- main ------------------------------------------------------------------
async function main() {
  // The SDK is loaded LAZILY. `doctor` is the tool you reach for when something is broken —
  // including a missing SDK — so it must never be gated behind loading it.
  if (command === "help" || command === "--help" || command === "-h") return cmdHelp();
  if (command === "doctor") return cmdDoctor();

  const sdk = await loadSDK();
  switch (command) {
    case "stop": return cmdStop(sdk);
    case "server": return cmdServer(sdk);
    case "run": return cmdRun(sdk);
    case "status": return cmdStatus(sdk);
    case "list": return cmdList(sdk);
    case "wait": return cmdWait(sdk);
    case "result": return cmdResult(sdk);
    case "summary": return cmdSummary(sdk);
    case "cancel": return cmdCancel(sdk);
    case "serve": return cmdServe(sdk);
    default:
      out.print(`Unknown command: ${command}`);
      return cmdHelp();
  }
}

main().catch((e) => {
  out.print("Error: " + (e?.message || e));
  process.exit(1);
});
