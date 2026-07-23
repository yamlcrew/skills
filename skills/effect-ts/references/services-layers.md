# Services and Layers

> When to read: defining or composing services, choosing between `Context.Tag` / `Effect.Service`
> / `Context.Reference`, Layer composition and memoization, dependency injection, and
> `ManagedRuntime`.

## Mental model

A **service** is a typed dependency — a value in `Context`, not a global singleton. A **layer**
is a recipe for building one or more services, possibly using other services.
`Layer<ROut, E, RIn>`: `ROut` = services produced, `E` = construction failures, `RIn` =
dependencies required to build.

This gives you explicit dependencies, easy substitution in tests, and multiple implementations
for the same interface.

## Defining services (Effect 3.x)

```typescript
// Pattern 1: Context.Tag (implementation provided separately via Layer)
class MyService extends Context.Tag("MyService")<MyService, {
  readonly doThing: (input: string) => Effect.Effect<Result, MyError>;
}>() {}
const MyServiceLive = Layer.succeed(MyService, { doThing: ... });

// Pattern 2: Effect.Service (default implementation bundled)
class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
  effect: Effect.gen(function* () {
    const db = yield* Database;
    return { findAll: () => db.query("SELECT * FROM users") };
  }),
  dependencies: [Database.Default], // optional service dependencies
  accessors: true,                  // auto-generate method accessors
}) {}
Effect.provide(effect, UserRepo.Default); // .Default layer auto-generated
// UserRepo.DefaultWithoutDependencies when deps are provided separately

// Effect.Service with parameters (3.16.0+)
class ConfiguredApi extends Effect.Service<ConfiguredApi>()("ConfiguredApi", {
  effect: (config: { baseUrl: string }) =>
    Effect.succeed({ fetch: (path: string) => `${config.baseUrl}/${path}` }),
}) {}

// Pattern 3: Context.Reference — defaultable contextual values (3.11.0+)
class SpecialNumber extends Context.Reference<SpecialNumber>()("SpecialNumber", {
  defaultValue: () => 2048,
}) {}
// No Layer required if the default suffices. Use for config knobs, request
// metadata, feature flags — not for full service APIs with behavior.

// Pattern 4: Context.ReadonlyTag — covariant consumption (3.18.0+)
function effectHandler<I, A, E, R>(service: Context.ReadonlyTag<I, Effect.Effect<A, E, R>>) {}
```

(Effect 4 uses `Context.Service` class syntax instead — see `versions-and-v4.md`.)

## Accessing services

```typescript
const loadUser = (userId: string) =>
  Effect.gen(function* () {
    const repo = yield* UserRepo;      // yield the tag directly
    return yield* repo.getById(userId);
  });
```

- Access services inside implementations; provide them at boundaries.
- Business functions should **require** services, not construct them.
- Do not manually thread service implementations through function arguments when they are real
  application dependencies.

### Service encapsulation — no trivial accessor wrappers

Do not export one thin accessor function per service method:

```typescript
// Avoid: leaks the dependency into a second public API layer
export const createTodo = Effect.fn(function* (title: string) {
  const todos = yield* TodoService;
  return yield* todos.create(title);
});

// Good: exported functions are real business operations that add behavior
export const completeTodo = Effect.fn("completeTodo")(function* (id: number) {
  const todos = yield* TodoService;
  const todo = yield* todos.getById(id);
  if (todo.completed) return todo;
  return yield* todos.setCompleted(id, true);
});
```

## Layer constructors — choose by lifecycle

```typescript
Layer.succeed(Tag, value);      // static pure value (tests, simple constants)
Layer.effect(Tag, make);        // effectful construction, no cleanup
Layer.scoped(Tag, acquire);     // resourceful construction with cleanup (v3)
Layer.unwrapEffect(makeLayer);  // effectfully builds a Layer
```

- For live services that read dependencies, config, or allocate resources, prefer `Layer.effect`
  or `Layer.scoped` over prebuilding a value and hiding acquisition in `Layer.succeed`.
- Use `Layer.succeed` **only** for pure values — never hide effectful initialization inside it.
- Use `Layer.scoped` for owned resources (database pools, sockets, background workers,
  subscriptions) so release is tied to the layer's scope.
- `Layer.orDie` converts construction failures into defects — only when failure is truly
  unrecoverable at that boundary; do not use it to hide config/infrastructure failures.

## Layer composition

| Operator | Meaning |
| --- | --- |
| `Layer.mergeAll(a, b, ...)` | put layers next to each other (combines outputs; does NOT satisfy dependencies) |
| `Layer.provide(target, deps)` | plug deps into target, expose only target's outputs |
| `Layer.provideMerge(target, deps)` | plug deps into target, expose both deps and target outputs |
| `Layer.flatMap(layer, f)` | choose the next layer based on the built service value (specialized) |

