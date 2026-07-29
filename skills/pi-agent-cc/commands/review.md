---
description: Run a read-only pi review of local git changes
argument-hint: '[--wait|--background] [--base <ref>] [focus area]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(pi:*), Bash(git:*), Bash(timeout:*), AskUserQuestion
---

Delegate a **read-only** code review to the pi CLI. Do not fix anything yourself.

Arguments: `$ARGUMENTS`

## Steps

1. Parse the arguments:
   - `--wait` → run in the foreground. `--background` → run as a background task.
   - `--base <ref>` → review `<ref>...HEAD`; otherwise review the working tree (uncommitted changes).
   - Any remaining text is an optional **focus area** for the review.
2. **Model:** do not pass `--model`/`--provider`. `pi -p` uses the user's configured default
   (confirm with `grep -E '"(defaultProvider|defaultModel|defaultThinkingLevel)":' ~/.pi/agent/settings.json`
   if helpful).
3. Decide foreground vs background if the user did not specify: check change size with
   `git status --short --untracked-files=all` and `git diff --shortstat` (or
   `git diff --shortstat <base>...HEAD`). For a tiny change (≈1–2 files) recommend waiting; otherwise
   recommend background. Use `AskUserQuestion` once to confirm.
4. Run pi read-only. Restrict tools to a read-only surface (inspect + git, no edits, no
   extension/MCP tools). **Do not paste the diff into the argument** — tell pi to inspect the
   repository itself, and capture stdout only so stderr noise does not pollute the answer:

   ```
   timeout 600 pi -p --tools read,grep,find,ls,bash --no-approve "Read-only code review. Review the <SCOPE> in this repository: inspect it yourself with git and by reading the changed files. <FOCUS sentence if provided.> Report findings as: severity, file:line, the issue, and a concrete fix. Do not modify any files. Do not call extension or MCP tools; answer directly." 2>/dev/null
   ```
   where `<SCOPE>` is "uncommitted working-tree changes" or "changes in `<base>...HEAD`".
   - Foreground: run the command directly and return its stdout.
   - Background: run the same command with `run_in_background: true`, then tell the user it started
     and to check `/pi-agent-cc:status` for the process and read its output when it finishes.
5. Return pi's output **verbatim**. This is review-only — do not apply or offer to apply fixes here
   (use `/pi-agent-cc:rescue` for that).
