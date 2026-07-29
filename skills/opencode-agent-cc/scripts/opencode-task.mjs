#!/usr/bin/env node
// opencode-task.mjs — a tiny async task CLI built on the OpenCode SDK + a headless server.
//
// Delegate work to OpenCode, check whether a task is still processing, and read its result or a
// generated summary — all from the command line. Designed for "submit a task, come back later".
//
// It talks to a running `opencode serve` instance (auto-started and reused across calls). Every
// task is just an OpenCode *session* on that server; "status" reads the live session, so there is
// no flaky local state to go stale.
//
//   opencode-task run "Refactor src/auth.ts into smaller modules"
//   opencode-task status            # one task, or all running
//   opencode-task wait  <id>        # block until a task finishes, then print its output
//   opencode-task result <id>       # full assistant output of a finished task
//   opencode-task summary <id>      # generate a concise summary of a task's outcome
//   opencode-task list              # recent tasks
//   opencode-task cancel <id>       # abort a running task
//   opencode-task serve [--port P]  # start/reuse the background server explicitly
//   opencode-task stop              # stop the server this CLI started
//
// REQUIRES the OpenCode SDK: `npm install -g @opencode-ai/sdk` (resolved automatically). The
// `opencode` CLI must be installed and a provider authenticated. Model: defaults to the user's
// configured model; override per-task with `--model provider/model`.
//
// Usage: `node opencode-task.mjs <command> [options]`  (or chmod +x and call directly).

