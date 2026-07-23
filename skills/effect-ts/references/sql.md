# Effect SQL

> When to read: `@effect/sql` (and dialect packages like `@effect/sql-pg`,
> `@effect/sql-sqlite-node`), `SqlSchema`, repositories, transactions, resolvers, migrations.

## Preferred rule

In an Effect project, prefer the Effect SQL stack over coupling business code directly to a
native driver: transactions, spans, and typed errors stay inside the Effect model; layering and
tests stay clean.

Stack roles: `SqlClient` (main capability), `withTransaction` (boundaries), `SqlSchema`
(schema-decoded queries), `SqlResolver` (batched, schema-validated request resolution),
`Migrator` (managed migrations).

## Decode rows with Schema

A TypeScript type parameter on a raw query describes the row shape but does not validate it.
Prefer `SqlSchema` or explicit Schema decoding, with precise domain schemas (an `AccountId`
column decodes as `AccountId`, not `Schema.String`):

```typescript
import { SqlClient, SqlSchema } from "@effect/sql";
import { Effect, Schema } from "effect";

const AccountRow = Schema.Struct({
  id: AccountId,
  name: Schema.String,
  accountType: AccountType,
});

const findById = SqlSchema.findOne({
  Request: AccountId,
  Result: AccountRow,
  execute: (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* sql`
        SELECT id, name, account_type AS "accountType"
        FROM accounts
        WHERE id = ${id}
      `;
    }),
});
```

Pick the right helper:

```typescript
SqlSchema.findOne({ Request, Result, execute }); // Option<A> — zero or one row
SqlSchema.findAll({ Request, Result, execute }); // Array<A>  — zero or more
SqlSchema.single({ Request, Result, execute });  // A         — exactly one
SqlSchema.void({ Request, execute });            // void      — writes
```

Use `findOne` when absence is a normal case; convert `Option.none` to a domain error at the
service boundary if the caller requires existence.

Never recover row shapes with `rows[0] as TodoRow` — decode instead.

## Repository boundaries

Keep SQL details in repository services; domain services depend on repository tags and speak in
domain values, not raw rows:

```typescript
class AccountRepository extends Context.Tag("AccountRepository")<
  AccountRepository,
  {
    readonly findById: (id: AccountId) => Effect.Effect<Option.Option<Account>, RepositoryError>;
    readonly save: (account: Account) => Effect.Effect<void, RepositoryError>;
  }
>() {}
```

- Map driver and decode errors into repository errors with `Effect.mapError` — not
  `catchAllCause` (that catches defects too).
- Don't convert SQL errors to strings too early; keep `SqlError` inside the SQL layer and
  translate expected cases into domain errors at the boundary.
- Don't export one trivial accessor function per repository method (see `services-layers.md`).

## Transactions

Use `sql.withTransaction` around all writes that must commit atomically — keep audit, outbox,
or ledger writes in the same transaction when the invariant requires it:

```typescript
const createAccount = (account: Account) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* insertAccount(account);
        yield* insertAuditEntry(account);
      }),
    );
  });
```

Never hand-roll `BEGIN`/`COMMIT`/`ROLLBACK` in application code.

## Resolvers — batched, schema-validated access

`SqlResolver` validates request input and query output with schemas and integrates with request
batching. Preferred for `findById`-style batched lookups:

```typescript
const resolver = SqlResolver.findById("AccountById", {
  Id: Schema.Number,
  Result: AccountRow,
  ResultId: (row) => row.id,
  execute: (ids) => sql`SELECT * FROM accounts WHERE id IN ${sql.in(ids)}`,
});
```

## Migrations

Use the dialect package's `Migrator` — dialect-aware migrations table, duplicate-ID detection,
concurrency guards, per-migration logs and spans:

```typescript
import { PgMigrator } from "@effect/sql-pg";
import { fileURLToPath } from "node:url";

const MigratorLayer = PgMigrator.layer({
  loader: PgMigrator.fromFileSystem(fileURLToPath(new URL("migrations", import.meta.url))),
}).pipe(Layer.provide(SqlLive));

const AppSqlLayer = Layer.merge(SqlLive, MigratorLayer);
```

Best practices:

- Stable numeric migration IDs; ordered, unique files (`0001_create_accounts.ts`).
- Run migrations once at startup or a dedicated operational boundary — never opportunistically
  inside request handlers or unrelated service constructors.
- Reuse the migrated SQL layer value in tests (layer memoization).

## Layering pattern

1. Dialect layer provides `SqlClient` (e.g. `PgClient.layer({ ... })`)
2. Migrations run at the startup boundary
3. Domain repositories/services depend on `SqlClient`
4. Top-level application layer composes database + business layers

This keeps driver choice at the edge, SQL capability in the middle, business logic above.

## Anti-patterns

- Embedding a native driver directly in business services
- Hand-rolled transactions in service methods
- Schema creation hidden inside unrelated service constructors
- `as`-cast row types instead of schema decoding
- Converting SQL errors to strings too early
- Ad hoc migration scripts bypassing `Migrator`
