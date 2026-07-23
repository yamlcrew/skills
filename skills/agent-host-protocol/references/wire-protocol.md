# Wire Protocol: transport, framing, subscriptions, lifecycle, versioning

Normative keywords follow RFC 2119. Ground truth: `types/messages.ts`, `types/commands.ts`, and
`schema/commands.schema.json` in `microsoft/agent-host-protocol`.

## Base protocol

AHP uses **JSON-RPC 2.0** as its message framing. It is **transport-agnostic**: any reliable, ordered,
bidirectional, complete-message stream works. The transport is chosen out-of-band **before** AHP starts and is
not negotiated in-protocol.

- **Request**: has `id` + `method`; the peer MUST send exactly one response with the same `id`.
- **Response**: `{ id, result }` on success or `{ id, error: { code, message, data? } }` on failure.
- **Notification**: has `method`, no `id`; MUST NOT be answered.

AHP is **symmetric** for some methods: the server may issue requests to the client (the whole `resource*`
family plus `createResourceWatch`), and pushes notifications (`action`, `root/*`, `auth/required`, `otlp/*`).

### Transport (WebSocket, the common choice)

When WebSocket is used: server is the WS server; each **text** frame carries exactly one complete JSON-RPC
message. Endpoint access control (tokens/headers/query params) is a transport-handshake concern, outside the
AHP wire protocol.

### Keep-alive

`ping` is a connection-level request with **no payload** in either direction — the response itself is the
signal. The server MUST answer `ping` regardless of whether `initialize` completed or any subscription exists.
Ping interval/timeout are implementation-defined; transport-level ping/pong MAY also be used.

## The universal routing key

**Every command's `params` and every notification's `params` carry a top-level `channel: URI`.** Enforced at
compile time by `types/version/message-checks.ts` (every `CommandMap` entry's params is assignable to
`BaseParams`, and notification params are structurally `{ channel: URI }`). Connection-level commands use
the literal `'ahp-root://'`.

| Direction | Kind | Examples |
|---|---|---|
| Client → Server | notification (fire-and-forget) | `unsubscribe`, `dispatchAction` |
| Client → Server | request | `initialize`, `reconnect`, `subscribe`, `ping`, `listSessions`, `createSession`, `disposeSession`, `createChat`, `fetchTurns`, `completions`, `createTerminal`, `disposeTerminal`, `invokeChangesetOperation`, `authenticate`, `resolveSessionConfig`, `sessionConfigCompletions`, the `resource*` family, `createResourceWatch` |
| Server → Client | request (symmetric) | `resource*` family (`resourceRead/Write/List/Copy/Delete/Move/Resolve/Mkdir/Request`) + `createResourceWatch` |
| Server → Client | notification (pushed) | `action`, `root/sessionAdded`, `root/sessionRemoved`, `root/sessionSummaryChanged`, `root/progress`, `auth/required`, `otlp/exportLogs`/`Traces`/`Metrics` |
| Server → Client | response | success `result` or JSON-RPC error, correlated by `id` |

## Connection lifecycle

### Handshake — `initialize` (request, client → server)

```json
{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
  "channel": "ahp-root://",
  "protocolVersions": ["0.7.0", "0.6.0"],
  "clientId": "client-abc",
  "clientInfo": { "name": "acme-ide", "version": "2.5.0", "title": "Acme IDE" },
  "capabilities": { "mcpApps": {} },
  "initialSubscriptions": ["ahp-root://", "ahp-session:/<prev-uuid>"],
  "locale": "en-US"
} }
```

- `protocolVersions` — every version the client can speak, **most-preferred first**.
- `clientId` — opaque **per-connection** identifier used for reconnection. Distinct from `clientInfo`.
- `clientInfo` — the client *implementation* (`Implementation`: required `name`, optional `version`, `title`).
  **Informational only** (logging/telemetry/about). NOT feature detection — gate on capabilities instead.
- `capabilities` (`ClientCapabilities`) — opt-in feature flags, e.g. `mcpApps: {}` for MCP Apps.
- `initialSubscriptions` — subscribe to channels in the same round-trip (typically `ahp-root://` + previously
  open session URIs). The response returns a snapshot per state-bearing channel.
- `locale` — optional IETF BCP 47 tag; the server SHOULD localise user-facing strings (e.g. confirmation labels).

### Handshake response — `InitializeResult` (server → client)

```json
{ "jsonrpc": "2.0", "id": 1, "result": {
  "protocolVersion": "0.7.0",
  "serverSeq": 42,
  "serverInfo": { "name": "acme-agent-host", "version": "1.4.2" },
  "defaultDirectory": "file:///home/testuser",
  "completionTriggerCharacters": ["@", "#"],
  "terminalCommandPrefix": "!",
  "telemetry": { "logs": "ahp-otlp://logs{?level}", "traces": "ahp-otlp://traces", "metrics": "ahp-otlp://metrics" },
  "snapshots": [ { "resource": "ahp-root://", "state": { "agents": [] }, "fromSeq": 42 } ]
} }
```

- `protocolVersion` — the single version selected; both peers MUST use it for the whole connection.
- `serverSeq` — current sequence high-water mark.
- `serverInfo` — server `Implementation` (informational, like `clientInfo`).
- `defaultDirectory` (optional) — server-local starting point for remote filesystem browsing.
- `completionTriggerCharacters` (optional) — characters that auto-trigger `completions` (e.g. `@`, `#` mentions).
- `terminalCommandPrefix` (optional) — if `"!"`, messages starting with `!` are treated as terminal commands.
- `telemetry` (optional) — `ahp-otlp:` channel URIs per OTel signal (see `features.md`).
- `snapshots` — one per state-bearing channel in `initialSubscriptions`.

