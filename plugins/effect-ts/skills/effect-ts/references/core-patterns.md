# Core Patterns

> When to read: constructors, `Effect.gen` vs `Effect.fn`, composition combinators, converting
> Promise/try-catch code, and run boundaries.

## Mental model

`Effect<A, E, R>` describes a computation that succeeds with `A`, fails with `E`, and requires
services `R`. Effect is the default representation for business workflows, service methods,
platform integrations, resource lifecycles, and tests. The dominant idiomatic usage:

1. `Effect.gen` for workflows and orchestration
2. `Effect.fn` for reusable effectful functions
3. Precise constructors: `succeed`, `fail`, `sync`, `try`, `tryPromise`
4. `map`, `flatMap`, `tap` for local transformations
5. Access services in implementations, `provide*` only at edges
6. `acquireRelease` / `scoped` for owned resources
7. `catchTag` / `match` for typed recovery
8. `run*` APIs only at runtime boundaries

## Before / after: converting plain TypeScript

```typescript
// Before (plain TS)
async function getUserData(userId: string, db: Database) {
  try {
    const user = await db.findUser(userId);
    const posts = await fetchPosts(user.id);
    return { user, posts };
  } catch (e) {
    throw new Error("Failed");
  }
}

// After (Effect): dependencies from context, typed errors, no try/catch
const getUserData = (userId: string) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const user = yield* db.findUser(userId);
    const posts = yield* fetchPosts(user.id);
    return { user, posts };
  });
```

## Creating effects

```typescript
Effect.succeed(value);     // pure success value
Effect.fail(error);        // expected typed failure
Effect.sync(fn);           // synchronous side effect that cannot throw
Effect.try(fn);            // synchronous code that may throw
Effect.tryPromise(fn);     // Promise boundary
```

Rule: pure value → `succeed`; expected failure → `fail`; sync non-throwing effect → `sync`;
sync throwing boundary → `try`; Promise boundary → `tryPromise`.

Wrap foreign failures into typed errors at the boundary:

```typescript
class FetchError extends Data.TaggedError("FetchError")<{ readonly cause: unknown }> {}

const fetchText = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(url).then((response) => response.text()),
    catch: (cause) => new FetchError({ cause }),
  });
```

## Composing effects

```typescript
Effect.map(effect, fn);       // transform success value
Effect.flatMap(effect, fn);   // next step returns another Effect
Effect.tap(effect, fn);       // side effect, preserves the main value
Effect.all([...effects], { concurrency: 10 });  // run many (bound it!)
Effect.forEach(items, fn, { concurrency: 10 }); // map items with effects

// Collect ALL errors (not just the first)
Effect.all([e1, e2, e3], { mode: "validate" });
// Either per element
Effect.all([e1, e2, e3], { mode: "either" });
// Partial success handling
Effect.partition([e1, e2, e3]); // [failures, successes]
```

Rule: outer workflow → `Effect.gen`; local transformation → `map` / `flatMap` / `tap`.

## `Effect.gen` for workflows

Use `Effect.gen` for orchestration and sequential workflows: multiple `yield*` steps, branching,
reading several services, implementing a layer or handler.

```typescript
const program = Effect.gen(function* () {
  const config = yield* AppConfig;
  const repo = yield* UserRepo;
  const user = yield* repo.getById("u_123");
  return { config, user };
});
```

## `Effect.fn` for reusable operations

Prefer `Effect.fn` for reusable business-logic functions that return `Effect` — even when the
function takes no arguments. It adds stack frames, creates spans automatically, and captures call
sites.

```typescript
const fetchUser = Effect.fn("fetchUser")(function* (id: string) {
  const db = yield* Database;
  return yield* db.query(id);
});
```

- Reusable operation → `Effect.fn`; inline workflow block → `Effect.gen`.
- If you do not want an explicit named span, use `Effect.fn` without a span name.
- `Effect.fnUntraced` is an escape hatch, not the default — use it only with a concrete, measured
  low-level reason (hot paths). It throws away free observability.

Good split:

```typescript
const loadUser = Effect.fn("loadUser")(function* (userId: string) {
  const repo = yield* UserRepo;
  return yield* repo.getById(userId);
});

const program = Effect.gen(function* () {
  const user = yield* loadUser("u_123");
  yield* Effect.logInfo("loaded user", user);
});
```

## Error handling combinators

```typescript
Effect.catchTag(effect, "UserNotFound", (e) => Effect.succeed(null)); // one tag
Effect.catchTags(effect, { A: handleA, B: handleB });                 // several tags
Effect.catchAll(effect, fn);       // all typed errors
Effect.orElse(effect, () => alt);  // fallback effect
Effect.result(effect);             // reify success/failure as a value
Effect.match(effect, { onFailure, onSuccess }); // fold into a plain value
```

See `error-handling.md` for the full model (failures vs defects vs interrupts).

## Runtime boundaries

Library and business code should **return** `Effect`; only entrypoints and integration
boundaries should **run** it.

```typescript
Effect.runPromise(program);  // leave Effect into Promise-based hosts
Effect.runFork(program);     // background fiber / long-running integration
Effect.runSync(program);     // sparingly; only when synchrony is guaranteed
```

- Never scatter `Effect.runPromise` mid-function — compose with `yield*` and run once at the edge.
- With multiple external entrypoints (HTTP handlers, cron jobs, queue consumers), prefer
  `ManagedRuntime.make(AppLayer)` and `runtime.runPromise(program)` per entrypoint. See
  `services-layers.md`.

## Durations

Effect accepts human-readable duration strings anywhere a `DurationInput` is expected — prefer
them over verbose constructors:

```typescript
Effect.sleep("5 minutes");
Effect.timeout(effect, "30 seconds");
Schedule.exponential("100 millis");
// Units: nanos, micros, millis, seconds, minutes, hours, days, weeks
```
