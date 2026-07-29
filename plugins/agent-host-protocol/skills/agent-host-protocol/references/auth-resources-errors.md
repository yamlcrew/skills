# Authentication, Resources (filesystem), Commands & Error Codes

## Command index

Every command's `params` carry `channel: URI`. Connection-level commands use `'ahp-root://'`. Ground truth:
`types/commands.ts` + `schema/commands.schema.json`.

| Command | Channel | Initiator | Purpose |
|---|---|---|---|
| `initialize` | `ahp-root://` | client → server | Handshake: version negotiation, initial subscriptions, capabilities. |
| `ping` | `ahp-root://` | client → server | Liveness; empty both ways; answered even pre-`initialize`. |
| `reconnect` | `ahp-root://` | client → server | Resume with `lastSeenServerSeq`; returns replay or snapshots. |
| `subscribe` | any | client → server | Subscribe to a channel; returns a snapshot (state channels) or `{}`. |
| `listSessions` | `ahp-root://` | client → server | Paginated session catalogue (`limit`, opaque `cursor` → `items`, `nextCursor`). |
| `createSession` | `ahp-session:/<uuid>` | client → server | Create a session (client picks URI); optional `provider`, `fork`, `workingDirectories`, `progressToken`. |
| `disposeSession` | `ahp-session:/<uuid>` | client → server | Tear down the session (cascades to all its chats). |
| `createChat` | `ahp-session:/<sid>` | client → server | Create a chat; optional `initialMessage`, `source` (fork), `workingDirectories`, `primaryWorkingDirectory`. |
| `disposeChat` | `ahp-chat:/<cid>` | client → server | Dispose a single chat (present in the 0.7.0 `CommandMap`; the host also updates the session catalog via `session/chatRemoved`). |
| `fetchTurns` | `ahp-chat:/<cid>` | client → server | Page older turns (via `turnsNextCursor`) → `chat/turnsLoaded`. |
| `completions` | `ahp-chat:/<cid>` | client → server | Inline user-message completions (`@`-mentions). |
| `createTerminal` | `ahp-terminal:/<id>` | client → server | Create a pty with a required initial claim. |
| `disposeTerminal` | `ahp-terminal:/<id>` | client → server | Kill the pty (if running) and remove it. |
| `invokeChangesetOperation` | `ahp-changeset:/<id>` | client → server | Run a declared changeset operation (returns data, may fail). |
| `authenticate` | `ahp-root://` | client → server | Push a Bearer token for a protected `resource`. |
| `resolveSessionConfig` | `ahp-root://` | client → server | Resolve pre-creation session config (before any session channel exists). |
| `sessionConfigCompletions` | `ahp-root://` | client → server | Complete dynamic fields in pre-creation session config. |
| `resourceRead` | `ahp-root://` | **either** | Read content by URI (files, `ContentRef`s, client `virtual://` URIs). |
| `resourceWrite` | `ahp-root://` | **either** | Write content (supports `createOnly`, `ifMatch` etag). |
| `resourceList` | `ahp-root://` | **either** | List a directory. |
| `resourceCopy` | `ahp-root://` | **either** | Copy. |
| `resourceDelete` | `ahp-root://` | **either** | Delete. |
| `resourceMove` | `ahp-root://` | **either** | Move/rename. |
| `resourceResolve` | `ahp-root://` | **either** | `stat` + `realpath`; throws `NotFound` for missing URIs. |
| `resourceMkdir` | `ahp-root://` | **either** | `mkdir -p`. |
| `resourceRequest` | `ahp-root://` | **either** | Negotiate a permission grant/revocation. |
| `createResourceWatch` | `ahp-root://` | **either** | Open a file watcher; returns an `ahp-resource-watch:/<id>` channel URI. |

The **bidirectional** `resource*` family + `createResourceWatch` may be initiated **server → client** too — for
host-driven per-session filesystem providers and for fetching client-published URIs (e.g. a client's
`virtual://my-client/...` plugin source).

## Authentication

AHP mirrors **RFC 9728** (OAuth 2.0 Protected Resource Metadata) for discovery and **RFC 6750** (Bearer token
usage) for delivery — over JSON-RPC, not HTTP.

