# Gate 1 — The trade-off ledger

Booking the debit is the whole discipline. Everything else in this skill assumes
you did it honestly.

## The ledger

One row per consequence. Credits and debits both. If the debit column is empty,
the analysis is not finished.

```
DECISION: Split the order pipeline into three services

CREDIT                                          BASIS
  Order and inventory scale independently       peak load 8:1 skew, measured Q2
  Payments team deploys without release train   4 blocked deploys/month today
  Failure in recommendations stops being        3 of 5 P1s last year traced to it
    a checkout outage

DEBIT                                           BASIS
  Recovery 15 min → ~90 min                     failure now spans 3 services,
                                                  no cross-service runbook exists
  40% of user operations become network calls   traced 12 top endpoints
  18 engineer-months before any user benefit    3 engineers, 6 months, est.
  On-call surface: 1 rota → 3 rotas             org has 2.5 rotas of people

PAID BY: platform on-call (recovery, rotas), product (18 months of no roadmap)
REVISIT: if peak skew drops below 3:1, or the team drops below 12 engineers
VERDICT: recommend / recommend with conditions / not yet / no
```

The `PAID BY` line is the one people skip and the one that decides whether the
recommendation survives contact with the org. Fill it in with team names, not
"the business."

## Five debit categories

Most missed debits fall into one of these. Walk them explicitly; they are cheap
to check and expensive to discover in production.

1. **Recovery.** How long to detect, diagnose, and restore after this change?
   Distribution reliably makes diagnosis worse, because the question shifts from
   "what broke" to "which of these broke first."
2. **Cognitive load.** How many things must one engineer hold in their head to
   change one behaviour safely? Count the repos, deploys, and dashboards a
   single feature now touches.
3. **Consistency.** What used to be a transaction and is now an eventual
   promise? Name the window and the business rule that has to tolerate it.
4. **Operational surface.** New rotas, new runbooks, new alerts, new failure
   modes. Every component added is a component someone is woken up for.
5. **Time-to-first-value.** How long before a user notices anything? A migration
   that pays off in month 19 competes with everything else that could happen in
   those 18 months.

## Pricing what you cannot measure yet

Never answer "hard to say." Answer with one of these instead:

- **Bracket it.** "Between 4 and 10 engineer-months; the spread is whether the
  legacy auth path can be left alone." A range with a named driver is actionable.
- **Name the proxy.** No recovery-time data? Use the last three incidents in the
  same subsystem and say that is what you used.
- **State the measurement.** "I would instrument cross-service call count on the
  checkout path for two weeks. Above 30% of operations, this decision flips."
- **Book it as risk, not cost.** Unquantified downside is still downside. "Vendor
  lock-in: unpriced, but exit cost grows with every month of adoption."

The failure is silence, not imprecision.

## "Better for what?"

Run any comparison across these axes rather than arguing "better" in the
abstract. A design that wins everywhere is a design whose costs you have not
found yet.

| Axis | The question | Typical loser when you optimize it |
|---|---|---|
| Scaling | Does it survive 10× on the dimension that actually grows? | Recovery, cost |
| Deployment | Can teams ship independently? | Consistency, debugging |
| Debugging | Can one person find the cause at 3am? | Deployment independence |
| Hiring | Can someone be productive in week two? | Novelty, elegance |
| Cost | What is the monthly run rate at target scale? | Latency headroom |
| Reversibility | What does it cost to undo in a year? | Almost everything else |

**Reversibility deserves separate weight.** Cheap-to-reverse decisions should be
made fast and locally — gating them is the over-application of this skill.
Expensive-to-reverse decisions justify the full ledger, and the ledger should
say what the exit looks like.

## Handling the recommendation that argues against you

A ledger only ever landing on your preferred answer is a ledger nobody trusts
twice. When the numbers turn:

- Say so plainly and early. "I came in expecting to recommend this; the recovery
  cost changed my mind."
- Keep the conditions. "This becomes right when the team passes 25 engineers."
- Do not soften the credit side to justify the reversal. Both columns stay
  honest, and the verdict changes — not the evidence.

## Anti-patterns

- **Adjective debits.** "Adds some complexity." Complexity to whom, costing what?
- **Symmetric hedging.** Listing three credits and three debits of deliberately
  equal vagueness so the reader picks. That is abdication dressed as balance.
- **Borrowed justification.** "Netflix does this." Netflix has a platform team
  the size of your engineering org and had built the failure-handling layer
  first. Cite the mechanism, never the logo.
- **Booking the debit and then ignoring it.** If recovery triples and the plan
  contains no runbook work, the debit was decorative.
