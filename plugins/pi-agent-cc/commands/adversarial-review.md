---
description: Run a steerable adversarial pi review that challenges the change
argument-hint: '[--wait|--background] [--base <ref>] [focus area]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(pi:*), Bash(git:*), Bash(timeout:*), AskUserQuestion
---

Delegate a **read-only adversarial** review to the pi CLI — a skeptical pass that tries to find
reasons the change should not ship. Do not fix anything yourself.

Arguments: `$ARGUMENTS`

## Steps

1. Parse the arguments:
   - `--wait` → foreground. `--background` → background task.
   - `--base <ref>` → review `<ref>...HEAD`; otherwise the working tree.
   - Any remaining text is the **focus area**.
2. **Model:** do not pass `--model`/`--provider` — use the configured default.
3. `Read` the prompt template at `${CLAUDE_PLUGIN_ROOT}/prompts/adversarial-review.md`. Substitute:
   - `{{TARGET_LABEL}}` → "uncommitted working-tree changes" or "changes in `<base>...HEAD`".
   - `{{USER_FOCUS}}` → the focus text, or "none".
   If the template cannot be read, tell the user the plugin's prompt file is missing and stop.
4. Decide foreground vs background as in `/pi-agent-cc:review` (size check + one `AskUserQuestion`
   if the user didn't specify).
5. Run pi read-only with the filled template as the prompt, capturing stdout only:
   ```
   timeout 600 pi -p --tools read,grep,find,ls,bash --no-approve "<filled adversarial-review template>" 2>/dev/null
   ```
   - Foreground: run directly, return stdout.
   - Background: `run_in_background: true`, then point the user to `/pi-agent-cc:status`.
6. Return pi's output **verbatim** (it follows the template's VERDICT + findings contract). Do not
   apply fixes — use `/pi-agent-cc:rescue` for that.
