# Debt mode — harvest `lsd:` shortcuts into a ledger

Every deliberate lazy-senior-dev shortcut is marked with an `lsd:` comment naming
its ceiling and upgrade path. This mode collects them into one ledger so a
deferral can't quietly become permanent. Report only.

## Scan

Grep the repo for comment markers, skipping `node_modules`, `.git`, and build
output. Cover the common comment prefixes (`#`, `//`, `<!--` for HTML/MDX, `--`
for SQL/Lua, `;` for Lisp/ini):

```
grep -rnE '(#|//|<!--|--|;) ?lsd:' .
```

Each hit is one ledger row. The comment prefix keeps prose that merely mentions
the convention out of the ledger.

## Output

One row per marker, grouped by file:

`<file>:<line> — <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.`

A ceiling/upgrade is only expected when a shortcut *has* a known ceiling
(`lsd: <ceiling>, <upgrade path>`) — pull both straight from the comment when
present. Plenty of legitimate markers name no ceiling at all (`// lsd: this
exists`, `# lsd: stdlib covers this`); those are intentional, not debt. Want an
owner per row too? Add `git blame -L<line>,<line>`.

Tag the rot risk informationally: an `lsd:` comment that *describes a ceiling but
names no upgrade path or trigger* gets a `no-trigger` tag — those are the ones
that can silently rot. A plain "this exists" marker is not `no-trigger`.

End with `<N> markers, <M> with no trigger.` (count only ceiling-bearing markers
toward `<M>`). Nothing found: `No lsd: debt. Clean ledger.`

## Boundaries

Reads and reports only, changes nothing. To persist it, ask and write the ledger
to a file (e.g. `LAZY-SENIOR-DEV-DEBT.md`). One-shot.
