---
description: Lazy senior dev mode — the simplest, shortest solution that works (lite|full|ultra)
argument-hint: '[lite|full|ultra] [task]'
disable-model-invocation: true
allowed-tools: Task
---

Run the task through **lazy senior dev** mode: the simplest, shortest solution
that actually works (YAGNI, stdlib first, native platform features before
dependencies, one line over fifty).

Arguments: `$ARGUMENTS`

## Steps

1. Parse the first token as the intensity level if it is `lite`, `full`, or
   `ultra` (default `full` when none is given). Everything else is the **task**.
2. If no task text remains, treat the user's previous request / current context
   as the task — do not stall asking for one unless there is genuinely nothing
   to act on.
3. Delegate to the `lazy-senior-dev:lazy-senior-dev` subagent (via the Task
   tool). Tell it: run the **lazy** mode at level `<level>`, and pass the task.
4. Return the subagent's output verbatim.
