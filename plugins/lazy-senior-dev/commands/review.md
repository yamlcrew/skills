---
description: Review the current diff for over-engineering — hands back a delete-list
argument-hint: '[focus area]'
disable-model-invocation: true
allowed-tools: Task
---

Review the current code changes for **over-engineering only** (not correctness).
Report what can be deleted; change nothing.

Arguments: `$ARGUMENTS`

## Steps

1. Any argument text is an optional **focus area** for the review.
2. Delegate to the `lazy-senior-dev:lazy-senior-dev` subagent (via the Task
   tool): run the **review** mode over the current diff, with the focus area if
   given.
3. Return the subagent's output verbatim.
