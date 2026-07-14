# Schema

> When to read: decoding external data, domain models, transformations, optional/nullable fields,
> branded types, recursive schemas, JSON Schema generation.

## Mental model

A schema is a **contract between a decoded in-memory value and its encoded boundary
representation** — validation, decoding, encoding, transformation, and metadata in one place.
It is not just "a typed struct definition".

Use Schema whenever data crosses a boundary: HTTP requests/responses, RPC payloads, database
rows, config files, worker messages, persisted data, domain errors.

## Decode at the boundary

Decode unknown input once, then pass typed domain values through the rest of the program.

```typescript
import { Effect, Schema } from "effect";

const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
});

const decodeUser = Schema.decodeUnknown(User);

const handle = (input: unknown) =>
  Effect.gen(function* () {
    const user = yield* decodeUser(input);
    return user.name;
  });
```

Prefer effectful decoders (`Schema.decodeUnknown`) in Effect code — sync decoders
(`decodeUnknownSync`) throw exceptions instead of returning typed failures. Use sync variants
only at deliberate sync boundaries.

## Prefer `Class` variants for named models

For domain entities, API bodies, and reusable shapes, prefer `Schema.Class` /
`Schema.TaggedClass` / `Schema.TaggedError` over bare `Schema.Struct`: stable named identity,
construction + validation packaged together, structural equality, better traces and tooling
output.

```typescript
const UserId = Schema.NonEmptyTrimmedString.pipe(Schema.brand("UserId"));
type UserId = typeof UserId.Type;

class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Schema.NonEmptyTrimmedString,
  displayName: Schema.NonEmptyTrimmedString,
}) {
  get label() {
    return `${this.displayName} <${this.email}>`;
  }
}

const user = User.make({
  id: UserId.make("user_123"),
  email: "ada@example.com",
  displayName: "Ada",
});
```

- Construct with `X.make(...)` (preferred over `new X(...)`) consistently across `Class`,
  `TaggedClass`, and tagged errors.
- Use `Schema.TaggedClass` for tagged-union members; `Schema.TaggedError` for schema-backed
  errors (see `error-handling.md`).
- Use `Struct` for small inline/anonymous shapes where a class adds ceremony.
- Use precise domain schemas — if a field can be `UserId` or a domain literal union, do not
  weaken it to `Schema.String`.

## Avoid duplicating schemas

Do not create parallel schemas for the same logical entity when only the encoding differs.
One logical model, multiple representations, connected by transformations:

```typescript
// Bad: Todo and TodoSql duplicated just because SQL stores completed as a bit
// Good: field-level transformation
const Todo = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.BooleanFromUnknown, // or a custom bit<->boolean transform
});
```

Duplicate only for a real semantic difference (creation payload vs persisted entity, public API
contract vs internal model, intentional projection). Derive variants with `pick`, `omit`,
`partial`, `mutable` instead of redefining near-identical schemas. Rename external keys with
schema transformations (e.g. `Schema.rename` / `fromKey`), not manual post-parse rewriting.

## Optional, nullable, and exact fields

- `Schema.optionalWith(schema, { as: "Option" })` — optional domain field decoding to `Option<A>`
- `Schema.NullOr(schema)` — serialized form explicitly uses `null`
- `Schema.optionalWith(schema, { exact: true })` — exact optional property (omitted key), extra
  keys rejected in generated JSON Schema
- Avoid `*FromSelf` variants for JSON/API shapes unless you intentionally want already-decoded
  input; standard variants like `Schema.Option(...)` encode/decode cleanly at boundaries.

```typescript
const ApiUser = Schema.Struct({
  id: Schema.Number,
  nickname: Schema.NullOr(Schema.String),
  displayName: Schema.optionalWith(Schema.String, { exact: true }),
});
```

## Unions

Prefer tagged unions for domain variants — decoding and `_tag` branching align with the rest of
Effect:

```typescript
class Created extends Schema.TaggedClass<Created>()("Created", { id: Schema.String }) {}
class Deleted extends Schema.TaggedClass<Deleted>()("Deleted", { id: Schema.String }) {}
const TodoEvent = Schema.Union(Created, Deleted);
```

## Recursive schemas

Use `Schema.suspend` whenever a schema refers to itself, directly or indirectly:

```typescript
interface Tree {
  readonly name: string;
  readonly children: ReadonlyArray<Tree>;
}

const Tree: Schema.Schema<Tree> = Schema.Struct({
  name: Schema.String,
  children: Schema.Array(Schema.suspend((): Schema.Schema<Tree> => Tree)),
});
```

## Transformations

Use transformations when decoded and encoded shapes differ — this is the main tool that avoids
schema duplication.

```typescript
// Pure transformation
const Trimmed = Schema.transform(Schema.String, Schema.String, {
  decode: (value) => value.trim(),
  encode: (value) => value,
});

// Effectful / failable transformation
const NumberFromString = Schema.transformOrFail(Schema.String, Schema.Number, {
  decode: (value, _, ast) => {
    const n = Number(value);
    return Number.isNaN(n)
      ? ParseResult.fail(new ParseResult.Type(ast, value))
      : ParseResult.succeed(n);
  },
  encode: (n) => ParseResult.succeed(String(n)),
});
```

Field-level transformation when only one field's encoding differs; object-level transformation
when the whole encoding differs (external keys, coordinated fields).

## Branded and opaque types

```typescript
const UserId = Schema.String.pipe(Schema.brand("UserId"));
```

Use brands for IDs, validated domain scalars, and preventing accidental interchange of
same-shaped values.

## Constraints and validation

Attach intrinsic data-contract rules as filters on the schema
(`Schema.minLength`, `Schema.greaterThan`, `Schema.pattern`, `Schema.UUID`, ...). Business-rule
validation that depends on services or current state belongs in effectful logic outside the
schema (or effectful transformations).

## Closed empty records (JSON Schema)

Since `effect@3.21.3`, JSON Schema generation emits `additionalProperties: false` for
string-keyed records with `Schema.Never` values. Use this for object schemas that accept no
dynamic properties — especially no-parameter AI tools:

```typescript
const NoParams = Schema.Record({ key: Schema.String, value: Schema.Never });
// {} valid; { anything: null } invalid
```

Prefer a named `NoParams` schema or `Tool.EmptyParams` (see `platform-http-rpc-ai.md`) over ad
hoc `{}` types when a JSON Schema consumer needs the closed shape.

## JSON Schema generation

```typescript
import { JSONSchema, Schema } from "effect";

const jsonSchema = JSONSchema.make(MySchema);
// Lower-level: JSONSchema.fromAST(MySchema.ast, { definitions: {}, topLevelReferenceStrategy: "skip" })
```

If generation fails, look for unsupported schema nodes or missing JSON Schema annotations before
weakening the domain schema.

## Metadata and derived tooling

- `.annotations({...})` — identifiers, titles, descriptions, examples for docs/OpenAPI/codegen.
  Note (3.17.10+): calling `.annotations()` replaces previously set identifier annotations —
  identifiers are tied to the schema's `ast` reference.
- `Arbitrary.make(schema)` — property-test generators
- `Equivalence.make(schema)` — derived equality

## Anti-patterns

- Plain `Struct` for every reusable domain model when `Class` gives a clearer named type
- Duplicating whole schemas when only one field encoding differs (`Foo` and `FooSql`)
- Manual post-decode key rewriting instead of schema transformations
- Hand-validating external data after decode when the constraint belongs in the schema
- Exposing unvalidated external payloads deep into business logic
- Sync throwing decoders at effectful boundaries
