# Gate 4 — Sequencing the vision

Where are we, where do we need to be in two to three years, and how do we get
there without stopping the business. A target-state diagram answers the middle
question only, which is why handing one over feels like a plan and functions
like a wish.

## The enabling-work test

Run this before anything else in the sequence.

> What has to exist before the first migration step is survivable?

Netflix's move to microservices took roughly seven years, and the pieces that
made it survivable — circuit breakers, service discovery, an API gateway — were
built *before* the services that depended on them. That ordering is the whole
lesson, and it is the part that gets skipped when the story is retold as "they
adopted microservices."

**If your sequence opens with the migration, the sequence is wrong.** You have
scheduled the payoff before the capability that keeps it from hurting.

Common enabling work, and the move each unlocks:

| Enabling capability | Without it, this fails |
|---|---|
| Distributed tracing | Any debugging after the first split |
| Contract tests in CI | Every boundary you draw, within two sprints |
| A rollback that is actually exercised | The first migration step that goes wrong at 2am |
| One owner per boundary | The structural fix from Gate 3 |
| A measured baseline (latency, cost, recovery) | Proving the migration helped at all |
| Feature flags / dual-write plumbing | Any incremental cutover |

The baseline row is the one most often missed and the cheapest to fix. A
migration with no before-measurement cannot be declared a success by anyone who
was not already convinced — and eighteen months in, that is exactly who asks.

## Sequence format

Detail the next two or three moves. Everything after that is a direction, and
saying so is more credible than a Gantt chart nobody believes.

```
NOW:    Modular monolith, 1 deploy pipeline, 11 engineers, 400 writes/sec
TARGET: ~3 independently deployable domains, 2026 H2

STEP 0 — Enabling (6 weeks)
  Tracing across all module boundaries; contract tests in CI; recovery
  baseline measured from the last 3 incidents.
  Done when: a cross-module request is traceable end to end and one
             contract test fails a deliberately breaking change.

STEP 1 — Extract Payments (10 weeks)
  Highest isolation, clearest ownership, lowest shared-write surface.
  Ceiling removed: payments deploys independently of the release train.
  Breaking point → next step: when a second team is blocked on the train,
             or writes exceed ~1.5k/sec.
  Rollback: keep the monolith path behind a flag for 4 weeks after cutover.

STEP 2 — (direction only)
  Orders next, if step 1's recovery cost lands inside the estimate.
  Revisit the whole sequence if it does not.

NOT DOING YET: multi-region, event sourcing, service mesh.
  Trigger for multi-region: a contractual RTO under 1 hour.
```

Four properties make this a plan rather than a wish:

1. **Step 0 is enabling work**, not migration.
2. **Every step names the ceiling it removes.** A step that removes no ceiling
   is motion.
3. **Every step names its breaking point** — the condition that makes the next
   step necessary. "This holds until writes exceed X, or we lose a region."
4. **`NOT DOING YET` is explicit, with triggers.** This is what stops the
   roadmap from being read as a shopping list, and it is where most of the
   credibility comes from.

## Treat every step as a hypothesis

Each step is a claim about a ceiling, not a destination. Saying the breaking
point out loud is what separates reasoning from defending a diagram — and it
means a changed constraint updates the plan instead of embarrassing it.

When a constraint moves (load doubles, a latency target tightens, the team
halves), revisit the assumption and re-sequence. Do not patch the old shape onto
a problem it no longer fits: that is how a two-year plan becomes a two-year
argument.

## Patterns for moving without stopping

- **Strangler fig.** Put a routing layer in front of the old system, move one
  capability at a time behind it, delete the old path only when traffic is zero.
  The default for any migration where a big-bang cutover is unacceptable — which
  is nearly all of them. Requires the routing layer as enabling work.
- **Expand / contract.** For schema and API changes: add the new shape, write to
  both, migrate readers, then remove the old shape. Three deploys, no downtime,
  and each phase is independently reversible.
- **Branch by abstraction.** Introduce an interface over the thing being
  replaced, build the new implementation behind it, switch, remove the old one.
  Keeps everything on the mainline instead of a long-lived branch that ages out
  of mergeability.
- **Dual run.** Run old and new side by side on real traffic, compare outputs,
  cut over when they agree. Expensive; correct when being wrong is expensive —
  billing, pricing, anything with regulatory exposure.

## Estimating without lying

- **Give ranges with named drivers.** "10–16 weeks; the spread is whether the
  legacy auth path can be left in place." Survives being wrong.
- **Estimate the enabling work separately.** It is the part that gets cut under
  pressure, and cutting it is what makes the migration fail. Keeping it as a
  visible line item makes cutting it a decision someone has to own.
- **Include verification.** Cutover is not done at deploy; it is done when the
  old path is deleted. Plans that stop at deploy leave both systems running
  indefinitely — the halfway house, which is worse than either endpoint.
- **Budget for the second system.** Between step N and step N+1 you operate two
  architectures. That cost is real, recurring, and the most common thing missing
  from a migration business case.

## Failure modes

| Failure | Signal in the plan |
|---|---|
| Halfway house | No step deletes anything; old paths have no removal date |
| Enabling work cut | Step 0 vanished after the first schedule review |
| Memorized end-state | Steps have no breaking points, only names |
| Roadmap as shopping list | No `NOT DOING YET` section |
| Success undefined | No baseline measured before step 0 |
| Big-bang by default | No rollback described for any step |
