---
description: Quick reference — lazy-senior-dev commands, intensity levels, and the `lsd:` marker
argument-hint: ''
disable-model-invocation: true
---

Show this reference card. One-shot, change nothing — do not dispatch the
subagent, do not act on the repo.

## Commands

| Command | What it does |
|---------|--------------|
| `/lazy-senior-dev:lazy [lite\|full\|ultra]` | Run a task in lazy mode at the chosen intensity (default `full`). |
| `/lazy-senior-dev:review` | Over-engineering review of the current diff — a delete-list. |
| `/lazy-senior-dev:audit` | Whole-repo over-engineering audit, ranked biggest cut first. |
| `/lazy-senior-dev:debt` | Harvest `lsd:` shortcut comments into a tracked ledger. |
| `/lazy-senior-dev:help` | This card. |

## Intensity levels

- **lite** — build what's asked, name the lazier alternative in one line.
- **full** — the ladder enforced (YAGNI → stdlib → native → one line → minimum). Default.
- **ultra** — deletion before addition; challenges the requirement before building.

The level is chosen per invocation — it is not a sticky session mode, and there
is nothing to deactivate.

## The `lsd:` marker

Deliberate simplifications are marked in code with an `lsd:` comment. When a
shortcut has a known ceiling, the comment names it and the upgrade path:
`# lsd: global lock, per-account locks if throughput matters`.
`/lazy-senior-dev:debt` harvests these into a ledger.

The methodology derives from the upstream **ponytail** skill by Dietrich Gebert
(MIT): <https://github.com/DietrichGebert/ponytail>.
