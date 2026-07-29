---
description: Audit the whole repo for over-engineering — ranked list of what to cut
argument-hint: '[path or focus area]'
disable-model-invocation: true
allowed-tools: Task
---

Audit the **entire repository** for over-engineering (not correctness). Return a
ranked delete-list; change nothing.

Arguments: `$ARGUMENTS`

## Steps

1. Any argument text narrows the scope (a subtree path) or sets a focus area;
   otherwise audit the whole tree.
2. Delegate to the `lazy-senior-dev:lazy-senior-dev` subagent (via the Task
   tool): run the **audit** mode over the repo, with the scope/focus if given.
3. Return the subagent's output verbatim.
