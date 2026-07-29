# effect-ts

Senior engineer for Effect (Effect-TS), the typed functional TypeScript framework — services and
layers, typed errors, Schema, concurrency, streams, testing, SQL, and ecosystem integrations.

## What it covers

One `effect-ts` skill: a routing `SKILL.md` (version context, workflow, critical-rules digest)
plus 16 reference docs:

| Reference | Covers |
| --- | --- |
| `critical-rules.md` | The anti-patterns that cause most Effect bugs (try/catch in gen, `yield` vs `yield*`, throw-as-defect, unbounded parallelism, type escapes) |
| `core-patterns.md` | Constructors, `Effect.gen` vs `Effect.fn`, composition, run boundaries |
| `services-layers.md` | `Context.Tag` / `Effect.Service`, Layer composition and memoization, DI, `ManagedRuntime` |
| `error-handling.md` | Failures vs defects vs interrupts, tagged errors, wrapping foreign errors, accumulation |
| `schema.md` | Decode at the boundary, Class variants, transformations, branded types, JSON Schema |
| `config.md` | `Config`, `Redacted` secrets, `ConfigProvider` |
| `concurrency-resources.md` | Fibers, Semaphore, Deferred, Ref, `acquireRelease`, `Scope` |
| `scheduling-retries.md` | `Effect.retry`/`repeat`, `Schedule` policies, backoff, jitter, cron, `ExecutionPlan` |
| `streams.md` | Stream creation/consumption, bounding, backpressure, resource safety |
| `testing.md` | `@effect/vitest`, `TestClock`, shared `layer(...)`, property tests, concurrency-test determinism |
| `observability.md` | `Effect.fn` spans, logging, metrics, OpenTelemetry layers |
| `data-and-collections.md` | `Array`/`Record`/`Order` helpers, `Option` vs `null`, `Match`, tagged enums |
| `sql.md` | `@effect/sql`: schema-decoded rows, repositories, transactions, resolvers, migrations |
| `platform-http-rpc-ai.md` | `@effect/platform`, HttpApi, `@effect/rpc`, `@effect/ai` tools |
| `react-integrations.md` | effect-atom, `@prb/effect-next` |
| `versions-and-v4.md` | v3 package landscape, Effect 4 beta, v3↔v4 API cheat sheet |

Guidance targets stable **Effect 3.x** (production-recommended) and flags the **Effect 4 beta**
differences explicitly, so the skill adapts to whichever major version a project uses.

## Install

Claude Code marketplace:

```
/plugin marketplace add yamlcrew/skills
/plugin install effect-ts@yamlcrew
```

skills.sh (50+ agents):

```
npx skills add yamlcrew/skills/effect-ts
```
