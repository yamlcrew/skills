---
description: Run a read-only OpenCode review of local git changes
argument-hint: '[--wait|--background] [--base <ref>] [focus area]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(opencode:*), Bash(git:*), Bash(timeout:*), AskUserQuestion
---

Delegate a **read-only** code review to the OpenCode CLI. Do not fix anything yourself.

Arguments: `$ARGUMENTS`

## Steps

1. Parse the arguments:
   - `--wait` → run in the foreground. `--background` → run as a background task.
   - `--base <ref>` → review `<ref>...HEAD`; otherwise review the working tree (uncommitted changes).
   - Any remaining text is an optional **focus area** for the review.
2. **Model:** do not pass `--model`. `opencode run` uses the user's configured default model
   (confirm with `opencode debug config 2>/dev/null | grep -E '"(model|small_model)":'` if helpful).
3. Decide foreground vs background if the user did not specify: check change size with
   `git status --short --untracked-files=all` and `git diff --shortstat` (or
   `git diff --shortstat <base>...HEAD`). For a tiny change (≈1–2 files) recommend waiting; otherwise
   recommend background. Use `AskUserQuestion` once to confirm.
4. Run OpenCode's read-only `plan` agent. **Do not paste the diff into the argument** — tell OpenCode to
   inspect the repository itself:

   ```
   timeout 600 opencode run --agent plan "Read-only code review. Review the <SCOPE> in this repository:
   inspect it yourself with git and by reading the changed files. <FOCUS sentence if provided.>
   Report findings as: severity, file:line, the issue, and a concrete fix. Do not modify any files.
   Do not call MCP tools; answer directly."
   ```
   where `<SCOPE>` is "uncommitted working-tree changes" or "changes in `<base>...HEAD`".
   - Foreground: run the command directly and return its stdout.
   - Background: run the same command with `run_in_background: true`, then tell the user it started and to
     check `/opencode-agent-cc:status` for the process and read its output when it finishes.
5. Return OpenCode's output **verbatim**. This is review-only — do not apply or offer to apply fixes here
   (use `/opencode-agent-cc:rescue` for that).
