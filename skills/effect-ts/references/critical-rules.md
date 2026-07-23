# Critical Rules and Anti-Patterns

> When to read: always, before editing any nontrivial Effect code.

These rules address the mistakes that cause most Effect bugs: resource leaks, process crashes,
swallowed errors, and untestable code.

## Quick anti-pattern table

| Anti-pattern | Bad | Good | Why |
| --- | --- | --- | --- |
| Run outside boundary | `await Effect.runPromise(fx)` mid-function | `yield* fx` (compose) | Bypasses error channel, tracing, interruption |
| Missing `yield*` | `const user = yield fetchUser()` | `const user = yield* fetchUser()` | Bare `yield` returns the Effect object, not the result |
| Throwing errors | `if (!ok) throw new Error()` | `return yield* Effect.fail(new NotOk())` | `throw` creates a defect (crash), not a typed error |
| Unbounded parallelism | `Effect.all(tasks, { concurrency: "unbounded" })` on large input | `Effect.all(tasks, { concurrency: 10 })` | Prevents OOM and rate-limit exhaustion |
| Ignoring errors | `Effect.runPromise(fx)` with no handling | `fx.pipe(Effect.catchTag(...))` before the run boundary | Unhandled rejections |
| Manual cleanup | `try { ... } finally { cleanup() }` | `Effect.acquireRelease(...)` | `finally` does not survive fiber interruption |
| Type escapes | `value as any` / `as never` / `as unknown` | proper generics, decode at boundary | Hides real type errors |

## INEFFECTIVE: try/catch in Effect.gen

Effect failures are returned as exits, not thrown as JavaScript exceptions. A `try/catch` inside
`Effect.gen` only catches synchronous throws from non-Effect code — Effect failures bypass it
entirely.

```typescript
// Problematic: catch block never sees Effect failures
Effect.gen(function* () {
  try {
    const result = yield* someEffect;
  } catch (error) {
    // never reached for Effect failures
  }
});

// Correct
Effect.gen(function* () {
  const result = yield* Effect.result(someEffect);
  if (result._tag === "Failure") {
    // handle error case
  }
});
```

Alternative patterns:

- `Effect.catchAll` / `Effect.catchTag` for error recovery
- `Effect.result` to inspect success/failure
- `Effect.tryPromise` / `Effect.try` for wrapping external throwing code

## The `yield` vs `yield*` trap

```typescript
// BAD: missing *, yields the Effect object itself
const bad = Effect.gen(function* () {
  const user = yield fetchUser(id); // user is an Effect, not a User!
});

// GOOD: yield* executes the Effect
const good = Effect.gen(function* () {
  const user = yield* fetchUser(id);
});
```

## RECOMMENDED: `return yield*` for error branches

The runtime halts on failed yields regardless of `return`, but the explicit `return` makes
termination obvious and prevents unreachable-code confusion.

```typescript
Effect.gen(function* () {
  if (!user) {
    return yield* Effect.fail(new UserNotFound({ userId }));
  }
  if (shouldInterrupt) {
    return yield* Effect.interrupt;
  }
  return yield* someOtherEffect;
});
```

Tagged errors are yieldable directly — no `Effect.fail` wrapper needed:

```typescript
if (!user) {
  return yield* new UserNotFoundError({ userId });
}
```

## AVOID: plain `Error` in the Effect error channel

Do not model expected failures as `Error` in `Effect.Effect<A, Error, R>`. It erases domain
information and weakens `catchTag`, `Match`, API error mapping, and serialization.

```typescript
// Avoid
Effect.fail(new Error("User not found"));

// Prefer for domain/API errors (v3)
class UserNotFound extends Schema.TaggedError<UserNotFound>()("UserNotFound", { userId: UserId }) {}
Effect.fail(new UserNotFound({ userId }));
```

Use `Data.TaggedError` for internal errors that do not need Schema decoding, encoding,
annotations, or HTTP/OpenAPI integration. See `error-handling.md`.

## AVOID: `catchAllCause` for error mapping

