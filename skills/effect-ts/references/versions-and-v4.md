# Versions, Package Alignment, and Effect 4

> When to read: installing Effect, version questions, package alignment, anything involving the
> Effect 4 beta or v3→v4 migration. Last verified: 2026-07.

## Requirements

- TypeScript ≥ 5.4 with `"strict": true` in `tsconfig.json` (mandatory)
- Runtimes: Node.js, Deno (`deno add npm:effect`), Bun

## Effect 3.x — stable, production-recommended

- Core: `effect` (latest 3.21.4). Docs: <https://effect.website/docs>; monorepo:
  <https://github.com/Effect-TS/effect> (per-package `CHANGELOG.md` is the source of truth).
- v3 is in **feature freeze**: bug fixes and security patches continue; new features land only
  in v4.
- Ecosystem packages version independently (0.x). Known-good pairings as of mid-2026 (verify
  against the project's lockfile and changelogs — do not assume these are current):

| Package | Version (~2026-06) | Notes |
| --- | --- | --- |
| `effect` | 3.21.4 | generic `$match` for `Data.taggedEnum`; closed `Schema.Never` records (3.21.3) |
| `@effect/platform` | 0.96.x | `HttpLayerRouter.addHttpApi` applies API-level middleware |
| `@effect/sql` | 0.51.x | `SqlSchema` row decoding helpers |
| `@effect/rpc` | 0.75.x | `RpcSerialization.makeMsgPack(options)` |
| `@effect/ai` | 0.36.x | `Tool.EmptyParams`, omitted tool parameters |
| `@effect/ai-openai` | 0.40.x | `strict` handling, `"in_memory"` prompt-cache enum |
| `@effect/cluster` | 0.59.x | shard group routing fixes |
| `@effect/workflow` | 0.18.x | child workflow parent pointer with `discard: true` |
| `@effect/vitest` | matches vitest major | `it.effect`, `layer(...)` |

Install only the packages the runtime and task actually need; keep `@effect/*` versions mutually
compatible (consult each package's peer range on `effect`).

## Effect 4 — beta

Status (July 2026): `effect@4.0.0-beta.*` — API largely stable but breaking changes still
possible; developed in <https://github.com/Effect-TS/effect-smol> (v4 issues/PRs go there).
Announcement: <https://effect.website/blog/releases/effect/40-beta/>. v4 will be an LTS release.

Install: `npm install effect@beta`. If any `@effect/*` package is installed alongside, all must
use matching v4 versions — v4 introduces **unified versioning** (every ecosystem package shares
one version number and releases together).

What changed:

- **Rewritten runtime** — lower memory overhead, faster execution; minimal bundles dropped from
  ~70 kB to ~20 kB.
- **Consolidated core** — functionality from `@effect/platform`, `@effect/rpc`,
  `@effect/cluster`, AI, HTTP, SQL core, workflow, etc. now lives inside `effect` under
  `effect/unstable/*` module paths (`effect/unstable/http`, `effect/unstable/httpapi`,
  `effect/unstable/rpc`, `effect/unstable/sql`, `effect/unstable/ai`, `effect/unstable/cluster`,
  `effect/unstable/workflow`, ...). Only platform-/provider-/technology-specific implementations
  remain separate (`@effect/platform-node|bun|browser`, `@effect/sql-*`, `@effect/opentelemetry`,
  `@effect/vitest`).
- **`effect/unstable/*` semantics** — unstable modules may break in minor releases before
  graduating to stable.
- **Testing moved into core** — `effect/testing` provides `TestClock`, `TestConsole`,
  `FastCheck`, `TestSchema`.
- The core programming model (`Effect`, `Layer`, `Schema`, `Stream`) is unchanged. Official
  migration guides: "v3 to v4 Migration Guide" and "Schema v4 Migration Guide" (Schema was
  significantly rewritten).

## v3 ↔ v4 API differences cheat sheet

Detect the major version from `package.json` before writing code. Differences you will hit
first:

| Concern | Effect 3.x | Effect 4 (beta) |
| --- | --- | --- |
| Service definition | `Context.Tag("Id")<Self, Shape>()`, `Effect.Service` | `Context.Service<Self, Shape>()("Id")` class syntax (optional inferred `make`) |
| Layer with resources | `Layer.scoped(Tag, acquire)` | `Layer.effect(Tag)(acquire)` (scoped built in; `Layer.scoped` removed) |
| Startup-only layer | `Layer.effectDiscard` (exists) | `Layer.effectDiscard` for scoped startup effects without a service |
| Schema-backed tagged error | `Schema.TaggedError<Self>()("Tag", fields)` | `Schema.TaggedErrorClass<Self>()("Tag", fields)`; also `Schema.ErrorClass` |
| Schema decode effect | `Schema.decodeUnknown(schema)` (returns Effect) | `Schema.decodeUnknownEffect(schema)`; failure type is `SchemaError` (was `ParseError`) |
| Schema unions | `Schema.Union(A, B)` (variadic) | `Schema.Union([A, B])` (array) |
| Optional struct fields | `Schema.optionalWith(s, { exact: true })` | `Schema.optionalKey(s)` (exact key) vs `Schema.optional(s)` (`T \| undefined`) |
| Schema class construction | `new X(...)` or `X.make(...)` | prefer `X.make(...)` |
| Foreign-error field | `Schema.Defect` (exists) | `Schema.Defect` / `Schema.DefectWithStack` in error schemas |
| Full-cause handling | `Effect.catchAllCause` | `Effect.catchCause` / `Effect.matchCause` |
| Service access helper | `Tag` yieldable, `Effect.serviceOption` etc. | `yield* Service` or `Effect.service(Service)` |
| Arbitrary / JSON Schema | `Arbitrary.make`, `JSONSchema.make` | `Schema.toArbitrary`, `Schema.toJsonSchemaDocument` |
| Test services import | `effect` + `@effect/vitest` | `effect/testing` (`TestClock`, `FastCheck`, ...) + `@effect/vitest` |
| Metrics on functions | `Metric.increment` inside body | also `Effect.track(metric)` as `Effect.fn` post-processing |

v4-only notes that do NOT apply to v3 code: `ExecutionPlan.CurrentMetadata`,
`Schedule.CurrentMetadata`, `Layer.mock`, `Effect.forkChild`, partitioned semaphores, Tx*
(STM-integrated) modules, `Optic`, `Result` (sync success/failure type).

## Practical rules

1. Default new production projects to stable v3 unless the user explicitly wants the v4 beta.
2. Never mix v3 and v4 idioms in one codebase; follow whatever the project already uses.
3. When upgrading within v3, read the package changelogs — this file's version table goes stale.
4. When asked about v4 migration, point at the official migration guides and the
   `effect-smol` repo rather than guessing renamed APIs.
