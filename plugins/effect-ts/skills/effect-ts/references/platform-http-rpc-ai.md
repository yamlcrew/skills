# Platform, HTTP, RPC, and AI

> When to read: `@effect/platform` (HttpApi, HttpClient, FileSystem, runtimes), `@effect/rpc`,
> `@effect/ai` tools and providers, deployment runtimes like Cloudflare Workers.

## Platform packages (Effect 3.x)

- `@effect/platform` — runtime-agnostic abstractions: `HttpClient`, `HttpApi`/`HttpApiBuilder`,
  `HttpServer`, `HttpLayerRouter`, `FileSystem`, `Path`, `Terminal`, `Worker`, `KeyValueStore`,
  `Socket`, `Command`.
- `@effect/platform-node` / `@effect/platform-bun` / `@effect/platform-browser` — concrete
  implementations (`NodeContext.layer`, `NodeRuntime.runMain`, `NodeHttpServer`, ...).

Pattern: program against the abstract service (`FileSystem.FileSystem`, `HttpClient.HttpClient`),
provide the platform layer at the edge:

```typescript
import { FileSystem } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString("config.json");
});

NodeRuntime.runMain(program.pipe(Effect.provide(NodeContext.layer)));
```

## HttpApi — typed API contracts

Define the API contract once with schemas; derive server implementation, typed client, and
OpenAPI docs:

- `HttpApi` / `HttpApiGroup` / `HttpApiEndpoint` — contract (paths, params, success/error
  schemas)
- `HttpApiBuilder` — implement endpoints as Effect handlers
- `HttpApiClient` — derive a fully typed client
- `HttpApiSwagger` / `OpenApi` — serve interactive docs
- `HttpApiMiddleware` / `HttpApiSecurity` — auth policies

Use `Schema.TaggedError`-based error schemas on endpoints so failures map to typed API errors.

Note: since `@effect/platform@0.96.1`, `HttpLayerRouter.addHttpApi` preserves fiber context, so
API-level middleware is applied when an API is registered through the router. If middleware seems
skipped, check the pinned platform version before adding route-local workarounds.

## RPC

`@effect/rpc` — schema-typed request/response procedures over any transport:

- `Rpc` / `RpcGroup` define procedures; `RpcServer` / `RpcClient` implement and call them
- `RpcSerialization` selects the wire format:

```typescript
import { RpcSerialization } from "@effect/rpc";

const serialization = RpcSerialization.makeMsgPack({ useRecords: true });
// default RpcSerialization.msgPack === makeMsgPack({ useRecords: true }); ndjson/json also available
```

- `RpcTest` for testing handlers without a transport.
- Cloudflare Workers: the RPC stack's `msgpackr` falls back when dynamic code evaluation is
  blocked — prefer upgrading `@effect/rpc` / `@effect/platform` over custom serialization patches
  for silent msgpack decode failures.

## @effect/ai

Provider-agnostic LLM interactions; provider packages: `@effect/ai-openai`,
`@effect/ai-anthropic`, etc.

### Tools

```typescript
import { Tool, Toolkit } from "@effect/ai";
import { Schema } from "effect";

// No-parameter tool: omit parameters (defaults to the empty schema)
const GetCurrentTime = Tool.make("GetCurrentTime", {
  description: "Returns the current timestamp",
  success: Schema.Number,
});

// Explicit empty parameters
const Ping = Tool.make("Ping", {
  parameters: Tool.EmptyParams,
  success: Schema.String,
});

// Parameters via schema fields
const ReadFile = Tool.make("ReadFile").setParameters({ filePath: Schema.String });
```

- `Tool.EmptyParams` is `Schema.Record({ key: Schema.String, value: Schema.Never })` — a closed
  empty object in generated JSON Schema (`{}` valid, `{ anything: null }` invalid). Do not
  replace it with a loose `Record<string, unknown>`.
- Type extraction: `Tool.Parameters<typeof ReadFile>`, `Tool.ParametersEncoded<...>`,
  `Tool.ParametersSchema<...>`.
- Bundle tools with `Toolkit` and provide handlers as layers.

### Provider notes (OpenAI)

- `OpenAiLanguageModel` config exposes `strict?: boolean` — strict structured output is the
  default; set `strict: false` only when a schema construct cannot satisfy OpenAI strict-schema
  requirements. `strict` is consumed during schema preparation, not sent as a top-level request
  parameter.
- Prompt cache retention enum is `"in_memory"` (older `"in-memory"` examples are stale).
- Recent provider versions deduplicate `response.output` items — if you see duplicated structured
  output in a pinned project, check the `@effect/ai-openai` version before working around it.

### ExecutionPlan for provider fallback

Failing over between model providers is the canonical `ExecutionPlan` use case — see
`scheduling-retries.md`.

## Effect 4 note

In the v4 beta, platform/RPC/HTTP/AI modules move into core `effect` under `effect/unstable/*`
(e.g. `effect/unstable/http`, `effect/unstable/rpc`, `effect/unstable/ai`) — see
`versions-and-v4.md`.
