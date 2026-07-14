# Error Handling

> When to read: defining error types, `catchTag` / `catchTags` / `match`, defects vs failures vs
> interrupts, wrapping foreign errors, error accumulation.

## Mental model — three failure modes

Effect distinguishes (explicitly, via `Cause`):

- **Failure**: expected, typed errors in the `E` channel of `Effect<A, E, R>`
- **Defect**: unexpected unchecked failures (`Cause.Die`) — bugs, broken invariants
- **Interrupt**: cooperative cancellation (`Cause.Interrupt`)

Do not model expected business failures as defects, and do not treat interrupts as ordinary
failures.

## Defining errors

Preference order:

1. **`Schema.TaggedError`** (v3; `Schema.TaggedErrorClass` in v4) — when the error crosses
   module, API, persistence, or serialization boundaries. Gives tagged matching plus
   Schema-derived validation, encode/decode, annotations, and type guards.
2. **`Data.TaggedError`** — internal-only errors whose payload is not meaningfully serializable
   or schema-shaped.

```typescript
import { Data, Effect, Schema } from "effect";

// Schema-backed (boundary/protocol errors) — v3 API
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", {
  userId: UserId,
}) {
  get message() {
    return `User not found: ${this.userId}`;
  }
}
const isUserNotFound = Schema.is(UserNotFound);

// Lightweight internal errors
class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string;
}> {}
```

Tagged errors are yieldable directly:

```typescript
const getUser = (id: string): Effect.Effect<User, UserNotFound | DatabaseError> =>
  Effect.gen(function* () {
    const result = yield* queryDatabase(id);
    if (!result) return yield* new UserNotFound({ userId: id });
    return result;
  });
```

Keep `_tag` names stable and descriptive.

## Wrapping foreign errors

When an error comes from a library, runtime API, or generic `Error`, wrap it in a typed error and
preserve the original in a `cause` field — do not leak the foreign error through your domain or
protocol boundary, and never `catch: (cause) => cause as Error`.

```typescript
class TodoStorageError extends Schema.TaggedError<TodoStorageError>()("TodoStorageError", {
  operation: Schema.String,
  cause: Schema.Defect, // preserves the encoded foreign failure
}) {}

const loadTodo = (id: number) =>
  Effect.try({
    try: () => someLibraryCall(id),
    catch: (cause) => new TodoStorageError({ operation: "loadTodo", cause }),
  });
```

Why: the app keeps a typed error contract, the original failure is preserved for diagnostics,
schema-aware transports can encode/decode it, and business code stays decoupled from raw library
error shapes.

## Handling failures

```typescript
// One tag
const recovered = program.pipe(
  Effect.catchTag("UserNotFound", (error) => Effect.succeed({ id: error.userId, guest: true })),
);

// Several tags at once
const recovered2 = program.pipe(
  Effect.catchTags({
    UserNotFound: () => Effect.succeed(null),
    InvalidPayload: (error) => Effect.succeed({ error: error.reason }),
  }),
);

// Predicate/refinement-based subsets
Effect.catchIf(program, isRetryable, handle);

// Fold the error channel into a value
const outcome = program.pipe(
  Effect.match({
    onFailure: (error) => ({ ok: false as const, error }),
    onSuccess: (value) => ({ ok: true as const, value }),
  }),
);
```

For long `catchTag` chains, prefer `Match` (see `data-and-collections.md`):

```typescript
Effect.catchAll(effect, (error) =>
  Match.value(error).pipe(
    Match.tag("A", handleA),
    Match.tag("B", handleB),
    Match.exhaustive, // compile error if a case is missing
  ),
);
```

Prefer `catchTag` over blanket `catchAll` — a generic `catchAll` swallows errors you did not
intend to handle.

## Error accumulation

`Effect.all` short-circuits at the first error by default. To collect failures:

```typescript
// All-or-nothing with all failures reported
yield* Effect.all([validateEmail(data.email), validateAge(data.age)], { mode: "validate" });

// Either per element
const results = yield* Effect.all(effects, { mode: "either" });
const errors = results.filter(Either.isLeft).map((e) => e.left);

// Split into [failures, successes]
const [failures, successes] = yield* Effect.partition(items, processItem);
```

## Schema errors at the boundary

Decode external input with Schema effects; convert `ParseError` into a domain or transport error
near the boundary, and keep the rest of the application on domain errors:

```typescript
class InvalidRequestBody extends Data.TaggedError("InvalidRequestBody")<{
  readonly message: string;
}> {}

const decodeUser = (input: unknown) =>
  Schema.decodeUnknown(UserPayload)(input).pipe(
    Effect.mapError((error) => new InvalidRequestBody({ message: String(error) })),
  );
```

Do not leak schema parse errors deep into domain code.

## Handling defects

Defects come from `Effect.die`, unchecked exceptions in effectful code, and broken invariants.
Use them for impossible states and programmer errors — never for expected validation or
business-rule failures.

- `Effect.sandbox` exposes `Cause<E>` in the error channel for inspection.
- `Effect.matchCause` / `Effect.matchCauseEffect` distinguish failures, defects, and interrupts.
- Recover from defects only at clear boundaries (worker/RPC boundary, CLI top level, HTTP server
  adapter): log/report the defect, translate to a safe external error, and do not continue as if
  it were a normal domain failure.
- `Effect.orDie` marks an error channel as unrecoverable from that point on. Appropriate only
  when the failure has already been validated as impossible — never just to silence a type you do
  not want to handle.

## Handling interrupts

Interrupts are cancellation, not business failure.

- `Effect.interrupt` stops work cooperatively.
- `Effect.onInterrupt(effect, cleanup)` for interrupt-specific cleanup.
- Inspect `Cause` (e.g. `Cause.isInterrupted`) only when interrupts must be distinguished —
  suppressing logs for normal cancellation, keeping retries for failures but not cancellations.
- Avoid patterns that collapse all causes into a single error value too early.

## Anti-patterns

- Defects for expected validation or business-rule failures
- Converting every error immediately to `unknown` or `string` (loses diagnostics)
- `orDie` to avoid handling expected errors
- Treating interrupts as ordinary business failures
- Leaking schema parse errors deep into domain code
- `catchAllCause` for routine error mapping (hides defects) — see `critical-rules.md`