If the server can speak none of the offered versions it MUST return `UnsupportedProtocolVersion` (`-32005`) and
close, optionally with `data.supportedVersions` (SemVer strings or ranges). Any other refusal is a JSON-RPC error.

### Subscribe (request)

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": {
  "channel": "ahp-session:/<uuid>",
  "delivery": { "maxLatencyMs": 100 },   // optional: upper bound on server-side coalescing; 0 = immediate
  "view": { "turns": 20 }                // optional, chat channels: advisory tail of recent completed turns
} }

// Server → Client (state-bearing channel): a Snapshot
{ "jsonrpc": "2.0", "id": 1, "result": { "snapshot": {
  "resource": "ahp-session:/<uuid>", "state": { /* SessionState */ }, "fromSeq": 5
} } }

// Server → Client (stateless channel): empty
{ "jsonrpc": "2.0", "id": 1, "result": {} }
```

- **`delivery.maxLatencyMs`** — advisory buffering budget; the server MAY coalesce high-frequency updates while
  preserving the same reduced state. `0` = immediate. Omitted = server default.
- **`view`** — advisory snapshot shaping. For chats, `view.turns` requests approximately that many most-recent
  completed turns; the server MAY return more or fewer. Omitting `view.turns` returns **all** retained turns.
  If older turns remain, the returned state carries `turnsNextCursor` (page more via `fetchTurns`). Clients MUST
  tolerate receiving more state than requested; a server that doesn't understand a view ignores it.

After subscribing, the client receives every message scoped to that channel: `action` envelopes (state
channels) plus any channel-specific protocol notifications.

### Unsubscribe (notification)

```json
{ "jsonrpc": "2.0", "method": "unsubscribe", "params": { "channel": "ahp-session:/<uuid>" } }
```

Fire-and-forget; the client stops receiving that channel's messages. For a resource-watch channel,
unsubscribing the **last** subscriber releases the underlying watcher (no dispose command exists).

## Action delivery

Server → client mutations arrive as the `action` notification whose params are an **`ActionEnvelope`** (see
`actions-and-reducers.md` for the full shape and reconciliation algorithm):

```json
{ "jsonrpc": "2.0", "method": "action", "params": {
  "channel": "ahp-chat:/<cid>",
  "action": { "type": "chat/delta", "turnId": "t1", "partId": "p1", "content": "Hello" },
  "serverSeq": 6,
  "origin": { "clientId": "client-1", "clientSeq": 1 }
} }
```

Client → server mutations use a **different** method, `dispatchAction`, params `{ channel, clientSeq, action }`
(no `serverSeq`, no `origin` — the server assigns those on echo).

## Protocol notifications (ephemeral)

Beyond `action`, the server pushes per-channel protocol notifications, each its own top-level method (no
`notification` wrapper): `root/sessionAdded`, `root/sessionRemoved`, `root/sessionSummaryChanged`,
`root/progress`, `auth/required`, `otlp/export*`. They go only to subscribers of the target channel, are **not**
stored in state, and are **not** replayed on reconnect.

`root/progress` reports incremental progress on a long-running operation the client opted into via a
`progressToken` on the originating request (today: `createSession.progressToken`, e.g. lazy agent-SDK download).
`progress` is monotonic non-decreasing; `total` present only when known; completion is `progress === total`
(server MUST emit a final frame satisfying this). Optional human-readable `message`.

## Reconnection & replay

On transport drop, the client sends `reconnect` (request):

```json
{ "jsonrpc": "2.0", "id": 2, "method": "reconnect", "params": {
  "channel": "ahp-root://",
  "clientId": "client-abc",
  "lastSeenServerSeq": 42,
  "subscriptions": ["ahp-root://", "ahp-session:/<uuid>"]
} }
```

The server MUST include all replayed data **in the response** before returning. Two outcomes:

- **Replay** (gap within the buffer): `{ type: "replay", actions: ActionEnvelope[], missing?: URI[] }`. `missing`
  lists subscriptions the server can't resume (disposed sessions/terminals, revoked access); the client drops them.
- **Snapshot** (gap exceeds the buffer): `{ type: "snapshot", snapshots: Snapshot[] }`. The client resets
  `confirmedState` from these and clears `pendingActions`.

Protocol notifications are **not** replayed — after reconnecting, re-fetch the session list via `listSessions`
and re-check auth requirements. Stateless channels are simply re-subscribed (missed messages dropped).

**Unexpected server termination:** the host SHOULD treat the server as terminated, MAY restart it (crash
recovery), SHOULD consider in-progress turns failed; clients then reconnect as above.

## Versioning strategy (recap)

- One negotiation at `initialize`; both peers pin the selected version. Servers SHOULD honour client preference
  order and SHOULD pick the highest offered version they implement; MUST return `-32005` if none is acceptable.
- SemVer compatibility: same `MAJOR ≥ 1`, or same pre-1.0 `MINOR`, are compatible; anything else is not
  guaranteed. Additive changes ride PATCH/MINOR bumps and MUST be ignored by older peers.
- **Forward compat:** newer client offers a wide list, host picks the newest it knows, client checks capabilities
  before using newer features and degrades gracefully; client SHOULD silently ignore unknown action `type`s.
- **Backward compat:** older client offers only what it knows; host picks one or returns `-32005`; on success the
  host MUST NOT use newer-only behaviour unless gated behind a capability the client acknowledged.
