# React Integrations: effect-atom and Next.js

> When to read: `@effect-atom/atom-react` reactive state, React hooks over Effect, or
> `@prb/effect-next` (Effect + Next.js App Router).

Effect shines server-side; keep client components thin. Verify these third-party libraries are
actually in the project's `package.json` before recommending them.

## effect-atom (`@effect-atom/atom-react`)

Reactive state containers integrated with Effect and React. Source:
<https://github.com/tim-smart/effect-atom>.

### Creating atoms

```typescript
import { Atom } from "@effect-atom/atom-react";

const countAtom = Atom.make(0);                          // simple value
const doubleAtom = Atom.make((get) => get(countAtom) * 2); // derived
const userAtom = Atom.make(                               // effectful → Result type
  Effect.gen(function* () {
    const api = yield* Api;
    return yield* api.fetchUser();
  }),
);
const persistentAtom = Atom.make(0).pipe(Atom.keepAlive); // survives unmount
```

### Hooks

```typescript
import { useAtom, useAtomSet, useAtomValue } from "@effect-atom/atom-react";

const count = useAtomValue(countAtom);      // read-only
const setCount = useAtomSet(countAtom);     // write-only
const [value, setValue] = useAtom(countAtom); // both
```

### Families, functions, runtime

```typescript
// Stable atom references for dynamic keys (avoids leaks)
const userAtomFamily = Atom.family((userId: string) => Atom.make(fetchUserEffect(userId)));

// Callable effects
const incrementFn = Atom.fn(incrementEffect);
const increment = useAtomSet(incrementFn); // increment() returns Promise<Exit<...>>

// DI: atom runtime from Effect layers
const runtimeAtom = Atom.runtime(ApiLive);
```

### Advanced

```typescript
Atom.searchParam("page", { decode, encode }); // bind to URL search params
Atom.kvs({ key: "app-settings", defaultValue: { theme: "dark" } }); // localStorage persistence
Atom.pull(messageStream);                     // pull values from a Stream

// Scoped resources: finalizers run on rebuild/unmount
const websocketAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const ws = yield* WebSocket.connect("wss://...");
    yield* Effect.addFinalizer(() => ws.close());
    return ws;
  }),
);

// Self-update from event listeners: get.setSelf(...) + addFinalizer cleanup
// Reactivity keys: Atom.withReactivity(["data-key"]) re-runs on invalidation
// RPC/HTTP API integration: AtomRpc.Tag(), AtomHttpApi.Tag()
```

### Results and mutations

Effectful atoms return `Result` — pattern match in components:

```typescript
const userResult = useAtomValue(userAtom);
return Result.match(userResult, {
  onSuccess: (user) => <div>{user.name}</div>,
  onFailure: (error) => <div>Error: {String(error)}</div>,
});
```

Mutations: `useAtomSet(saveUserAtom, { mode: "promiseExit" })` then inspect the `Exit` for typed
success/failure.

### Best practices

1. `Atom.family` for dynamic keys (stable references, no leaks)
2. `Atom.keepAlive` for state that must survive unmount
3. `Atom.runtime` for layer-based DI in React
4. Finalizers for cleanup
5. `mode: "promiseExit"` for mutations
6. Derived atoms over component state

## @prb/effect-next (Next.js 15+ App Router)

Typed helpers for route handlers, server actions, middleware, and hooks.

```typescript
// Route handler — app/api/users/[id]/route.ts
import { effectHandler } from "@prb/effect-next/handlers";
import { RouteParams } from "@prb/effect-next/params";

export const GET = effectHandler(
  Effect.gen(function* () {
    const params = yield* RouteParams;
    const user = yield* fetchUser(params.id);
    return Response.json(user);
  }),
  AppLayer,
);

// Server action — returns an Exit-like result
"use server";
import { effectAction } from "@prb/effect-next/action";
export const createUser = effectAction(createUserEffect, AppLayer);
// const result = await createUser(); result._tag === "Success" | "Failure"

// Middleware
import { effectMiddleware } from "@prb/effect-next/middleware";
export const middleware = effectMiddleware(authCheckEffect, AuthLayer);
```

Request context services: `Headers`, `Cookies` (`@prb/effect-next/headers`), `RouteParams`,
`SearchParams` (`.../params`); navigation effects: `redirect`, `rewrite`, `notFound`
(`.../navigation`).

Request-scoped caching over React `cache()`:

```typescript
import { reactCache, reactCacheFn, reactCacheWithKey } from "@prb/effect-next/cache";
const runtime = ManagedRuntime.make(AppLayer);
export const getUsers = reactCache(getUsersEffect, runtime);
export const getUserById = reactCacheFn((id: string) => getUserEffect(id), runtime);
```

Client hooks (`@prb/effect-next/react-hooks`): `EffectNextProvider`, `useEffectNextRuntime`,
`useEffectMemo`, `useEffectOnce`, `useForkEffect`, `useStream`, `useStreamLatest`,
`useSubscriptionRef`.

Testing kit (`@prb/effect-next/testing-kit`): `assertRight`, `assertLeft`,
`expectTaggedFailure`, `expectDefect`, `runExpectSuccess`, `runExpectFailure`,
`makeMockRuntime`.

Best practices: centralize an `AppLayer`; use `Effect.fn` for handlers (spans + traces); handle
errors with `catchTag`/`catchAll` before the boundary; use `reactCache` for request-scoped
memoization; avoid complex Effect in client components.
