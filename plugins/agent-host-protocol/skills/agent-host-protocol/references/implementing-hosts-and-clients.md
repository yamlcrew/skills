# Implementing AHP: building a host (server) and a client

This is the practical build guide. It consolidates the **MUST-level obligations** scattered across the spec into
two checklists (host, client), the layered SDK architecture, the transport abstraction, and the host↔agent
boundary. Pair it with `wire-protocol.md` (framing), `actions-and-reducers.md` (reducers + reconciliation), and
`auth-resources-errors.md` (commands + auth). Ground truth for shapes: `types/*.ts`, `schema/*.json`.

## Roles

- **Host (server)** — owns the **authoritative** state tree per channel, sequences all mutations
  (`serverSeq`), speaks AHP *upstream* to N clients, and (typically) an agent protocol like **ACP** *downstream*
  to one or more agents. "A mutex over ACP."
- **Client** — an IDE / CLI / web UI that subscribes to channels, renders `optimisticState`, dispatches actions
  write-ahead, and reconciles on echo.

Both run the **same pure reducers**; that shared purity is what makes write-ahead and reconnect-replay work.

## Official SDKs (don't hand-roll the wire types)

Every client's wire types are generated from the canonical TypeScript in `types/`, so all five present the same
protocol idiomatically. Each is versioned/released independently and exports `PROTOCOL_VERSION` +
`SUPPORTED_PROTOCOL_VERSIONS`.

| Language | Packages | Notes |
|---|---|---|
| TypeScript | `@microsoft/agent-host-protocol` (+ subpaths `/client`, `/hosts`, `/ws`) | Browser + Node 21+, global `WebSocket`. |
| Rust | `ahp-types`, `ahp`, `ahp-ws` | `ahp::hosts` multi-host registry; `ahp-ws` on `tokio-tungstenite`. |
| Kotlin/JVM | `com.microsoft.agenthostprotocol:agent-host-protocol` | Java 8 bytecode; **no transport** — bring OkHttp/Ktor; `Ahp.json` serializer. |
| Swift | `AgentHostProtocol`, `AgentHostProtocolClient` | `URLSession`/`NWConnection` WS transports; `Package.swift` at repo root. |
| Go | `ahptypes`, `ahp`, `ahpws` | Mirrors the Rust split; `ahpws` on `coder/websocket`. |

The **TypeScript `/client`** entry exposes `AhpClient`, `Subscription`, `AhpStateMirror`, the `AhpTransport`
interface, `InMemoryTransport`, and the error taxonomy. The **`/hosts`** entry adds `MultiHostClient`,
`HostClientHandle`, `ReconnectPolicy`, `ClientIdStore` (+ `InMemoryClientIdStore`), and `MultiHostStateMirror`.

> There is **no server/host SDK shipped** in this repo — to build a host you implement the protocol directly.
> The reference host implementation is VS Code's agent host (`src/vs/platform/agentHost/node/`). Other clients:
> AHPX (CLI + Node) and VS Code's built-in Agent Sessions client.

## Layered architecture (both roles)

```
wire types + PURE reducers      ← no I/O; same code on host and client
        │
   Client / Host core           ← request/response correlation, subscriptions, state mirror
        │
   Transport (pluggable)        ← WebSocket, stdio, Unix socket, TCP+framing, in-memory
        │
   Multi-host orchestration     ← (clients only) reconnect supervisor, fan-in, aggregation
```

### The transport abstraction

Any reliable, ordered, bidirectional, complete-message stream works. The SDK transport interface is three async
methods — `send` / `recv` / `close` — over framed messages. Example (TypeScript):

```ts
interface AhpTransport {
  send(message: JsonRpcMessage | string): void;
  recv(): Promise<TransportFrame | null>;
  close(): void;
}
```

Rust's `ahp::Transport` and Go's `Transport` mirror this. `InMemoryTransport.pair()` gives two connected halves
for tests that need no socket. WebSocket sends each JSON-RPC message as one **text** frame.

## Building a CLIENT — checklist

1. **Open a transport** and construct the client. Attach per-channel event streams **before** the handshake so
   no early action is missed.
2. **`initialize`** with `clientId` (opaque, per-connection; persist it for reconnect via a `ClientIdStore` —
   `localStorage`/IndexedDB/`fs`/`safeStorage`), `protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS]`, optional
   `clientInfo`, `capabilities` (e.g. `mcpApps: {}`), `initialSubscriptions` (usually `ahp-root://` + previously
   open sessions), and `locale`. Apply every returned `snapshot` to your store.
3. **Subscribe** to channels you render (`subscribe` → snapshot; stateless channels return `{}`). Use
   `delivery.maxLatencyMs` / `view.turns` to bound bandwidth.
