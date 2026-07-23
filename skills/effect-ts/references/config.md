# Configuration and Secrets

> When to read: reading configuration or environment variables via `Config`, handling secrets
> with `Redacted`, custom config providers, validating config values.

```typescript
import { Config, ConfigProvider, Effect, Layer, Redacted } from "effect";

// Basic config values
const port = Config.number("PORT"); // required number
const host = Config.string("HOST").pipe(
  Config.withDefault("localhost"),  // optional with default
);

// Sensitive values (masked in logs)
const apiKey = Config.redacted("API_KEY"); // Config<Redacted<string>>

// Nested configuration with prefix
const dbConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.number("PORT"),
  name: Config.string("NAME"),
}).pipe(Config.nested("DATABASE")); // reads DATABASE_HOST, DATABASE_PORT, DATABASE_NAME

// Using config in effects — Config is yieldable
const program = Effect.gen(function* () {
  const p = yield* Config.number("PORT");
  const key = yield* Config.redacted("API_KEY");
  return { port: p, apiKey: Redacted.value(key) }; // unwrap only where needed
});

// Custom config provider (e.g. from a map instead of env)
const customProvider = ConfigProvider.fromMap(
  new Map([
    ["PORT", "3000"],
    ["API_KEY", "secret"],
  ]),
);
const withCustomConfig = Effect.provide(program, Layer.setConfigProvider(customProvider));

// Validation and transformation
const validPort = Config.number("PORT").pipe(
  Config.validate({
    message: "Port must be between 1 and 65535",
    validation: (n) => n >= 1 && n <= 65535,
  }),
);
```

Rules:

- Keep secrets as `Redacted<string>` as long as possible; call `Redacted.value` only at the point
  of use. `Redacted` values are masked in logs and `toString`.
- Read config in layer construction (`Layer.effect`) for long-lived services, not repeatedly in
  hot paths.
- Prefer `ConfigProvider.fromMap` in tests over mutating `process.env`.
- Config failures are typed (`ConfigError`) — let them fail layer construction loudly at startup
  rather than defaulting silently.
