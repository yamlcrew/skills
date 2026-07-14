---
name: effect-ts
description: >-
  Use this skill whenever working with Effect (Effect-TS) in TypeScript: any file importing from
  "effect" or "@effect/*", Effect.gen / yield* code, services and Layers, Context.Tag, typed errors
  (Data.TaggedError / Schema.TaggedError), Schema validation, Stream, Fiber/concurrency, Scope and
  resource management, Schedule/retry, Config, @effect/vitest tests, @effect/sql, @effect/platform,
  @effect/rpc, @effect/ai, effect-atom, or questions about Effect patterns, migration to Effect,
  or Effect 4. Also use it when refactoring Promise/try-catch code into Effect.
---

# Effect-TS Senior Engineer

Act as a senior engineer who knows Effect inside out. Apply Effect semantics using the local
project's patterns first, then the task-specific reference below, then upstream sources — never
guess APIs from memory.

## Version context (July 2026)

- **Stable: `effect` 3.21.x** (latest 3.21.4). This is the production-recommended line and the
  default for all guidance in this skill. Requires TypeScript ≥ 5.4 with `"strict": true`.
- **Beta: Effect 4** (`effect@4.0.0-beta.*`, developed in
  [Effect-TS/effect-smol](https://github.com/Effect-TS/effect-smol)). Rewritten runtime, unified
  ecosystem versioning, most `@effect/*` packages consolidated into core `effect` with
  `effect/unstable/*` modules. v3 is feature-frozen (fixes only); new features land in v4.
- Several APIs differ between v3 and v4 (`Schema.TaggedError` vs `Schema.TaggedErrorClass`,
  `Context.Tag` vs `Context.Service`, `Layer.scoped` vs `Layer.effect`, …). **Detect which major
  version the project uses from its `package.json` before writing code**, and read
  `references/versions-and-v4.md` when anything version-sensitive comes up.

## Workflow

1. Inspect the project: `effect` version in `package.json`, neighboring services, layers, errors,
   schemas, runtime boundaries, and tests. If Effect patterns already exist, follow them.
2. Read `references/critical-rules.md` before editing any Effect code.
3. Read only the matching references from the routing table below.
4. Implement the least surprising pattern consistent with local code.
5. Verify with the narrowest typecheck/test that exercises the changed semantics.

Do not activate the full workflow merely because a file imports `effect` — trivial edits that do
not touch Effect semantics need no research.

## Task routing

| Task | Read |
| --- | --- |
| Any nontrivial Effect edit (always) | `references/critical-rules.md` |
| Constructors, `Effect.gen` vs `Effect.fn`, composition, run boundaries | `references/core-patterns.md` |
| Services, `Context.Tag` / `Effect.Service`, Layer composition, DI, `ManagedRuntime` | `references/services-layers.md` |
| Typed errors, defects, interrupts, `catchTag`, wrapping foreign errors | `references/error-handling.md` |
| Schema: decode/encode, classes, transformations, branded types, JSON Schema | `references/schema.md` |
| Config and secrets (`Config`, `Redacted`, `ConfigProvider`) | `references/config.md` |
| Fibers, bounded parallelism, Semaphore, Deferred, Ref, Scope, `acquireRelease` | `references/concurrency-resources.md` |
| Retry, repeat, backoff, cron, `Schedule`, `ExecutionPlan` fallback | `references/scheduling-retries.md` |
| Streams: creation, consumption, backpressure, resource safety | `references/streams.md` |
| Tests: `@effect/vitest`, `it.effect`, `TestClock`, shared `layer(...)`, property tests | `references/testing.md` |
| Tracing, spans, logging, metrics, OpenTelemetry | `references/observability.md` |
| `Array`/`Record`/`Order` helpers, `Option` vs `null`, `Match` pattern matching | `references/data-and-collections.md` |
| `@effect/sql`: schema-decoded rows, repositories, transactions, migrations | `references/sql.md` |
| `@effect/platform`, HttpApi, `@effect/rpc`, `@effect/ai` | `references/platform-http-rpc-ai.md` |
| React state (effect-atom), Next.js (`@prb/effect-next`) | `references/react-integrations.md` |
| Version questions, package alignment, Effect 4 beta, migration | `references/versions-and-v4.md` |

## Critical rules digest

The 10 rules that prevent most Effect bugs (details in `references/critical-rules.md`):

1. `try/catch` inside `Effect.gen` does NOT catch Effect failures — use `Effect.catchTag`,
   `Effect.catchAll`, or `Effect.result`.
2. Always `yield*`, never bare `yield`, inside `Effect.gen` — bare `yield` returns the Effect
   object, not its result.
3. Use `return yield* Effect.fail(...)` (or `return yield* new MyError(...)`) for error branches —
   explicit termination.
4. Never `throw` inside Effect code for expected failures — `throw` creates a defect (crash), not
   a typed error.
5. Bound parallelism: `Effect.all(effects, { concurrency: n })` — the default is sequential, but
   `"unbounded"` on large inputs exhausts resources.
6. Run effects once at the boundary (`Effect.runPromise` at the entrypoint / `ManagedRuntime`),
   never scattered mid-function.
7. Use `Effect.acquireRelease` / `Effect.scoped` instead of `try/finally` — `finally` does not
   survive fiber interruption.
8. Model expected failures as tagged errors (`Data.TaggedError` internal, `Schema.TaggedError` at
   boundaries), never plain `Error` in the error channel.
9. Decode external data at the boundary with Schema; use `Option<T>` internally, `T | null` only
   at JSON/React/storage boundaries.
10. No `as any` / `as never` / `as unknown` escapes — fix the types, or decode instead of assert.

## Ground truth

When local patterns and these references do not resolve an API question, verify against:

- Docs: <https://effect.website/docs> (v3) — API reference: <https://effect-ts.github.io/effect/>
- Source: <https://github.com/Effect-TS/effect> (v3 monorepo, per-package `CHANGELOG.md`)
- Effect 4 beta: <https://github.com/Effect-TS/effect-smol> and
  <https://effect.website/blog/releases/effect/40-beta/>
- Compare the project's installed package version with the package changelog; do not assume this
  skill's last-known versions are current.
