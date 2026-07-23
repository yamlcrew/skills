# Scheduling, Retries, and Fallback

> When to read: retry policies, repeats, polling, backoff, jitter, cron, `Schedule` composition,
> `ExecutionPlan` provider fallback.

## Mental model

`Schedule` is the standard abstraction for retries, repeats, polling, backoff, and cadence.
When timing behavior matters, express it with a `Schedule` — never ad hoc loops, mutable
counters, or hand-written `Effect.sleep` recursion.

Three escalating levels — choose the smallest that expresses the policy:

1. Simple `Effect.retry({ ... })` options for bounded or condition-based retries
2. `Schedule` for timing-aware policies
3. `ExecutionPlan` for fallback across different providers/layers

## Retry vs repeat

- `Effect.retry(policy)` — re-run on **failure** (success is never retried)
- `Effect.repeat(policy)` — re-run on **success**
- `Effect.schedule(policy)` — run an effect on a cadence

## Simple retry options

```typescript
effect.pipe(Effect.retry({ times: 3 }));                                  // fixed count
effect.pipe(Effect.retry({ until: (error) => error._tag === "Done" }));   // stop when true
effect.pipe(Effect.retry({ while: (error) => error._tag === "Retryable" }));

// Combine schedule + predicate
effect.pipe(
  Effect.retry({
    schedule: Schedule.exponential("500 millis"),
    while: (error) => error._tag === "Retryable",
    times: 5,
  }),
);
```

Use simple options when only the count/condition matters; use a `Schedule` when timing, backoff,
or jitter matters. Always check whether the failure is actually retryable — do not retry
indiscriminately.

## Core Schedule constructors

```typescript
Schedule.recurs(3);              // bounded number of additional runs
Schedule.forever;                // never terminates on its own
Schedule.spaced("1 second");     // constant spacing (polling, simple retry gaps)
Schedule.fixed("1 second");      // align to fixed interval boundaries (accounts for action time)
Schedule.windowed("5 seconds");  // align delays to nearest window boundary (flush/batching)
Schedule.duration("1 second");   // one-shot delay
Schedule.cron("0 0 * * *");      // calendar/wall-clock based execution
Schedule.exponential("500 millis", 1.5); // backoff
Schedule.jittered(schedule);     // randomize within bounds — avoids retry stampedes
```

## Backoff patterns

```typescript
// Exponential with a stable fallback cadence — keeps early retries responsive
// without unbounded delay growth (used across Effect's own RPC/workflow code)
const retryPolicy = Schedule.exponential("500 millis", 1.5).pipe(
  Schedule.either(Schedule.spaced("5 seconds")),
);

// Error-sensitive delay (e.g. honor rate-limit/retry-after metadata)
const policy = Schedule.forever.pipe(
  Schedule.addDelay((error) => (isRateLimited(error) ? "10 seconds" : "1 second")),
);
```

Use `Schedule.jittered` whenever many workers/clients may retry at once.

## Combinators

- `Schedule.either(a, b)` — both policies influence timing (min delay wins)
- `Schedule.compose(a, b)` / `Schedule.andThen(a, b)` — phase-based policies (aggressive first,
  steady-state after)
- `Schedule.whileInput` / `Schedule.whileOutput` / `Schedule.recurWhile` — predicate-based
  continuation
- `Schedule.addDelay` — delay derived from the input/output
- `Schedule.tapInput` / `Schedule.tapOutput` — retry observability

Schedules expose metadata (attempt count, elapsed time, previous delay) — prefer metadata-driven
stop conditions over mutable counters, and use it for retry diagnostics/logging.

## Retry only for specific causes

Advanced pattern (from Effect's own workflow engine) when retryability depends on the full
`Cause`, not just typed failures:

```typescript
effect.pipe(
  Effect.sandbox,
  Effect.retry(policy),
  Effect.catchAll((cause) =>
    Cause.isInterrupted(cause) ? Effect.die("retries exhausted after interrupt") : Effect.failCause(cause),
  ),
);
```

## ExecutionPlan — fallback across providers

Use `ExecutionPlan` when the same operation should be retried under **different provided
environments** — alternative LLM providers, upstream clusters, fast-but-flaky vs slow-but-safe
services:

```typescript
const Plan = ExecutionPlan.make(
  { provide: PrimaryLayer, attempts: 2, schedule: Schedule.spaced("1 second") },
  { provide: SecondaryLayer, attempts: 3, schedule: Schedule.exponential("500 millis") },
  { provide: FinalFallbackLayer },
);

const result = yield* Effect.withExecutionPlan(program, Plan);
// Stream.withExecutionPlan for streaming integrations (fallback after partial failure)
```

- Each step: `provide` (layer/context), `attempts`, `while`, `schedule`.
- Use `Schedule` when only timing changes and the same provider is used; use `ExecutionPlan` when
  the provider/layer changes across retry phases.

## Retry observability

- Keep retries inside named `Effect.fn` operations.
- Centralize retry policies as named constants instead of duplicating timing logic per call site.
- Log/annotate retry attempts at meaningful boundaries.

## Testing schedules

Test with `TestClock` and explicit time advancement — retry backoff and `Schedule.spaced` never
progress under `it.effect` unless you advance the clock. See `testing.md`.

## Anti-patterns

- Hand-written retry recursion or loops with mutable counters
- Sleep/backoff logic embedded directly in business code
- `Effect.forever` + manual `sleep` as a substitute for a schedule
- `ExecutionPlan` when a simple `Schedule` suffices
- Provider fallback encoded as nested `catch` chains
- Ignoring jitter when many clients retry concurrently
