---
description: Harvest `lsd:` shortcut comments into a tracked debt ledger
argument-hint: ''
disable-model-invocation: true
allowed-tools: Task
---

Harvest every `lsd:` comment in the repository into a debt ledger, so deferred
shortcuts don't rot into "later means never". Report only; change nothing
unless asked to persist it.

Arguments: `$ARGUMENTS`

## Steps

1. Delegate to the `lazy-senior-dev:lazy-senior-dev` subagent (via the Task
   tool): run the **debt** mode over the repo.
2. Return the subagent's output verbatim.
