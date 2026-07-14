# Concurrency and Resource Management

> When to read: fibers, bounded parallelism, Semaphore, Deferred, Latch, mutable state (Ref,
> SubscriptionRef), `acquireRelease`, `Scope`, finalizers.

## Bounded parallelism (critical)

Unbounded parallelism is the most common source of "too many open files" and
"connection timeout" crashes. Always specify concurrency when processing collections:

```typescript
// Process 1000 items, max 10 concurrent
const results = yield* Effect.all(items.map(processItem), { concurrency: 10 });
yield* Effect.forEach(items, processItem, { concurrency: 10 });
```

`{ concurrency: "unbounded" }` is acceptable only for small, known-size inputs or when another
mechanism (Semaphore) bounds the real work.

## Fibers

```typescript
const fiber = yield* Effect.fork(effect);   // run in background fiber
const result = yield* Fiber.join(fiber);    // wait for result
yield* Fiber.interrupt(fiber);              // cancel
Effect.race(effect1, effect2);              // first to complete wins
Effect.timeout(effect, "5 seconds");        // interrupt on timeout
```

Rules:

- Never leak fibers: interrupt or join them on all paths, or fork inside a `Scope`
  (`Effect.forkScoped`) so scope finalizers clean up.
- `Effect.fork` does **not** mean the fiber has started running — the scheduler may run it
  later. Coordination tests need explicit latches (see `testing.md`).
- Use `FiberHandle` / `FiberMap` / `FiberSet` to manage groups of child fibers.

## Semaphore — shared rate limiting

Use a Semaphore when multiple independent operations must share one global limit:

```typescript
const semaphore = yield* Effect.makeSemaphore(5); // max 5 concurrent

yield* Effect.all(
  requests.map((req) => semaphore.withPermits(1)(handleRequest(req))),
  { concurrency: "unbounded" }, // semaphore controls the real concurrency
);
```

## Deferred — one-shot signaling

```typescript
const signal = yield* Deferred.make<void>();

const worker = yield* Effect.fork(
  Effect.gen(function* () {
    yield* Deferred.await(signal); // wait for the signal
    yield* doWork();
  }),
);

yield* setup();
yield* Deferred.succeed(signal, undefined); // release the worker
yield* Fiber.join(worker);
```

Related primitives: `Latch` (gate concurrent progress), `Queue` (producer/consumer buffering),
`PubSub` (broadcast).

## State: Ref and friends

```typescript
const ref = yield* Ref.make(0);
yield* Ref.update(ref, (n) => n + 1);
const value = yield* Ref.get(ref);
// SynchronizedRef — updates that run effects atomically
```

Ref updates are atomic — safe across fibers. Do not use plain mutable variables for cross-fiber
state.

### SubscriptionRef — reactive references

```typescript
const ref = yield* SubscriptionRef.make(initial); // never use unsafeMake — may not exist in your version
yield* SubscriptionRef.set(ref, value);           // notifies subscribers
const changes = ref.changes;                       // Stream of value changes
```

## Resource management

`try/finally` bypasses Effect's interruption model — cleanup is not guaranteed when a fiber is
interrupted. Use the bracket pattern instead:

```typescript
// Acquire/release pair — release always runs (success, failure, interruption)
const withDatabaseConnection = Effect.acquireRelease(
  Effect.tryPromise(() => pool.connect()),
  (connection) => Effect.sync(() => connection.release()),
);

// One-shot bracket
Effect.acquireUseRelease(acquire, use, release);

// Scope boundary: everything acquired inside is released when the scope closes
const program = Effect.scoped(
  Effect.gen(function* () {
    const db = yield* managedConnection;
    const cache = yield* managedCache;
    // released in LIFO order when the scope closes: cache first, then db
    return yield* doWork(db, cache);
  }),
);

// Register extra cleanup in the current scope
yield* Effect.addFinalizer(() => Effect.log("cleanup"));
```

Rules:

- Forgetting `Effect.scoped` means resources stay open until the parent scope closes (often app
  shutdown).
- Release order is LIFO — acquire dependencies first.
- For services owning resources, put acquisition in `Layer.scoped` so the layer's lifetime owns
  the resource (see `services-layers.md`).
- Pooled/shared resources: `Pool`, `ScopedCache`, `RcRef`, `RcMap`.

## Common mistakes

- `Effect.all` without `{ concurrency: n }` on large arrays
- Forked fibers never joined/interrupted (use scopes)
- Deadlocks from circular Semaphore/Deferred dependencies
- `try/finally` instead of `acquireRelease`
- `Promise.all` inside an Effect codebase
- Manual `setTimeout` rate limiting instead of Semaphore/Schedule
