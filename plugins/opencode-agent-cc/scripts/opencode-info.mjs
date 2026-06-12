#!/usr/bin/env node
// opencode-info.mjs — secret-safe environment report for the opencode-agent-cc plugin.
//
// Prints a JSON summary of the local OpenCode CLI: binary path, version, paths, the user's
// configured default model/provider, configured providers (baseURL only), available models,
// MCP servers (names/booleans only), and — with --running — live `opencode` processes.
//
// SECRET SAFETY: `opencode debug config` contains plaintext API keys (provider.*.options.apiKey)
// and MCP auth (mcp.*.headers.Authorization / .environment / credentials in .url). This script
// NEVER emits those. Output is built field-by-field from an allowlist; raw config subtrees are
// never serialized. Verify with: node opencode-info.mjs | grep -iE 'apikey|authorization|bearer'
//
// Read-only. No dependencies. Usage:
//   node opencode-info.mjs            # JSON env report
//   node opencode-info.mjs --running  # + list running opencode processes
//   node opencode-info.mjs --pretty   # human-readable text instead of JSON

import { execFileSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const WANT_RUNNING = args.has("--running");
const PRETTY = args.has("--pretty");

function run(cmd, cmdArgs, timeout = 8000) {
  // execFile (no shell) — avoids shell quoting/injection. Returns trimmed stdout or null.
  try {
    return execFileSync(cmd, cmdArgs, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// --- locate opencode -------------------------------------------------------
const binary = run("which", ["opencode"]) || null;
const version = run("opencode", ["--version"]);

if (!binary && version === null) {
  emit({
    ok: false,
    installed: false,
    error: "opencode CLI not found on PATH",
    hint: "Install it (e.g. npm install -g opencode-ai) and configure a provider; this plugin assumes opencode is already set up.",
  });
  process.exit(0);
}

const warnings = [];

// --- paths (columnar text: `key   value`) ----------------------------------
let paths = {};
{
  const raw = run("opencode", ["debug", "paths"]);
  if (raw) {
    for (const line of raw.split("\n")) {
      const m = line.match(/^(\S+)\s+(.+?)\s*$/);
      if (m) paths[m[1]] = m[2];
    }
  } else {
    warnings.push("could not read `opencode debug paths`");
  }
}

// --- resolved config (JSON; contains secrets — extract allowlist only) ------
let defaultModel = null;
let smallModel = null;
let providers = [];
let mcpServers = [];
let configParseError = null;
{
  const raw = run("opencode", ["debug", "config"]);
  if (raw) {
    let cfg = null;
    try {
      cfg = JSON.parse(raw);
    } catch (e) {
      configParseError = String(e && e.message ? e.message : e);
    }
    if (cfg && typeof cfg === "object") {
      defaultModel = typeof cfg.model === "string" ? cfg.model : null;
      smallModel = typeof cfg.small_model === "string" ? cfg.small_model : null;

      const prov = cfg.provider && typeof cfg.provider === "object" ? cfg.provider : {};
      for (const [id, v] of Object.entries(prov)) {
        const opts = v && typeof v === "object" ? v.options : null;
        providers.push({
          id,
          npm: v && typeof v.npm === "string" ? v.npm : null,
          // baseURL is safe; apiKey (sibling) is deliberately NOT read.
          baseURL: opts && typeof opts.baseURL === "string" ? opts.baseURL : null,
        });
      }

      const mcp = cfg.mcp && typeof cfg.mcp === "object" ? cfg.mcp : {};
      for (const [name, v] of Object.entries(mcp)) {
        const entry = { name, type: v && typeof v.type === "string" ? v.type : null };
        if (v && typeof v.url === "string") {
          entry.host = safeHost(v.url); // hostname only — drops userinfo/path/query
        }
        if (v && v.headers && typeof v.headers === "object") {
          entry.hasAuthHeaders = true; // booleans only — never the header values
        }
        if (v && v.environment && typeof v.environment === "object") {
          entry.hasEnv = true;
        }
        if (v && Array.isArray(v.command) && v.command.length) {
          entry.command = basename(String(v.command[0])); // binary basename only, no args
        }
        mcpServers.push(entry);
      }
    }
  } else {
    warnings.push("could not read `opencode debug config`");
  }
}

// --- available models (one provider/model per line) -------------------------
let models = [];
{
  const raw = run("opencode", ["models"]);
  if (raw) models = raw.split("\n").map((l) => l.trim()).filter(Boolean);
}

// --- running opencode processes (opt-in) ------------------------------------
let running = null;
if (WANT_RUNNING) {
  running = [];
  const raw = run("ps", ["-eo", "pid,etime,command"]);
  if (raw) {
    const selfPid = String(process.pid);
    for (const line of raw.split("\n").slice(1)) {
      const m = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)$/);
      if (!m) continue;
      const [, pid, etime, cmd] = m;
      if (pid === selfPid) continue;
      if (cmd.includes("opencode-info.mjs")) continue; // this script
      if (/\bgrep\b/.test(cmd)) continue;
      // Match a real opencode invocation: `opencode run|serve` or argv0 ending in /opencode.
      const isOpencode =
        /(^|\/)opencode\b/.test(cmd) && /\bopencode\b.*\b(run|serve)\b/.test(cmd);
      if (!isOpencode) continue;
      running.push({ pid: Number(pid), etime, cmd: cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd });
    }
  }
}

emit({
  ok: true,
  installed: true,
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
  running,
  warnings,
  configParseError,
});

// --- helpers ---------------------------------------------------------------
function safeHost(u) {
  try {
    return new URL(u).host || null;
  } catch {
    return null;
  }
}

function basename(p) {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function emit(obj) {
  if (!PRETTY) {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
    return;
  }
  const lines = [];
  if (!obj.installed) {
    lines.push("OpenCode: NOT installed/found on PATH.");
    if (obj.hint) lines.push("  " + obj.hint);
  } else {
    lines.push(`OpenCode ${obj.version || "?"}  (${obj.binary || "?"})`);
    lines.push(`Default model: ${obj.defaultModel || "(none configured)"}`);
    if (obj.smallModel) lines.push(`Small model:   ${obj.smallModel}`);
    if (obj.providers?.length)
      lines.push("Providers: " + obj.providers.map((p) => p.id).join(", "));
    if (obj.mcpServers?.length)
      lines.push("MCP servers: " + obj.mcpServers.map((m) => m.name).join(", "));
    if (obj.running) {
      lines.push(`Running opencode processes: ${obj.running.length}`);
      for (const r of obj.running) lines.push(`  [${r.pid}] ${r.etime}  ${r.cmd}`);
    }
    if (obj.warnings?.length) lines.push("Warnings: " + obj.warnings.join("; "));
  }
  process.stdout.write(lines.join("\n") + "\n");
}