import { spawn, execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
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
const DATA_DIR =
  process.env.OPENCODE_TASKS_DIR ||
  join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode-agent-cc");
// fallback to a sane home dir if XDG resolved oddly
const SERVER_FILE = join(DATA_DIR, "server.json");
const DEFAULT_PORT = Number(process.env.OPENCODE_PORT) || 4198;
const DEFAULT_HOST = process.env.OPENCODE_HOST || "127.0.0.1";

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
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
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

async function healthOk(client) {
  try {
    const r = await client.session.list();
    return Array.isArray(r?.data ?? r);
  } catch {
    return false;
  }
}

// Resolve which URL to use. Returns { url, ours, client }.
async function resolveServer(flags, sdk) {
  const explicitUrl = flags?.url || process.env.OPENCODE_URL;
  if (explicitUrl) {
    const client = sdk.createOpencodeClient({ baseUrl: explicitUrl, throwOnError: false });
    if (await healthOk(client)) return { url: explicitUrl, ours: false, client };
    return { url: explicitUrl, ours: false, client, unreachable: true };
  }
  // reuse a server we started before
  const rec = readServer();
  if (rec) {
    const client = sdk.createOpencodeClient({ baseUrl: rec.url, throwOnError: false });
    if (await healthOk(client)) return { url: rec.url, ours: true, client, pid: rec.pid };
    clearServer(); // stale record
  }
  return null;
}

// Start a background `opencode serve` and remember it. Returns { url, client, pid }.
async function startServer(flags, sdk) {
  mkdirSync(DATA_DIR, { recursive: true });
  const host = flags?.host || DEFAULT_HOST;
  const basePort = flags?.port || DEFAULT_PORT;
  // try the requested port, then a few above it in case it's taken
  const tryStart = (p) =>
    new Promise((resolve) => {
      const child = spawn(
        "opencode",
        ["serve", "--hostname", host, "--port", String(p)],
        { detached: true, stdio: ["ignore", "ignore", "ignore"] }
      );
      child.unref();
      const pid = child.pid;
      const url = `http://${host}:${p}`;
      // poll health up to ~25s
      let tries = 0;
      const iv = setInterval(async () => {
        tries++;
        const client = sdk.createOpencodeClient({ baseUrl: url, throwOnError: false });
        if (await healthOk(client)) {
          clearInterval(iv);
          writeServer({ pid, url, port: p, host, startedAt: Date.now() });
          resolve({ url, client, pid });
        } else if (tries > 25) {
          clearInterval(iv);
          resolve({ url, client, pid, failed: true });
        }
      }, 1000);
    });

  for (let p = basePort; p < basePort + 10; p++) {
    const r = await tryStart(p);
    if (!r.failed) return r;
  }
  out.print("Could not start an opencode server. Run it manually and pass --url:\n  opencode serve --port 4096\n  node opencode-task.mjs run --url http://127.0.0.1:4096 \"...\"");
  process.exit(1);
}

async function ensureServer(flags, sdk) {
  const existing = await resolveServer(flags, sdk);
  if (existing && !existing.unreachable) return existing;
  return startServer(flags, sdk);
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
    out.print("Usage: opencode-task run \"<prompt>\"   (or pipe via stdin, add -f <file>)");
    process.exit(1);
  }

  const { url, client } = await ensureServer(flags, sdk);

  await assertModelAvailable(client, flags);

  const created = await client.session.create({
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
  out.print(`  status:  opencode-task status ${id}`);
  out.print(`  wait:    opencode-task wait ${id}`);
  out.print(`  result:  opencode-task result ${id}`);
}

// internal: keep a foreground server alive (used by `serve` when not already running)
async function cmdServe(sdk) {
  const { flags } = parseFlags(rest);
  const existing = await resolveServer(flags, sdk);
  if (existing && !existing.unreachable) {
    out.print(`Server already running at ${existing.url}${existing.ours ? " (managed by this CLI)" : ""}`);
    return;
  }
  const { url, pid } = await startServer(flags, sdk);
  out.print(`Started opencode server at ${url} (pid ${pid}). Stop with: opencode-task stop`);
}

async function cmdStop() {
  const rec = readServer();
  if (!rec) {
    out.print("No server managed by this CLI to stop.");
    return;
  }
  if (pidAlive(rec.pid)) {
    try {
      process.kill(rec.pid);
    } catch {}
  }
  clearServer();
  out.print(`Stopped server ${rec.url} (pid ${rec.pid}).`);
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
    out.print("Usage: opencode-task wait <id>");
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
    out.print("Usage: opencode-task result <id>");
    process.exit(1);
  }
  const { client } = await ensureServer(flags, sdk);
  const messages = await fetchMessages(client, id);
  const asst = lastAssistant(messages);
  if (!asst) {
    out.print(`No assistant output yet for ${id}. Is it still running? Try: opencode-task status ${id}`);
    process.exit(1);
  }
  printResult(asst, flags);
}

async function cmdSummary(sdk) {
  const { flags, positional } = parseFlags(rest);
  const id = positional[0];
  if (!id) {
    out.print("Usage: opencode-task summary <id>");
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
    out.print("Usage: opencode-task cancel <id>");
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
  out.print(`opencode-task — delegate tasks to OpenCode and check them later

Commands:
  run "<prompt>"            Submit a task asynchronously (returns a session id).
    --wait / -w             Run in the foreground; print output when done.
    --model provider/model  Override the configured default model.
    --title <t>             Name the task.
    --file <path> / -f      Attach a file (added as context). Repeatable.
    --dir <path> / -d       Working directory for the server.
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
  stop                      Stop the server this CLI started.

Server:
  The CLI auto-starts a background 'opencode serve' (default port ${DEFAULT_PORT}) and reuses it
  across calls. To use a server you already run, pass --url <url> or set OPENCODE_URL.

Global flags: --json (machine-readable output). Requires: npm i -g @opencode-ai/sdk`);
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
    out.print(`\n  full output: opencode-task result ${id}`);
  } else if (state === "error") {
    out.print(`  error: ${message?.info?.error?.message || "(see result)"}`);
  } else if (state === "running") {
    out.print("  still processing — try: opencode-task wait " + id);
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
    out.print("No tasks yet. Submit one with: opencode-task run \"<prompt>\"");
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
  out.print(`\n${rows.length} task(s). Detail: opencode-task status <id>`);
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
  if (command === "stop") return cmdStop();
  if (command === "help" || command === "--help" || command === "-h") return cmdHelp();
  const sdk = await loadSDK();
  switch (command) {
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
