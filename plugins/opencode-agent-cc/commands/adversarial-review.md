---
description: Run a steerable adversarial OpenCode review that challenges the change
argument-hint: '[--wait|--background] [--base <ref>] [focus area]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(opencode:*), Bash(git:*), Bash(timeout:*), AskUserQuestion
---

Delegate a **read-only adversarial** review to the OpenCode CLI — a skeptical pass that tries to find
reasons the change should not ship. Do not fix anything yourself.

Arguments: `$ARGUMENTS`

## Steps

1. Parse the arguments:
   - `--wait` → foreground. `--background` → background task.
   - `--base <ref>` → review `<ref>...HEAD`; otherwise the working tree.
   - Any remaining text is the **focus area**.
2. **Model:** do not pass `--model` — use the configured default.
3. `Read` the prompt template at `${CLAUDE_PLUGIN_ROOT}/prompts/adversarial-review.md`. Substitute:
   - `{{TARGET_LABEL}}` → "uncommitted working-tree changes" or "changes in `<base>...HEAD`".
   - `{{USER_FOCUS}}` → the focus text, or "none".
   If the template cannot be read, tell the user the plugin's prompt file is missing and stop.
4. Decide foreground vs background as in `/opencode-agent-cc:review` (size check + one `AskUserQuestion`
   if the user didn't specify).
5. Run the read-only `plan` agent with the filled template as the prompt:
   ```
   timeout 600 opencode run --agent plan "<filled adversarial-review template>"
   ```
   - Foreground: run directly, return stdout.
   - Background: `run_in_background: true`, then point the user to `/opencode-agent-cc:status`.
6. Return OpenCode's output **verbatim** (it follows the template's VERDICT + findings contract). Do not
   apply fixes — use `/opencode-agent-cc:rescue` for that.
