# Gate 3 — Diagnosing the structure

A senior engineer fixes the coupling. An architect finds what keeps producing
it. This reference is about the generator, not the symptom.

## The recurrence test

Start here, always:

> Has this been fixed before? How many times?

- **Once** — probably a bug. Fix it and move on.
- **Twice** — suspicious. Ask who owns each side.
- **Three or more** — the coupling is an *output*. Something upstream is still
  running and will regenerate it within two sprints of any refactor. Stop
  refactoring; find the generator.

The evidence is cheap to gather:

```bash
# Files changed most often in the last 6 months — volatility proxy
git log --since="6 months ago" --format="" --name-only | sort | uniq -c | sort -rn | head -20
```

Files that consistently change *together* while living in different modules are
the strongest available signal of a boundary that exists in the code but not in
reality. No static dependency graph will show you this, because the coupling is
often semantic — the same rule written twice — with no import to follow.

## The five generators

In rough order of how often each is the real answer:

1. **Ownership.** Two teams own one code path, or nobody does. Conway's Law is
   not a slogan: systems reproduce the communication structure that built them.
   A boundary that does not match an ownership boundary erodes.
2. **A shared write.** Two services writing one table are one service in a
   costume, with none of a monolith's guarantees and all of a distributed
   system's costs.
3. **A duplicated rule.** The same business logic implemented in two places must
   be synchronised by hand, forever. Neither side imports the other, so tooling
   stays silent until the two drift and something bills wrong.
4. **Deploy coupling.** Any feature requiring two things to ship together proves
   the boundary you drew is not the boundary that exists.
5. **Growth without a boundary owner.** A team scaling from 10 to 80 engineers
   with nobody accountable for boundaries produces a big ball of mud on
   schedule — not from incompetence, but from many locally reasonable choices
   with no one holding the global view.

## Grading a coupling before you act on it

Not all coupling is worth removing. Grade each problematic pair on three axes
before proposing anything. This is the model from Vlad Khononov's *Balancing
Coupling in Software Design*, compressed to what a decision needs:

- **Strength** — what is shared. Weakest to strongest: a purpose-built contract
  (a DTO designed for integration) → the upstream's internal domain model →
  interrelated business logic or ordering requirements → reaching into internals
  that were never meant to be integration points, such as reading another
  service's database.
- **Distance** — how far apart the two sides live: same class, same package,
  same service, different services, different organisations. **Add one level if
  different teams own them** — organisational distance is real distance.
- **Volatility** — how often each side actually changes. Core business logic is
  volatile by definition; auth, billing, and logging usually are not.

The diagnosis:

| Strength | Distance | Volatility | Read |
|---|---|---|---|
| High | High | High | **Fix this first.** Frequent change propagating across a long distance is where the cost lives |
| High | Low | High | **Healthy.** Things that change together live together — that is cohesion, not coupling |
| Low | High | Any | **Healthy.** Loose contract across a real boundary is the target state |
| High | High | Low | **Tolerable.** Strong but static, e.g. a stable legacy integration. Leave it |
| Low | Low | High | **Watch.** Unrelated things sharing a home. Noise, not danger |

The single actionable read: **strong coupling to something both distant and
volatile is the problem.** Everything else is either fine or cheap. Chasing
coupling that scores low on volatility is how architects burn credibility on
work nobody feels.

## The deliverable

Not a refactor plan. A boundary and ownership map:

```
CONTEXT: Billing
  Owns (source of truth): invoices, payment_methods, dunning_state
  Team: Payments
  Talks to:
    Orders     ← consumes OrderPlaced event (async, contract v2)
    Identity   → reads customer contract API (sync, read-only)
  Must not:    write to orders.*  |  import orders.domain.*
  Volatility:  high (core — pricing rules change ~monthly)

CONTEXT: Orders
  ...

GENERATOR FOUND: `discount_eligible` implemented in both Billing and Orders.
  Neither imports the other; drift caused 2 incidents (Mar, Jul).
  Root cause: no owner for pricing rules — Payments wrote theirs, Orders
  wrote theirs, both correct at the time of writing.
  Fix: Billing owns the rule; Orders consumes it via contract.
  Enforcement: contract test in CI + named owner in CODEOWNERS.
```

Three properties make this a structural fix rather than another refactor:

1. **Every boundary has one named owner.** Not a team list — an owner.
2. **The "must not" line is enforced**, by a CI check, a lint rule, a module
   boundary, or ownership. An unenforced boundary is a comment.
3. **The generator is addressed**, not just its output. Consolidating the
   duplicated rule without assigning the rule an owner means it gets
   reimplemented by whoever next needs it in a hurry.

## Boundaries: real or accidental

| Real boundary | Accidental boundary |
|---|---|
| One team can change its inside without asking anyone | Changes require coordinating two teams |
| Owns its data end to end | Shares tables with something else |
| Ships on its own schedule | Ships in lockstep with a neighbour |
| Speaks through a versioned contract | Exposes its internal model outward |
| Named in the business's own vocabulary | Named after a technical layer |

The last row is the fastest tell. Boundaries named `services`, `handlers`,
`utils`, or `common` are technical layers, not domains — and layers do not
contain change, because a single business change cuts across all of them.
`common` in particular is where boundaries go to dissolve.

## What not to do here

- **Do not propose microservices as a coupling fix.** Distance amplifies
  coupling cost; it does not reduce coupling. A modular monolith with enforced
  boundaries fixes the same generator far more cheaply, and leaves extraction
  available later.
- **Do not fix coupling that scores low on volatility.** It is not costing
  anything, and the work is invisible to everyone who funds it.
- **Do not redraw boundaries without redrawing ownership.** The map reverts to
  whatever the org chart says within about two quarters.