**Discovery is per-agent.** Each `AgentInfo.protectedResources[]` is a `ProtectedResourceMetadata`:

```json
{ "resource": "https://api.github.com",
  "resource_name": "GitHub Copilot",
  "authorization_servers": ["https://github.com/login/oauth"],
  "scopes_supported": ["read:user", "user:email"],
  "required": true }
```

`required` (default `true`): `true` = the agent can't function unauthenticated (host SHOULD return `AuthRequired`
`-32007`); `false` = works without auth but MAY offer enhanced capabilities. Absent `protectedResources` (or
empty) = no auth needed. Metadata arrives via the root snapshot + `root/agentsChanged`. `ProtectedResourceMetadata`
also carries the other standard RFC 9728 optional fields: `jwks_uri`, `bearer_methods_supported`,
`resource_documentation`, `resource_policy_uri`, `resource_tos_uri`, `resource_signing_alg_values_supported`,
`resource_encryption_alg_values_supported`, `resource_encryption_enc_values_supported`.

**Token delivery — `authenticate`:**

```jsonc
// Client → Server
{ "jsonrpc":"2.0", "id":3, "method":"authenticate", "params":{
  "channel":"ahp-root://",
  "resource":"https://api.github.com",       // MUST match an advertised resource
  "token":"gho_xxxxxxxxxxxx",
  "scopes":["read:user","user:email"]        // optional: scopes the token actually grants
} }
// Server → Client
{ "jsonrpc":"2.0", "id":3, "result":{} }
```

