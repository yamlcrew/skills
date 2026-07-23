# Data, Collections, Option, and Match

> When to read: replacing ad hoc reducers/filters/sorts with Effect collection helpers, deciding
> `Option<A>` vs `A | null`, pattern matching with `Match`, tagged enums, small utilities.

## Array helpers

Use `Array as Arr` (from `effect`) when the input is already an iterable collection:

```typescript
import { Array as Arr, Option } from "effect";

Arr.reduce(items, 0, (sum, item) => sum + item.count);
Arr.filter(items, (item) => item.active);
Arr.some(items, (item) => item.status === "failed");
Arr.every(items, (item) => item.status === "ready");
Arr.findFirst(users, (user) => user.role === "admin"); // Option<A>
const [disabled, enabled] = Arr.partition(items, (item) => item.enabled);
```

## Record helpers

`Arr` does not enumerate object properties. Use `Record` when keys matter or the result should
stay record-shaped:

```typescript
import { Array as Arr, Record } from "effect";

Record.reduce(countsById, 0, (sum, count) => sum + count);      // Object.values(...).reduce
Record.collect(usersById, (id, user) => `${id}:${user.name}`);  // Object.entries(...).map
Record.filter(usersById, (user) => user.enabled);               // stays record-shaped
Record.map(usersById, (user) => user.name);
Record.some(usersById, (user, id) => id.startsWith("admin-"));
Record.every(usersById, (user) => user.enabled);

// Deliberate array-shaped traversal
Arr.filter(Record.values(countsById), (count) => count > 0);
Arr.filter(Record.toEntries(usersById), ([id, user]) => user.role === "admin");
```

## Sorting with Order

Use `Order` with `Arr.sort` / `Arr.sortWith` / `Arr.sortBy` instead of copied mutable sorts:

```typescript
import { Array as Arr, Order } from "effect";

Arr.sort([3, 1, 2], Order.number);
Arr.sortWith(users, (user) => user.age, Order.number);
Arr.sortBy(
  users,
  Order.mapInput(Order.number, (user: User) => user.age),
  Order.mapInput(Order.string, (user: User) => user.name),
);
// Built-ins: Order.string, Order.number, Order.bigint, Order.boolean, Order.Date
// Reverse: Order.reverse(Order.number)
```

## Replacement cheatsheet

| Existing logic | Prefer |
| --- | --- |
| `array.reduce(...)` | `Arr.reduce(array, zero, f)` |
| `array.filter(...)` | `Arr.filter(array, predicate)` |
| `array.some/every(...)` | `Arr.some` / `Arr.every` |
| `array.find(...)` | `Arr.findFirst` returning `Option<A>` |
| `Object.values(record).reduce(...)` | `Record.reduce(record, zero, f)` |
| `Object.entries(record).map/filter(...)` | `Record.collect`, `Record.filter`, `Record.map`, `Record.toEntries` |
| `[...items].sort(compare)` | `Arr.sort` / `Arr.sortWith` / `Arr.sortBy` with `Order` |

## Option vs null

**Rule: `Option<T>` for Effect domain logic; `T | null` only at external boundaries.**

- `Option<T>`: internal computations, domain models where absence has meaning, returns that may
  produce no value.
- `T | null`: React state/props, JSON serialization (Option does not serialize), external API
  responses, database results, localStorage.

```typescript
// Incoming: null → Option (at the boundary, once)
const fromApi = Option.fromNullable(response.data);

// Outgoing: Option → null/undefined (for React/JSON)
const toReact = Option.getOrNull(maybeValue);
const toJson = Option.getOrUndefined(maybeValue);

// Common operations
Option.map(maybeUser, (user) => user.name);
Option.flatMap(maybeUser, (user) => Option.fromNullable(user.profile));
Option.getOrElse(maybeValue, () => defaultValue);
if (Option.isSome(maybeValue)) maybeValue.value;

// Avoid Option<Option<T>> creep — normalize once; flatten if nested
Option.flatten(nestedOption);
```

Schema integration:

```typescript
Schema.optionalWith(Schema.String, { as: "Option" }); // decodes to Option<string>
Schema.NullOr(Schema.String);                          // string | null (JSON compat)
```

## Pattern matching with Match

Default branching tool for tagged unions and complex conditionals:

```typescript
import { Match } from "effect";

// Exhaustive matching on tagged errors
const handleError = Match.type<AppError>().pipe(
  Match.tag("UserCancelledError", () => null),
  Match.tag("ValidationError", (e) => e.message),
  Match.tag("NetworkError", () => "Connection failed"),
  Match.exhaustive, // compile error if a case is missing
);

// Replace nested catchTag chains
Effect.catchAll(effect, (error) =>
  Match.value(error).pipe(
    Match.tag("A", handleA),
    Match.tag("B", handleB),
    Match.exhaustive,
  ),
);

// Match on values (cleaner than if/else chains)
const describe = Match.value(status).pipe(
  Match.when("pending", () => "Loading..."),
  Match.when("success", () => "Done!"),
  Match.orElse(() => "Unknown"),
);
```

## Data.taggedEnum

Use the constructor's `$match` helper for exhaustiveness and variant-typed payloads without
casts. Since `effect@3.21.3`, `$match` preserves generic type parameters in each arm:

```typescript
import { Data } from "effect";

type Tree<A> = Data.TaggedEnum<{
  Leaf: { readonly value: A };
  Branch: { readonly children: ReadonlyArray<Tree<A>> };
}>;

interface TreeDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Tree<this["A"]>;
}

const Tree = Data.taggedEnum<TreeDefinition>();

const collect = <A>(tree: Tree<A>): ReadonlyArray<A> =>
  Tree.$match(tree, {
    Leaf: (leaf) => [leaf.value],
    Branch: (branch) => branch.children.flatMap(collect<A>),
  });
```

Prefer this over `switch` plus `as` casts for recursive generic variants.

## Small utilities

```typescript
import { constVoid as noop } from "effect/Function";

Effect.tap(effect, noop);       // ignore value
promise.catch(noop);            // swallow (only where genuinely safe)
```

Deprecations to know:

- `BigDecimal.fromNumber` → use `BigDecimal.unsafeFromNumber` (3.11.0+)
- `Schema.annotations()` removes previously set identifier annotations (3.17.10+) — identifiers
  are tied to the schema's `ast` reference
