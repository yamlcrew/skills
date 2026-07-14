# Streams

> When to read: creating, transforming, consuming, testing, or resource-managing `Stream`s —
> especially when the stream may be infinite or backpressured.

Streams are lazy, pull-based sequences of values that can be infinite. Handle with care.

## Create streams

```typescript
import { Chunk, Stream } from "effect";

Stream.make(1, 2, 3);                       // from values
Stream.fromIterable([1, 2, 3]);             // from iterable
Stream.fromEffect(fetchUser());             // single value from effect
Stream.repeatEffect(Effect.sync(() => Math.random())); // infinite from repeated effect
Stream.fromAsyncIterable(asyncGen(), (error) => new StreamError({ cause: error }));
Stream.fromChunk(Chunk.make(1, 2, 3));      // chunks for efficiency
Stream.fromSchedule(Schedule.spaced("1 second")); // tick stream
```

## Consume streams

```typescript
const all = yield* Stream.runCollect(stream);   // Chunk<A> — DANGEROUS on infinite streams
yield* Stream.runForEach(stream, (value) => Effect.log(`Got: ${value}`));
const sum = yield* Stream.runFold(stream, 0, (acc, n) => acc + n);
const first = yield* Stream.runHead(stream);    // Option<A>
yield* Stream.runDrain(stream);                 // side effects only, discard values
```

## Bound consumption (critical)

```typescript
// WRONG: hangs forever on an infinite stream
yield* Stream.runCollect(infiniteStream);

// RIGHT
yield* Stream.runCollect(Stream.take(infiniteStream, 100));
yield* Stream.runCollect(Stream.takeUntil(stream, (x) => x > 100));
yield* Stream.runCollect(Stream.takeWhile(stream, (x) => x < 100));
yield* Stream.runCollect(stream).pipe(Effect.timeout("5 seconds"));
```

## Transform streams

```typescript
Stream.map(stream, (x) => x * 2);
Stream.filter(stream, (x) => x > 0);
Stream.flatMap(userIds, (id) => Stream.fromEffect(fetchUser(id)));
Stream.mapEffect(stream, process, { concurrency: 10 }); // bounded effectful mapping
Stream.tap(stream, (x) => Effect.log(`Processing: ${x}`));
Stream.scan(stream, 0, (acc, x) => acc + x); // running fold, emits intermediates
```

## Chunking and batching

```typescript
Stream.grouped(stream, 100);                  // Stream<Chunk<A>> — chunks of N
Stream.groupedWithin(stream, 100, "1 second"); // by count or time window
Stream.rechunk(stream, 1000);                  // rechunk for performance with small items
```

## Errors in streams

```typescript
Stream.catchAll(stream, (error) => Stream.make(fallbackValue));
Stream.catchTag(stream, "NetworkError", () => Stream.empty);
Stream.retry(stream, Schedule.exponential("100 millis"));
```

Errors terminate the stream; use `catchAll`/`catchTag` to recover.

## Resource safety

```typescript
Stream.acquireRelease(acquire, release);          // bracket for streams
Stream.scoped(Effect.acquireRelease(open, close)); // released when the stream completes
Stream.ensuring(stream, cleanup);                  // finalizer
```

## Gotchas

1. **Infinite streams**: always bound consumption (`take`, `takeUntil`, timeout).
2. **Backpressure**: streams are pull-based; slow consumers automatically apply backpressure.
3. **Resource leaks**: use scoped/bracket patterns for resources.
4. **Chunking overhead**: rechunk for better performance with many small items.
5. **Tests**: a forked stream consumer that never ends is the classic test hang — bound it and
   interrupt fibers on all paths (see `testing.md`).
