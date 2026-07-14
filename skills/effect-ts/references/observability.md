# Observability

> When to read: `Effect.fn` spans, `withSpan`, logging, metrics, OpenTelemetry wiring.

## Mental model

Observable Effect code makes business operations visible by default: business logic shows up in
stack traces, important operations produce spans, logs inherit execution context, metrics attach
at meaningful boundaries.

The single most important practice: **prefer `Effect.fn(...)` for business logic** — it adds
stack frames, creates spans automatically, and keeps operations observable with zero
boilerplate.

## `Effect.fn` as the default

```typescript
const loadUser = Effect.fn("loadUser")(function* (userId: string) {
  return { id: userId, name: "Ada" };
});
```

- One named `Effect.fn` per meaningful operation: domain operations, application services,
  handlers, workflows, repository calls.
- Span names represent business operations (`loadUser`, `chargeInvoice`,
  `syncGithubInstallation`) — not `helper`, `run`, `process`, `step1`.
- No explicit span name wanted → `Effect.fn` without a name (keeps stack traces and traced
  behavior).
- `Effect.fnUntraced` only for measured hot-path reasons — never the default.

## Explicit spans

```typescript
const syncUser = Effect.fn("syncUser")(function* (userId: string) {
  const profile = yield* fetchProfile(userId).pipe(Effect.withSpan("fetchProfile"));
  return yield* persistProfile(profile).pipe(Effect.withSpan("persistProfile"));
});
```

- `Effect.withSpan` — nested sub-operation spans, instrumenting existing pipelines.
- `Effect.withSpanScoped` — span stays open for a scope's lifetime (long-lived
  resource/streaming workflows).
- `Effect.withParentSpan` — continue an externally created span (framework boundaries).

Do not hand-instrument every helper: start with `Effect.fn`, add `withSpan` only where extra
detail is useful, add metrics at meaningful boundaries.

## Span enrichment

```typescript
const loadUser = Effect.fn("loadUser")(function* (userId: string) {
  yield* Effect.annotateCurrentSpan({ userId });
  return { id: userId, name: "Ada" };
});
```

Good annotations: stable identifiers, domain-relevant keys, request/resource IDs, small
structured values. Avoid: giant payloads, secrets, noisy transient data.

## Logging

Use Effect logging inside effects — it integrates with the current execution context:

```typescript
yield* Effect.logDebug("loading user", { userId });
// Effect.log / logInfo / logDebug / logWarning / logError
yield* Effect.annotateLogs({ requestId })(program); // structured annotations
const grouped = Effect.logInfo("starting sync").pipe(Effect.withLogSpan("user-sync"));
```

Best practices: log at business boundaries (not every helper), prefer structured values over
concatenated strings, rely on spans plus a few well-placed logs rather than log spam. `Redacted`
values are masked automatically.

## Metrics

```typescript
import { Effect, Metric } from "effect";

const requests = Metric.counter("user_load_requests");

const loadUser = Effect.fn("loadUser")(function* (userId: string) {
  yield* Metric.increment(requests);
  return { id: userId, name: "Ada" };
});
```

Metric types: `Metric.counter`, `Metric.gauge`, `Metric.histogram`, `Metric.summary`,
`Metric.frequency`. Attach metrics at meaningful boundaries — endpoint handlers, queue/job
handlers, repository operations, external API calls — not on every internal helper.

## OpenTelemetry integration

Use `@effect/opentelemetry` layers; compose telemetry once at the layer level. Business code
stays observability-agnostic and keeps using `Effect.fn` / `Effect.withSpan` / `Effect.log*` /
Effect metrics.

```typescript
import { NodeSdk } from "@effect/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const TelemetryLayer = NodeSdk.layer(() => ({
  resource: { serviceName: "todo-service", serviceVersion: "1.0.0" },
  spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
}));

const AppLayer = Layer.mergeAll(DomainLayer, HttpLayer).pipe(
  Layer.provide(TelemetryLayer),
);
```

- `NodeSdk.layer(...)` is the main Node entrypoint (span processors, metric readers with
  cumulative/delta temporality, log record processors, resource metadata, shutdown timeout);
  `WebSdk` for browsers.
- Always set a meaningful `serviceName` (and version); use resource attributes for stable
  deployment/environment metadata.
- Provider lifecycle (shutdown) is owned by the scoped layers — never call provider shutdown
  from business logic.
- External trace context: `Tracer.makeExternalSpan` / `Tracer.currentOtelSpan` only at
  integration boundaries (HTTP/RPC/queue adapters).

## Anti-patterns

- Business logic built from anonymous `Effect.gen` closures everywhere (weak traces)
- `Effect.fnUntraced` by default
- Unstructured interpolated-string logs duplicated at every layer
- Constructing OpenTelemetry SDK clients inside business services
- Telemetry configured separately in many subsystems instead of one top-level layer
