# Audit mode — whole-repo over-engineering audit

Review mode, repo-wide. Scan the **whole tree** instead of a diff, and rank
findings biggest cut first. Report only, change nothing. One-shot.

## Tags

Same as review mode:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Hunt

Deps the stdlib or platform already ships, single-implementation interfaces,
factories with one product, wrappers that only delegate, files exporting one
thing, dead flags and config, hand-rolled stdlib.

## Output

One line per finding, ranked biggest cut first:

`<tag> <what to cut>. <replacement>. [path]`

End with `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean already. Ship.`

## Boundaries

Complexity only — correctness bugs, security holes, and performance go to a
normal review pass. Lists findings, applies nothing. One-shot.