4. **Maintain write-ahead state** per subscription: `confirmedState`, `pendingActions[]`, computed
   `optimisticState` (render this). Apply the pure reducer; reconcile per `actions-and-reducers.md`
   (own echo → pop; foreign → apply + rebase; `rejectionReason` → drop/revert). `AhpStateMirror` does this for
   root/session/chat/terminal/changeset if you don't keep your own store.
5. **Dispatch** interactive actions optimistically with `dispatchAction` (client picks `clientSeq`); only
   `user`-origin messages, only client-dispatchable action types (see the catalog).
6. **Fetch the session list** via `listSessions` (paginate with `limit`/`cursor`); keep it live from `root/*`
   notifications; **re-fetch after reconnect** (notifications aren't replayed).
7. **Handle server-initiated requests.** The host may issue `resource*` / `createResourceWatch` to the client
   (e.g. to read a client-published `virtual://…` plugin, or drive a per-session FS provider). Install a handler;
   the default SHOULD reply `MethodNotFound` (`-32601`) so the host doesn't leak a pending request.
8. **Reconnect** on transport drop: open a fresh transport, re-attach streams, `connect()`, then `reconnect({
   clientId, lastSeenServerSeq, subscriptions })`. Apply the returned `replay` actions **or** `snapshot`s; on
   snapshot, reset `confirmedState` and **clear** `pendingActions`; drop any URIs in `missing`. Decide retry
   policy yourself (SDKs default to exponential backoff ~250 ms→30 s, 25% jitter). Re-authenticate as needed.
9. **Error taxonomy** (TS names; other SDKs mirror): `RpcError` (server JSON-RPC error — `code`/`message`/`data`),
   `RpcTimeoutError` (client-side timeout), `TransportError` (`closed`/`io`/`protocol`), `ClientClosedError`.
   Malformed inbound frames SHOULD be logged, not thrown — keep the channel alive.
10. **Degrade on capabilities**, never on parsed version strings. Silently ignore unknown action `type`s and
    unknown wire keys.

Minimal quickstart (TypeScript):

```ts
import { ActionType } from '@microsoft/agent-host-protocol';
import { AhpClient, AhpStateMirror } from '@microsoft/agent-host-protocol/client';
import { WebSocketTransport } from '@microsoft/agent-host-protocol/ws';

const client = new AhpClient(await WebSocketTransport.connect('ws://localhost:12345'));
const mirror = new AhpStateMirror();
client.connect();
const init = await client.initialize({ clientId: 'my-client',
  protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS], initialSubscriptions: ['ahp-root://'] });
init.snapshots.forEach(s => mirror.applySnapshot(s));
const root = client.attachSubscription('ahp-root://');
(async () => { for await (const e of root) if (e.type === 'action') mirror.apply(e.params); })();
```

For one-or-many hosts, prefer `MultiHostClient` (owns the reconnect supervisor, re-subscribes across reconnects,
mirrors root state, exposes generation-checked `HostClientHandle`s that throw `HostReconnectedError` if used
after a reconnect). Single-host consumers use `MultiHostClient.single(...)`. `MultiHostStateMirror` keys state by
`(hostId, uri)` so session URIs that collide across hosts don't clobber each other.

## Building a HOST (server) — obligations checklist

The host is the authority. Implement the protocol directly. Each item below is a spec requirement.

**Connection & versioning**
- Accept connections on the chosen transport (out-of-band; gate access at the transport handshake).
- Answer **`ping`** regardless of `initialize`/subscription state (empty both ways).
- On `initialize`, pick one of the client's `protocolVersions` (SHOULD pick the highest you implement), return it
  as `protocolVersion`, `serverSeq`, optional `serverInfo`/`defaultDirectory`/`completionTriggerCharacters`/
  `terminalCommandPrefix`/`telemetry`, and a `snapshot` per `initialSubscriptions`. If none acceptable → return
  `UnsupportedProtocolVersion` (`-32005`, optional `data.supportedVersions`) and close. Pin the version for the
  connection; MUST NOT use newer-only behaviour unless the client acknowledged a gating capability.

**State authority & sequencing**
- Hold the authoritative immutable state per state-bearing channel; mutate it **only** through the same pure
  reducers, selected by channel URI scheme.
- Assign a **monotonic `serverSeq`** to every broadcast action; maintain a **replay buffer** for reconnection.
- On `subscribe`, return the current `Snapshot` (state channels) or `{}` (stateless); then stream that channel's
  `action` envelopes + protocol notifications to its subscribers. Honour `delivery.maxLatencyMs` (MAY coalesce
  while preserving the same reduced state) and `view` (advisory shaping; MAY return more/less).

**Handling client actions (`dispatchAction`)**
- **Validate** before applying (see the validation table in `actions-and-reducers.md`). On rejection, **echo the
  action back with `rejectionReason`** (client reverts); for a non-existent channel, **silently ignore** (no echo).
- Apply to state, assign `serverSeq` + `origin`, broadcast to subscribers, **and** react as a side effect (drive
  the agent for `chat/turnStarted`, abort for `chat/turnCancelled`, etc.). Map the agent's events back into AHP
  actions (`chat/delta`, `chat/toolCallStart`/`Ready`/`Complete`, …), each with its own `serverSeq`.

**Catalogues & aggregation**
- Session list is NOT in state — serve it via `listSessions` (SHOULD paginate, most-recently-modified first,
  opaque `cursor`), and keep client caches live with `root/sessionAdded`/`Removed`/`sessionSummaryChanged`
  (omit identity fields from `changes`; MAY coalesce noisy fields). Emit `root/terminalsChanged` for the terminal
  catalogue.
- Keep aggregates in sync: derive `SessionSummary.status`/`activity`/`modifiedAt`/`changes` from the session's
  chats; keep each chat's `ChatSummary` (in `SessionState.chats`) consistent with the chat's inlined summary
  fields via `session/chatUpdated`. Maintain the `SessionState.inputNeeded` roll-up as chat-level blocks appear
  and resolve.

**Reconnection**
- On `reconnect`, include all replayed data **in the response**: if within the buffer, `{ type: 'replay',
  actions, missing? }`; else `{ type: 'snapshot', snapshots }`. List unresumable subscriptions in `missing`.
  Protocol notifications are NOT replayed.

**Authentication & resources**
- Advertise per-agent `protectedResources` (RFC 9728). Accept `authenticate` (key by `resource`; optional
  `scopes`). Return `AuthRequired` (`-32007`, `data.resources`) from any command when a required token is
  missing; emit `auth/required` on expiry/revocation.
- Provide the `resource*` filesystem family behind a permission flow (`PermissionDenied` `-32009` with an
  optional `resourceRequest` payload; `NotFound` `-32008`; `AlreadyExists` `-32010`; `Conflict` `-32011`). You
  MAY **initiate** `resource*`/`createResourceWatch` toward the client for client-published URIs and per-session
  FS providers.

**Correctness details that are easy to miss**
- **Strip shell-integration escape sequences** from `terminal/data` before dispatch.
- **First `toolCallConfirmed` wins**; reject subsequent ones. **Force-cancel** non-terminal tool calls at turn
  end (reason `'skipped'`). **Fail-complete** (`result.success=false`, status `completed`) a removed active
  client's in-flight tool calls — do not use `cancelled`.
- A **successful** result dispatched from `auth-required` is invalid (no-op); only `toolCallAuthResolved` resumes.
- Preserve **unknown wire keys**, **unknown action `type`s**, integers **above int32**, and every `_meta`
  property **verbatim**.

## The host ↔ agent boundary (AHP over ACP)

AHP is agent-agnostic; a host commonly bridges to **ACP** (or any 1:1 agent interface) below:

1. Client `dispatchAction(chat/turnStarted)` → 2. host sequences it (serverSeq, applies, broadcasts) →
3. host sends ACP `session/prompt` → 4. agent streams ACP `session/update` (content, tool calls, permissions) →
5. host's event mapper converts them to agent-agnostic AHP actions (`chat/delta`, `chat/toolCallStart/Ready`, …)
→ 6. each mapped action gets a `serverSeq` and flows to all subscribers. Cancellation maps `chat/turnCancelled`
→ ACP `session/cancel`. AHP owns multi-client coordination (turn ownership, confirmation arbitration, optimistic
reconciliation); ACP owns the 1:1 conversation. AHP does **not** define the agent loop, model routing, or a tool
registry.

## Testing an implementation

- **Reducer conformance:** replay the JSON fixtures in `types/test-cases/reducers/*.json` (input state + action →
  expected state) through your reducers. Replaying actions in `serverSeq` order on any prior snapshot MUST yield
  identical state — the property reconnect-replay relies on.
- **Wire fidelity:** the `types/test-cases/round-trips/*.json` fixtures (+ `KNOWN-FIDELITY-GAPS.md`) exercise
  serialization edge cases: unknown wire keys ignored/preserved, `long` above int32 preserved, unknown enum
  variants/status bits preserved, `StringOrMarkdown`, JSON-RPC request/notification/success/error shapes.
- **Transport:** use an in-memory transport pair for deterministic client↔host tests without a socket.
