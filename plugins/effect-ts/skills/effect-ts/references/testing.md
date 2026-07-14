# Testing with @effect/vitest

> When to read: `@effect/vitest`, `it.effect`, `TestClock`, shared layers in tests, property
> tests, testing retries/streams/fibers/scoped resources.

## Preferred rule

Test Effect code with `@effect/vitest`, not manual `Effect.runPromise` inside plain Vitest tests.

```typescript
import { assert, describe, it, layer } from "@effect/vitest";
import { Effect } from "effect";
```

`@effect/vitest` re-exports Vitest, so it is the normal entrypoint for test APIs.

## Test modes — decision table

| Situation | Use |
| --- | --- |
| Ordinary Effect test (default) | `it.effect` |
| Uses timeouts / sleeps / retries / polling | `it.effect` + `TestClock.adjust(...)` |
| Needs wall clock, Node timers, real delays | `it.live` (or `it.scopedLive`) |
| Allocates scoped resources that must be finalized | `it.scoped` / `it.scopedLive` |
| Group of tests sharing one layered setup | `layer(...)` |
| Nested group needing extra dependencies | `it.layer(...)` |

Standard variants work on all modes: `it.effect.each`, `.skip`, `.skipIf`, `.runIf`, `.only`,
`.fails` — return an `Effect` from the test body.

## The #1 gotcha: `it.effect` uses TestClock

`it.effect` runs with a TestContext including **TestClock**: time starts at 0 and does **not**
pass unless you advance it. Any `Effect.sleep`, `Schedule.spaced`, retry backoff, or polling loop
**stalls forever** unless you call `TestClock.adjust(...)`.

```typescript
// Instead of waiting real time:
yield* TestClock.adjust("50 millis");
```

Testing retries/backoff/scheduled loops — fork, advance, join:

```typescript
const runWithTime = <A, E, R>(effect: Effect.Effect<A, E, R>, adjust = "1000 millis" as const) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(effect);
    yield* TestClock.adjust(adjust);
    return yield* Fiber.join(fiber);
  });
```

Advance enough time for the whole schedule/backoff chain to complete.

## Don't use `Date.now()` in Effect code

Production code using `Date.now()` cannot be tested deterministically under TestClock. Use the
clock service — `Clock.currentTimeMillis`, `Clock.currentTimeNanos`, or `DateTime.now`:

```typescript
const program = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis;
  return now;
});
```

## Don't escape the test runtime

Never call `Effect.runPromise(...)` inside an `it.effect` program to drive internal logic — it
runs work on a different runtime (live clock), defeating TestClock determinism. Pass `Effect`s
around and `yield*` them; a Promise boundary belongs at the test boundary only.

## Shared layers: `layer(...)` and `it.layer(...)`

The preferred alternative to `.pipe(Effect.provide(...))` inside each test body:

```typescript
describe("TodoService", () => {
  layer(TodoService.inMemoryLayer)((it) => {
    it.effect("creates and lists todos", () =>
      Effect.gen(function* () {
        const service = yield* TodoService;
        yield* service.create("write tests");
      }),
    );

    it.effect("removes todos", () =>
      Effect.gen(function* () {
        const service = yield* TodoService;
        const todo = yield* service.create("close issue");
        yield* service.remove(todo.id);
      }),
    );
  });
});
```

Internals: the layer is built once per group, memoized, kept open for the group, and closed in
`afterAll` — shared setup/teardown stays explicit.

Rules:

1. Multiple tests share the same layered setup → `layer(...)`.
2. A nested group needs extra dependencies → `it.layer(...)` (reuses the parent memo map).
3. Tests need isolated layer instances per test → multiple separate `it.layer(...)` calls.
4. Local `Effect.provide(...)` in a test body is a one-off edge case, not the normal pattern.

Options on top-level `layer(...)`: `timeout`, `memoMap`, and `excludeTestServices: true` (drop
the TestClock/TestConsole overrides for the group).

## Property tests

- `it.prop` — non-Effect property tests with explicit FastCheck arbitraries only (passing a
  `Schema` throws).
- `it.effect.prop` — Effect property tests; **does** support `Schema` inputs (converted via
  Arbitrary). Prefer it when the test needs Effect, services, or scope.

```typescript
it.effect.prop("symmetry", [FastCheck.integer(), FastCheck.integer()], ([a, b]) =>
  Effect.gen(function* () {
    assert.strictEqual(a + b, b + a);
  }),
);
```

## Concurrency gotcha: fork does not mean started

`Effect.fork` creates and schedules a fiber — it may not run until later. If a test forks fibers
and immediately opens a gate (`Deferred.succeed`), the "concurrent" test can become effectively
sequential and assertions fail intermittently.

Deterministic pattern — a `started` latch plus a `gate`:

```typescript
Effect.gen(function* () {
  let executions = 0;
  const started = yield* Deferred.make<void>();
  const gate = yield* Deferred.make<void>();

  const underlying = Effect.gen(function* () {
    executions++;
    yield* Deferred.succeed(started, undefined); // signal actual start
    yield* Deferred.await(gate);                 // block to force overlap
    return "ok";
  });

  const f1 = yield* Effect.fork(underlying);
  const f2 = yield* Effect.fork(underlying);

  yield* Deferred.await(started);                // don't open until a fiber is in
  yield* Deferred.succeed(gate, undefined);
  yield* Fiber.join(f1);
  yield* Fiber.join(f2);
  // now safe to assert overlap / dedup / sharing
});
```

## Streams, watches, background fibers: bound + cleanup

Most Effect test hangs come from: an infinite stream consumed with `runCollect`, a forked
polling loop never interrupted, or a scoped resource whose scope never closes.

- Prefer bounded consumption: `Stream.take` / `Stream.takeUntil`.
- Interrupt forked fibers on all paths, or run them in a `Scope`.
- Consider `Effect.timeout(...)` around anything that could block.
- Use `it.scoped` when the test allocates scoped resources so finalizers are guaranteed.

## flakyTest

`flakyTest` wraps a test in retry-with-timeout semantics. Use it only for genuinely flaky
integration-style conditions — never to hide deterministic failures.

## Assertions

Prefer `assert` (`assert.strictEqual`, `assert.isTrue`, `assert.include`) inside Effect test
bodies for uniformity. Exit-based assertions:

```typescript
const exit = yield* Effect.exit(program);
assert.isTrue(Exit.isFailure(exit));
```

## Anti-patterns

- Plain `it(...)` + `Effect.runPromise` for normal Effect tests
- `it.live` by default when `it.effect` suffices
- Manually building/tearing down layer graphs instead of `layer(...)`
- Top-level `it.prop` with `Schema` inputs
- `flakyTest` to hide deterministic failures
- `Date.now()` in code under test