`Cause` includes both expected failures and defects. Mapping it into a normal error hides bugs
that should stay defects.

```typescript
// Avoid: catches defects too
effect.pipe(Effect.catchAllCause((cause) => Effect.fail(new RepositoryError({ cause }))));

// Prefer: transform only expected errors
effect.pipe(Effect.mapError((error) => new RepositoryError({ cause: error })));
```

Reach for `catchAllCause` only when you intentionally need full cause inspection at a
runtime/reporting boundary.

## AVOID: silent error swallowing

If a side effect matters, let its failure remain visible in the error channel. Audit logging,
billing, persistence, security checks, and notification guarantees should not quietly become
`Effect.void`.

```typescript
// Avoid for important side effects
yield* audit.log(entry).pipe(Effect.catchTag("AuditLogError", () => Effect.void));

// Prefer: propagate or map the error
yield* audit.log(entry).pipe(Effect.mapError((error) => new CreateUserError({ cause: error })));
```

Fallback values are fine for optional queries; swallowing side-effect failures is not.

## AVOID: Effect wrappers around safe pure code

`Effect.try` and `Effect.tryPromise` are boundary constructors. Do not wrap ordinary pure
transformations just to make them "Effect-shaped".

```typescript
// Avoid
const names = Effect.try(() => users.map((user) => user.name));

// Prefer
const names = users.map((user) => user.name);
```

Use `Effect.sync` for synchronous effects with observable side effects, and `Effect.try` only for
code that can throw. Keep pure helpers, constants, and path manipulation pure unless an Effect
boundary provides a concrete dependency, testability, resource-safety, or error-model benefit.

## AVOID: type assertions

`as never`, `as any`, and `as unknown` break type safety and hide real type errors.

- Use proper generic type parameters and Effect combinators.
- If a value comes from an external boundary, validate or decode it (Schema) instead of asserting.
- If a type is hard to express, simplify the design or introduce a properly typed helper.
- Never use `namespace`; for layers prefer `static` members on the service class or plain exported
  layer constants.

Occasional assertions may be justified when interfacing with poorly-typed external libraries —
document the reason.

## Error taxonomy

| Category | Examples | Handling |
| --- | --- | --- |
| Expected rejections | User cancel, deny | Graceful exit, no retry |
| Domain errors | Validation, business rules | Show to user, don't retry |
| Defects | Bugs, broken invariants | Log + alert, investigate |
| Interruptions | Fiber cancel, timeout | Cleanup, may retry |
| Unknown/foreign | Thrown exceptions | Normalize at boundary |

```typescript
// Normalize unknown errors at a boundary
const safeBoundary = Effect.catchAllDefect(effect, (defect) => Effect.fail(new UnknownError({ cause: defect })));

// Catch user-initiated cancellations separately
Effect.catchTag(effect, "UserCancelledError", () => Effect.succeed(null));

// Handle interruptions differently from failures
Effect.onInterrupt(effect, () => Effect.log("Operation cancelled"));
```

## Null vs Option rule

Use `Option<T>` internally, `T | null` at boundaries (React state/props, JSON serialization,
external API responses). Normalize once at the boundary with `Option.fromNullable` /
`Option.getOrNull`. See `data-and-collections.md`.

## Rationalization table

| Excuse | Reality |
| --- | --- |
| "It's only 100 items" | 100 items today, 10,000 tomorrow. Bound concurrency now. |
| "I'll use `concurrency: 'unbounded'` to make it fast" | Fast = crash. Always bound parallelism for external resources. |
| "I'll just `throw` for now" | `throw` bypasses the error channel and makes code untestable. |
| "It's easier to run the effect right here" | Running mid-code loses context, tracing, and interruption safety. |

## Red flags — stop and reconsider

- `Effect.runPromise` or `Effect.runSync` inside a loop or helper function
- `Effect.all` without a `concurrency` option on large lists
- `throw` inside an `Effect.gen` block
- `yield` without `*` when calling an Effect
- `Promise.all` inside an Effect codebase
- Manual `setTimeout` for rate limiting instead of `Schedule` or `Semaphore`
