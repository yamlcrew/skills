#!/usr/bin/env node
// pi-info.mjs — secret-safe environment report for the pi-agent-cc plugin.
//
// Prints a JSON summary of the local pi CLI: binary path, version, the user's configured default
// provider/model/thinking level, configured packages/extensions/skills, enabled model patterns,
// available models, and — with --running — live headless `pi` processes.
//
// SECRET SAFETY: pi's settings.json (~/.pi/agent/settings.json and .pi/settings.json) holds CONFIG
// ONLY — it does NOT store API keys (those live in environment variables and pi's separate auth
// storage, which this script NEVER reads). Even so, output is built field-by-field from an allowlist
// of known settings keys; the raw settings object is never serialized. API keys, auth tokens, and
// auth-file contents are never read or emitted. Verify with:
//   node pi-info.mjs | grep -iE 'apikey|api_key|token|authorization|bearer|secret|password'
//
// Read-only. No dependencies. Usage:
//   node pi-info.mjs            # JSON env report
//   node pi-info.mjs --running  # + list running headless pi processes
//   node pi-info.mjs --pretty   # human-readable text instead of JSON

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const WANT_RUNNING = args.has("--running");
const PRETTY = args.has("--pretty");

function run(cmd, cmdArgs, timeout = 8000) {
  // execFile (no shell) — avoids shell quoting/injection. Returns trimmed stdout or null.
  try {
    return execFileSync(cmd, cmdArgs, {
      encoding: "utf8",
      timeout,
      stdio: ["ignore", "pipe", "ignore"], // stderr discarded — keeps model list / warnings out
    }).trim();
  } catch {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// Allowlist of settings keys we report. Unknown keys (and any value a user might have put in there)
// are deliberately NOT serialized.
const SETTINGS_ALLOWLIST = [
  "defaultProvider",
  "defaultModel",
  "defaultThinkingLevel",
  "enabledModels",
  "packages",
  "extensions",
  "skills",
  "prompts",
  "defaultProjectTrust",
];

function pickSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const k of SETTINGS_ALLOWLIST) {
    if (k in raw) out[k] = raw[k];
  }
  return out;
}

// --- locate pi -------------------------------------------------------------
const binary = run("which", ["pi"]) || null;
const version = run("pi", ["--version"]);

if (!binary && version === null) {
  emit({
    ok: false,
    installed: false,
    error: "pi CLI not found on PATH",
    hint: "Install it (npm install -g @earendil-works/pi-coding-agent) and configure a provider; this plugin assumes pi is already set up.",
  });
  process.exit(0);
}

const warnings = [];

// --- settings (config only; no secrets) ------------------------------------
const globalSettingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
const projectSettingsPath = path.join(process.cwd(), ".pi", "settings.json");

const globalSettings = pickSettings(readJson(globalSettingsPath));
const projectSettings = pickSettings(readJson(projectSettingsPath));

if (!globalSettings) warnings.push(`could not read global settings at ${globalSettingsPath}`);

// --- available models (table: provider model context max-out thinking images) ---
let models = [];
{
  const raw = run("pi", ["--list-models"]);
  if (raw) {
    const lines = raw.split("\n").filter(Boolean);
    // First line is the header; subsequent lines are rows of whitespace-separated fields.
    for (const line of lines.slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        models.push({
          provider: parts[0],
          model: parts[1],
          context: parts[2] ?? null,
          maxOutput: parts[3] ?? null,
          thinking: parts[4] ?? null,
          images: parts[5] ?? null,
        });
      }
    }
  } else {
    warnings.push("could not read `pi --list-models`");
  }
}

// --- running headless pi processes (opt-in) --------------------------------
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
      if (cmd.includes("pi-info.mjs")) continue; // this script
      if (/\bgrep\b/.test(cmd)) continue;
      // Match a real headless pi invocation: argv0 ends in /pi AND it has a headless flag.
      const isPi = /(^|\/)pi\b/.test(cmd);
      const isHeadless = /(^|\s)-p(\s|$)/.test(cmd) || /(^|\s)--print(\s|$)/.test(cmd) ||
        /--mode(\s|=)(json|rpc)\b/.test(cmd);
      if (!isPi || !isHeadless) continue; // skip the interactive TUI and unrelated `pi` matches
      running.push({ pid: Number(pid), etime, cmd: cmd.length > 120 ? cmd.slice(0, 117) + "..." : cmd });
    }
  }
}

emit({
  ok: true,
  installed: true,
  binary,
  version,
  paths: {
    globalSettings: globalSettingsPath,
    projectSettings: projectSettingsPath,
    globalConfigDir: path.join(os.homedir(), ".pi", "agent"),
    projectConfigDir: path.join(process.cwd(), ".pi"),
  },
  globalSettings,
  projectSettings,
  defaultProvider: globalSettings?.defaultProvider ?? null,
  defaultModel: globalSettings?.defaultModel ?? null,
  defaultThinkingLevel: globalSettings?.defaultThinkingLevel ?? null,
  models,
  toolStallWarning: toolStallWarning(globalSettings?.packages),
  running,
  warnings,
});

// --- helpers ---------------------------------------------------------------
function toolStallWarning(pkgs) {
  const example = Array.isArray(pkgs) && pkgs.length
    ? pkgs.join(", ")
    : "context-mode, pi-mcp-extension";
  return (
    "pi auto-loads configured extensions, skills, prompt templates, and packages (currently: " +
    example + ") on every run. A consulted pi may defer to one of those tools instead of answering, " +
    "or loop on one. For pure-analysis runs, use a read-only tool allowlist " +
    "(`--tools read,grep,find,ls,bash`) or `--no-extensions --no-skills --no-prompt-templates`, and " +
    "always wrap runs in `timeout`."
  );
}

function emit(obj) {
  if (!PRETTY) {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
    return;
  }
  const lines = [];
  if (!obj.installed) {
    lines.push("pi: NOT installed/found on PATH.");
    if (obj.hint) lines.push("  " + obj.hint);
  } else {
    lines.push(`pi ${obj.version || "?"}  (${obj.binary || "?"})`);
    const prov = obj.defaultProvider || "(none)";
    const mdl = obj.defaultModel || "(none — falls back to built-in default)";
    lines.push(`Default: ${prov}/${mdl}` + (obj.defaultThinkingLevel ? `  (thinking: ${obj.defaultThinkingLevel})` : ""));
    const pkgs = obj.globalSettings?.packages;
    if (Array.isArray(pkgs) && pkgs.length) lines.push("Packages: " + pkgs.join(", "));
    if (obj.models?.length) lines.push(`Models available: ${obj.models.length} (see pi --list-models)`);
    if (obj.running) {
      lines.push(`Running headless pi processes: ${obj.running.length}`);
      for (const r of obj.running) lines.push(`  [${r.pid}] ${r.etime}  ${r.cmd}`);
      if (!obj.running.length) lines.push("  (none active)");
    }
    if (obj.warnings?.length) lines.push("Warnings: " + obj.warnings.join("; "));
  }
  process.stdout.write(lines.join("\n") + "\n");
}
