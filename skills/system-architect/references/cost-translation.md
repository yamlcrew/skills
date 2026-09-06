# Gate 2 — Translating to cost, risk, and value

The room does not reject technical arguments for being wrong. It rejects them
for arriving in units it cannot act on. Translation is not dumbing down — it is
the last step of the analysis, and skipping it is how correct proposals die.

## The business case, in one table

Four rows. Anything longer stops being read.

| | Today | Proposed | Delta |
|---|---|---|---|
| Run cost | 3.0M / yr | 4.2M / yr | **+1.2M** |
| People to operate it | 8 FTE | 5.5 FTE | **−2.5 FTE** |
| Value of freed capacity | — | 2.5 eng-yrs on roadmap | **~+1.0M** |
| Risk moved | single-region outage | vendor lock-in | *traded, not removed* |

Read it out loud as: *"It costs 1.2M more to run and gives back 2.5 engineers.
Year one is roughly a wash; year two onward it pays, and it converts an outage
risk we cannot control into a lock-in risk we can plan an exit from."*

That framing wins rooms that a latency graph does not. Note that the table loses
on the headline number and still lands — because it prices the thing the
engineering argument usually leaves implicit.

## Valuing engineering capacity defensibly

The line most likely to be challenged, so derive it rather than asserting it.

- **Use fully loaded cost, not salary.** Salary, benefits, tooling, overhead.
  Finance already has this number — ask for theirs instead of inventing one.
  Using their number makes the case theirs too.
- **Value the capacity by what it displaces**, not by cost. "2.5 engineers move
  from keeping the lights on to the integrations roadmap" is a stronger claim
  than a salary multiple, and it is checkable against the roadmap.
- **Discount honestly.** Freed capacity is never 100% recovered. Say what you
  assumed — 70% is defensible, 100% is not, and stating the discount pre-empts
  the objection.
- **Separate one-time from recurring.** A migration costing 18 engineer-months
  once and saving 2.5 FTE per year is a payback-period argument. Give the
  period; do not make the room compute it.

## Framing risk

Risk is traded, never deleted. Any proposal claiming to remove risk without
naming what replaces it has an incomplete Gate 1.

| Frame | Use when | Example |
|---|---|---|
| Exposure | The risk already exists and is unowned | "Two of five P1s last year came from this path" |
| Trade | The change swaps one risk for another | "Region outage → vendor dependency" |
| Ceiling | The risk is bounded and priced | "Worst case is a four-hour degraded read path" |
| Deadline | The risk grows with delay | "Exit cost rises ~every month of adoption" |

Prefer the deadline frame when it is true. It converts an open-ended debate into
a dated one, which is the only reliable way an architectural decision beats the
next feature request for attention.

## Arguing "not yet"

The highest-value output of this gate is often declining to build. It only works
if you make it concrete:

1. **Name the threshold.** "This is right above roughly 25 engineers or 3k
   writes/sec. We are at 11 and 400."
2. **Name what to do instead.** "Two weeks of module boundaries inside the
   monolith buys most of the benefit at a fraction of the cost."
3. **Name the trigger to revisit.** Who watches the number, and when do they
   check it.

Without step 3 this reads as obstruction. With it, it reads as a plan — and it
gives the person who wanted the change a defined path to getting it.

## Reading the room

Different rooms buy different currencies. Same analysis, different first line.

| Audience | Leads with | Do not open with |
|---|---|---|
| Finance | Run rate, payback period | Latency, elegance |
| Product | Time-to-first-value, roadmap capacity freed | Internal quality |
| Operations | Recovery time, on-call load, runbooks | Development velocity |
| Other architects | Trade-offs, alternatives, why they lost | The recommendation alone |
| Engineers | Failure modes, what the work is actually like | The business case |

Adjust the order and emphasis; never adjust the numbers. Two rooms hearing two
different sets of figures is how an architect stops being trusted, permanently.

## Rules that keep it honest

- **Lead with your worst number.** Someone in the room already knows it.
  Discovering that you buried it costs more than the number ever could.
- **Show the alternative that nearly won and why it lost.** A proposal with no
  credible rival looks unexamined.
- **Give the decision a shelf life.** Every recommendation carries a revisit
  trigger. Without one it becomes folklore that outlives its own justification,
  and someone inherits it in three years with no idea why.
- **Never present a range as a point estimate.** "6–10 months" survives being
  wrong. "8 months" spends your credibility in month nine.