The `resource` MUST match a resource the server advertised — statically via `AgentInfo.protectedResources`, or
**dynamically** via a live `McpServerAuthRequiredState.resource` or `ToolCallAuthRequiredState.auth.resource`
(servers surfacing MCP auth this way needn't mirror it into `AgentInfo.protectedResources`). Optional `scopes`
help resolve a `requiredScopes` challenge without the server decoding an opaque token. Keyed by `resource`
because that's already the RFC 9728 unique id — no parallel ID scheme.

**Why not tokens in `initialize`?** Auth is per-resource (not per-connection); clients authenticate for multiple
resources independently; tokens rotate without re-initializing; some agents need no auth. **Why not in root
state?** Root state is shared across clients, but auth is per-connection — so it stays imperative
(commands + notifications).

**`AuthRequired` (`-32007`)** MAY be returned from **any** command. Its `data` MUST be
`AuthRequiredErrorData { resources: ProtectedResourceMetadata[] }`. Client flow: parse `data` → obtain tokens
from `authorization_servers` → `authenticate` → retry the original command.

**Expiry notification — `auth/required`** (ephemeral, not replayed): `{ channel, resource, reason }` where
`reason` is `required` (not yet authenticated) or `expired` (token expired/revoked). MAY target `ahp-root://` or
a session URI. Re-check auth after reconnect.

## Resource (filesystem) family

The `resource*` commands are the connection-level, **bidirectional** filesystem/content interface (not
session-local). They gate access through a permission flow:

- **`resourceRead` / `resourceWrite`** — content access. `resourceWrite` supports `createOnly: true` (fail if the
  target exists → `AlreadyExists` `-32010`) and optimistic concurrency via an `ifMatch` etag (stale →
  `Conflict` `-32011`; re-read via `resourceResolve` and retry or surface the conflict).
- **`resourceList` / `resourceCopy` / `resourceDelete` / `resourceMove` / `resourceMkdir`** — directory/file ops
  (`resourceMkdir` = `mkdir -p`).
- **`resourceResolve`** — `stat` + `realpath`; throws `NotFound` (`-32008`) for missing URIs.
- **`resourceRequest`** — negotiate a permission grant/revocation. When access is denied, the receiver returns
  `PermissionDenied` (`-32009`), whose `data` MAY be `PermissionDeniedErrorData { request?: ResourceRequestParams }`
  advertising the access that, if granted via `resourceRequest`, would unlock the operation.

Param/result field shapes (all extend `BaseParams` → carry `channel`; `encoding` is `ContentEncoding` =
`'base64' | 'utf-8'`):

| Command | Params | Result |
|---|---|---|
| `resourceRead` | `{ uri, encoding? }` | `{ data, encoding, contentType? }` |
| `resourceWrite` | `{ uri, data, encoding, contentType?, createOnly?, mode?, position?, ifMatch? }` | `{}` |
| `resourceList` | `{ uri }` | `{ entries }` |
| `resourceResolve` | `{ uri, followSymlinks? }` | `{ uri, type, size?, mtime?, ctime?, contentType?, etag? }` |
| `resourceCopy` / `resourceMove` | `{ source, destination, failIfExists? }` | `{}` |
| `resourceDelete` / `resourceMkdir` | `{ uri }` | `{}` |
| `resourceRequest` | `{ uri, read?, write? }` | grant/deny result |

### Resource watches

`createResourceWatch` (on `ahp-root://`, either direction) opens a short-lived, per-connection watcher over a URI
subtree with optional `recursive` / `includes` / `excludes`. The receiver allocates an `ahp-resource-watch:/<id>`
URI (opaque, receiver-assigned) and returns it on `CreateResourceWatchResult.channel`. The caller **subscribes**
to that URI to receive `resourceWatch/changed` actions (batched `ResourceChange { uri, type }`,
`type ∈ 'added'|'updated'|'deleted'`). There is **no dispose command** — the receiver releases the watcher once
every subscriber on every connection has unsubscribed (or dropped). Gated through the same permission flow
(`PermissionDenied` `-32009` with a `resourceRequest` payload).

## Error codes

Standard JSON-RPC 2.0 plus AHP application codes in the `-32000…-32099` range.

| Code | Name | Meaning |
|--:|---|---|
| `-32700` | ParseError | Invalid JSON. |
| `-32600` | InvalidRequest | Not a valid JSON-RPC request. |
| `-32601` | MethodNotFound | Unknown method (also: `mcp://` method outside advertised capabilities). |
| `-32602` | InvalidParams | Invalid method parameters (e.g. unrecognised session-list cursor). |
| `-32603` | InternalError | Unspecified server error. |
| `-32001` | SessionNotFound | Referenced session URI does not exist. |
| `-32002` | ProviderNotFound | Requested agent provider not registered. |
| `-32003` | SessionAlreadyExists | A session with that URI already exists (returned by `createSession`). |
| `-32004` | TurnInProgress | Operation requires no active turn, but one is in progress. |
| `-32005` | UnsupportedProtocolVersion | Server can't speak any offered version. `data`: `UnsupportedProtocolVersionErrorData { supportedVersions: string[] }` (SemVer strings or ranges). |
| `-32006` | ContentNotFound | Requested content URI does not exist. |
| `-32007` | AuthRequired | Not authenticated for a required resource. `data` MUST be `AuthRequiredErrorData { resources }`. MAY come from any command. |
| `-32008` | NotFound | File/folder/URI does not exist. |
| `-32009` | PermissionDenied | Not permitted to access the resource. `data` MAY be `PermissionDeniedErrorData { request?: ResourceRequestParams }`. |
| `-32010` | AlreadyExists | Target exists and the op doesn't allow overwrite (e.g. `resourceWrite` `createOnly: true`). |
| `-32011` | Conflict | Optimistic-concurrency precondition failed (e.g. stale `ifMatch` etag). Re-read and retry or surface. |

`AhpError<C>` narrows `data` by `code`: codes in `AhpErrorDetailsMap` (`AuthRequired`, `PermissionDenied`,
`UnsupportedProtocolVersion`) carry a **required** typed `data`; all others carry optional `unknown` `data`.

## Pre-creation session config

Before a session channel exists, a client resolves and completes the session's configuration form on the root
channel: **`resolveSessionConfig`** (resolve the config for a would-be session) and **`sessionConfigCompletions`**
(complete dynamic fields within it). The resulting config is passed into `createSession`; the live, mutable
values then live on `SessionState.config` and change via the client-dispatchable `session/configChanged` action.
