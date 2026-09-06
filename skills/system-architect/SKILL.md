---
name: system-architect
description: >
  Architect-level decision discipline for when the question is bigger than the
  code. Forces four artifacts before any architectural recommendation ships: a
  booked trade-off with numbers, a translation into cost / risk / value, a
  structural root cause, and a sequenced migration path whose enabling work
  comes first. Use when choosing or changing an architecture (microservices vs
  monolith, event-driven, CQRS, a rewrite, a cloud migration, a platform bet),
  when a decision needs sign-off from people who do not read code, when the
  same coupling has been fixed more than once, when a team is outgrowing its
  structure, or when someone asks for a target-state diagram, a 2–3 year
  technical vision, an ADR, an RFC, or a migration roadmap. Also use when asked
  to justify, defend, or challenge an architectural choice.
license: MIT
---

# System Architect

Architecture is not senior engineering with a bigger title. A senior engineer
is measured by the solution they deliver. An architect is measured by the
constraints they set for everyone else to build inside — fewer decisions, each
touching more people, most of them irreversible on a normal budget.

The failure mode this skill exists to prevent: a technically correct
recommendation that nobody costed, nobody sequenced, and nobody outside
engineering agreed to. That recommendation does not get built. It gets
relitigated for two quarters and then quietly dropped.

> Framework distilled from *The 3 Skills That Separate Architects From Senior
> Developers* (The Serious CTO, 2026) — systems thinking, organizational
> influence, structural design — plus the coupling model in *Balancing Coupling
> in Software Design* (Vlad Khononov) used in Gate 3.

## The gate

**No architectural recommendation leaves this session until all four gates
below have an answer.** Not four documents — four answers, proportional to the
decision. A one-week change earns four sentences. A two-year platform bet earns
four sections.

An answer you cannot produce is itself the finding. "I cannot cost this because
nobody owns the infra budget number" is a real deliverable. A confident
recommendation with an empty Gate 2 is not.

Work the gates in order. Gate 1 decides whether there is anything worth
recommending; the rest only matter if there is.

---

## Gate 1 — Book the trade-off

Every architectural move buys something with something. If you named only what
improves, you have written marketing, not architecture.

**The rule: every recommendation carries a debit entry, and the debit has a
number.** Not "adds operational complexity" — *"recovery goes from 15 minutes
to 90 because the failure now spans four services and nobody owns the runbook."*
Not "some latency cost" — *"40% of user-visible operations become cross-service
calls."* Not "takes a while" — *"18 engineer-months before the first user
notices anything."*

Where no number exists, say what you would measure and what threshold would
change the answer. An estimate with a stated basis beats an adjective.

**Then ask the question that does the real work: better for what?**

Better for scaling, deployment, hiring, debugging, or cost? These pull in
different directions, and a design that wins on one usually loses on another.
Name the dimension you are optimizing, the dimension you are sacrificing, and
**who pays** — because it is rarely the person proposing it.

The last one is the sharp end. The people who carry the pager when the diagram
meets production are the ones paying the debit. If they have not seen the
trade-off, it has not been booked.

**Load `references/tradeoff-ledger.md`** for the ledger format, the five
standard debit categories, and how to price a trade-off you cannot measure yet.

## Gate 2 — Translate to the other side of the table

A senior engineer argues with engineers. An architect argues with product,
finance, operations, other architects, and whoever signs. Those rooms do not
reject technical arguments because they are wrong. They reject them because
they arrive in the wrong units.

**Convert the argument into cost, risk, and value before it is spoken aloud.**
The shape that survives:

| | Today | Proposed | Delta |
|---|---|---|---|
| Run cost | 3.0M / yr | 4.2M / yr | **+1.2M** |
| People to operate it | 8 FTE | 5.5 FTE | **−2.5 FTE** |
| Value of freed capacity | — | 2.5 eng-yrs on roadmap | **~+1.0M** |
| Risk moved | single-region outage | vendor lock-in | *traded, not removed* |

That table loses on run cost and still wins the room, because it prices what
engineering time is actually worth instead of assuming everyone already knows.
Do the arithmetic even when it argues against you — a ledger that only ever
lands on your preferred answer is one nobody will trust twice.

Three rules that keep this honest:

- **Own the number you are least comfortable with.** State it first. Someone in
  the room already knows it; discovering that you hid it costs more than the
  number does.
- **Risk is traded, never deleted.** Say what replaces what.
- **Give the decision a shelf life.** "Revisit when write throughput passes X,
  or the team passes N engineers." A decision without a revisit trigger becomes
  folklore that outlives the conditions that justified it.

**Load `references/cost-translation.md`** for the full business-case template,
how to value engineering capacity defensibly, and how to hold the line when the
answer is *"this is not worth doing yet."*

## Gate 3 — Diagnose the structure, not the symptom

A senior engineer fixes the coupling. An architect asks what keeps regenerating
it.

**The recurrence test: has this been fixed before?** If the same two modules
have been decoupled twice, the coupling is not the problem — it is the output
of something that is still running. Fixing it a third time is not architecture;
it is maintenance with a strong opinion.