Important: `Layer.mergeAll(ConfigLayer, UserRepoLayer)` does **not** feed `Config` into
`UserRepoLayer` — merging only places layers side by side. Use `provide`/`provideMerge` for
dependency satisfaction.

### Composition style

Compose each subsystem locally, then assemble the final application layer as a readable
high-level map:

```typescript
const UserDependencies = Layer.mergeAll(ConfigLayer, LoggerLayer);
const UserLayer = Layer.provide(UserRepoLayer, UserDependencies);

const BillingDependencies = Layer.mergeAll(ConfigLayer, LoggerLayer, DatabaseLayer);
const BillingLayer = Layer.provide(BillingServiceLayer, BillingDependencies);

const AppLayer = Layer.mergeAll(UserLayer, BillingLayer, HttpLayer).pipe(
  Layer.provide(TelemetryLayer),
);
```

- `provide` when you want to hide dependency details; `provideMerge` when downstream code still
  needs the dependencies.
- Avoid deeply nested inline layer expressions — name subsystem bundles.

## Layer memoization

Layers are memoized **by object identity**. Reusing the same layer object in one composition
shares one instance; a new layer object creates a distinct instance.

```typescript
const Shared = Layer.effect(Client, makeClient);
const oneClient = Layer.mergeAll(Shared, Shared);              // one instance
const twoClients = Layer.mergeAll(
  Layer.effect(Client, makeClient),
  Layer.effect(Client, makeClient),                            // two instances!
);
```

Consequences:

- Prefer plain named layer constants over layer factory functions. If a factory is genuinely
  needed (runtime parameters), call it **once**, bind to a constant, reuse the value.
- Do not call layer-producing dependency functions deep inside subsystem composition — keep those
  dependencies unprovided and supply the concrete layer once at the edge.
- Use `Layer.fresh(layer)` only to deliberately escape memoization for the same layer reference.
  Do not wrap factory-created layers in `Layer.fresh` — each call already returns a new object.

This matters most for database layers, HTTP clients, telemetry, queues, and other
resource-owning services.

## Global context vs per-request context

Use Layers for long-lived dependencies wired at startup (config, clients, repositories). Use
`Effect.provideService` for per-request values (authenticated user, tenant, locale, request id):

```typescript
const handleRequest = (request: Request) =>
  program.pipe(
    Effect.provideService(CurrentUserId, extractUserId(request)),
    Effect.provideService(RequestId, extractRequestId(request)),
  );
```

Avoid constructing a Layer for one request's data — per-request values are not application
services, and `Layer.succeed` wrapping makes the runtime boundary harder to see.

## Providing at the boundary

`Effect.provide` should happen once at the outermost entry of the program (or a subsystem/test
boundary) — not inside business logic:

```typescript
// Anti-pattern: local provide hides wiring, blocks test substitution
const loadUser = (userId: string) =>
  Effect.gen(function* () { /* ... */ }).pipe(Effect.provide(UserRepoLayer));

// Preferred
const program = loadUser("u_123").pipe(Effect.provide(AppLayer));
```

- `Effect.provideService` — single ad hoc implementation (small tests, one-off overrides).
- `Effect.provideServiceEffect` — one instance built effectfully without a reusable layer.

### Multiple entry points: ManagedRuntime

When a framework has many entrypoints (HTTP handlers, queue consumers, cron jobs, lifecycle
hooks), build the layer graph once:

```typescript
const runtime = ManagedRuntime.make(AppLayer);

const handleRequest = (id: string) => runtime.runPromise(loadUser(id));
```

Services stay shared per layer semantics, and the resource lifecycle is explicit through
`ManagedRuntime` (dispose on shutdown).

## Best practices

1. Keep service interfaces small and cohesive — no "everything" services.
2. Prefer layers over manual wiring whenever construction has dependencies or effects.
3. Prefer Effect-native integrations (`@effect/sql`, Effect HTTP) over embedding raw runtime
   clients in service code — resources, tracing, and errors stay inside the Effect model.
4. Business logic stays abstract over implementations.
5. Prefer explicit test layers: `Layer.succeed` for simple fakes.
6. Preserve existing domain facades and service/runtime boundaries unless redesign was requested.
7. Do not broaden environment requirements merely to replace a small platform call.

## Anti-patterns

- Constructing live services directly inside business logic
- `Layer.succeed` for values that require effectful initialization
- Providing the same large layer repeatedly through the call graph
- Collapsing unrelated responsibilities into one service
- `Layer.orDie` to hide normal initialization failures
- Bypassing layers for resource-owning services
- Hiding layers inside `namespace` blocks — prefer `static` members on the service class or plain
  exported constants