What actually regenerates coupling, in rough order of how often it is the real
answer:

1. **Ownership.** Two teams own one code path, or nobody owns it. Conway's Law
   does not care about your diagram.
2. **A shared write.** Two services writing one table are one service wearing a
   costume.
3. **A duplicated rule.** The same business rule implemented twice must be kept
   in sync by hand, forever, and no dependency graph will show it to you.
4. **Deploy coupling.** Any feature that requires two things to ship together
   means the boundary you drew is not the boundary that exists.
5. **Growth without a boundary owner.** A team going from 10 to 80 engineers
   with no one accountable for boundaries produces a big ball of mud on
   schedule, from competent people making locally reasonable choices.

The deliverable is not a refactor. It is the domain map, the boundaries, **who
owns each one**, how they are allowed to talk, and the migration that gets there
— with enough of the generator removed that it does not re-congeal two sprints
after the refactor lands.

**Load `references/structural-diagnosis.md`** for the strength × distance ×
volatility coupling model, the boundary-and-ownership map format, and the
signals that separate an accidental boundary from a real one.

## Gate 4 — Sequence the vision

Three questions, and only three: where are we, where do we need to be in two to
three years, and how do we get there without stopping the business.

**A target-state diagram is not a vision.** It is the last slide of one. The
vision is the ordered sequence of moves that reaches it while the company keeps
shipping — and the first moves are almost never the migration itself.

**The enabling-work test.** When Netflix moved to microservices, the migration
took roughly seven years, and the circuit breakers, service discovery, and API
gateway were built *before* the services that needed them. If your sequence
opens with "extract the first service," the sequence is wrong: you have
scheduled the payoff before the thing that makes it survivable.

So the ordering rule is: **capability first, then the move that consumes it.**
For each step, state the ceiling it removes and the breaking point that triggers
the next one — "this holds until writes exceed X, or we lose a region." A step
whose breaking point you cannot name is a step you have not thought through, and
a sequence with no breaking points is a memorized end-state wearing a roadmap.

Sequence only the next two or three moves in detail. Everything past that is a
direction, and saying so out loud is more credible than a Gantt chart nobody
believes.

**Load `references/sequencing.md`** for the enabling-work checklist, the
strangler-fig and expand/contract patterns, and how to write a roadmap that
survives a changed constraint.

---

## What you actually produce

The output is decisions, documents, and alignment. Code stops being the
artifact.

| Ask | Deliverable |
|---|---|
| "Should we do X?" | Trade-off ledger + recommendation + revisit trigger |
| "Justify this to leadership" | Cost / risk / value table, worst number first |
| "This keeps breaking" | Structural diagnosis + boundary and ownership map |
| "Where are we going?" | Sequenced path: enabling work, moves, breaking points |
| "Write it up" | ADR (decided), RFC (deciding), roadmap (sequencing) |

An ADR records a decision already made. An RFC seeks a decision not yet made.
Do not write the first when you need the second — the most common documentation
error at this altitude, and it reads as a decision smuggled past the people who
were supposed to make it.

Keep them short. Two to five hundred words each; depth belongs in a linked
document. A one-sided ADR is not persuasive, it is untrustworthy — record the
alternative that nearly won and why it lost.

## When NOT to use this skill

Reach for something else when:

- **The decision is cheap and reversible.** A library choice inside one module
  is not architecture. Gating it wastes everyone's afternoon.
- **The work is a code-level review.** Coupling reports, SOLID violations,
  component sizing, and health scores are a different job with better tools.
- **Nobody has asked the question yet.** Architecture that arrives before the
  pain is over-engineering with a nicer vocabulary. Microservices at three
  engineers buys distributed-systems cost with no distributed-systems benefit.
- **The honest answer is "not yet."** Say it, name the threshold that would
  change it, and stop. Declining to architect is a legitimate output of this
  skill and often the highest-value one.

## Red flags in your own output

Any of these means a gate was skipped:

- A recommendation whose downside section is one hedged sentence.
- "Best practice," "industry standard," or "modern" doing the work of a reason.
- A cost argument with no number, or a number with no basis.
- A migration plan that starts with the migration.
- A boundary with no named owner.
- A decision with no revisit trigger.
- The same coupling fixed a third time.
- **You are still measuring your value by what you personally shipped.** That is
  good senior engineering. It is not architecture — and an architect who stays
  that close to the code ends up competing with the engineers they are supposed
  to be enabling.

## References

Load a reference only when working its gate.

| File | Read when |
|---|---|
| `references/tradeoff-ledger.md` | Gate 1 — booking debits, pricing the unmeasurable, "better for what?" |
| `references/cost-translation.md` | Gate 2 — business case, valuing capacity, arguing "not yet" |
| `references/structural-diagnosis.md` | Gate 3 — coupling model, boundaries, ownership, Conway |
| `references/sequencing.md` | Gate 4 — enabling work, strangler fig, breaking points |

Agents without `${CLAUDE_PLUGIN_ROOT}` should read these paths relative to this
skill's own directory.
