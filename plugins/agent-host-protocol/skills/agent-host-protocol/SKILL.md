---
name: agent-host-protocol
description: >-
  Reference for the Agent Host Protocol (AHP) — the client-facing, multi-client state-sync protocol for
  AI agent sessions by Microsoft. Use whenever the user mentions AHP, "agent host protocol", `ahp-root://`,
  `ahp-session:/`, `ahp-chat:/`, `ahp-terminal:/`, `ahp-changeset:/`, `ahp-otlp:`, the `@microsoft/agent-host-protocol`
  / `ahp` / `ahp-ws` client libraries, or is building an AHP host or client (an IDE/CLI/web UI that connects to
  agent sessions). Also trigger for AHP concepts: channels + subscriptions, the universal `channel: URI` routing
  key, action envelopes, `dispatchAction`, pure reducers, write-ahead reconciliation, snapshots/reconnect/replay,
  turns, tool-call lifecycle, elicitation/input requests, customizations (Open Plugins), MCP servers, changesets,
  terminals, and how AHP layers over ACP. Applies to protocol spec version 0.7.0 (pre-1.0 DRAFT).
---

# Agent Host Protocol (AHP)

Act as an engineer who knows AHP end-to-end and can implement a compliant host or client, or explain any
part of the wire protocol precisely. AHP is **agent-agnostic**: it standardises the *client-facing* session
state and interactions, not how agents reason or call tools.

## What AHP is (one paragraph)

AHP defines how a portable, standalone **sessions server (host)** communicates with **multiple clients** so
they all see a synchronized view of AI agent sessions. It is built on **JSON-RPC 2.0** over any reliable,
ordered, bidirectional transport (usually WebSocket). Every push interaction is scoped to a URI-identified
**channel**; each state-bearing channel holds an **immutable state tree** mutated only by **actions** run
through **pure reducers** that execute identically on host and client. Clients apply their own actions
**optimistically (write-ahead)** and **reconcile** when the host echoes them back in server order. AHP is the
coordination layer *above* a per-agent protocol like **ACP** — "a mutex over ACP".

## Version context (spec 0.7.0, verified against the repo)

- **Spec version: `0.7.0`** (the in-development track; latest tagged release was `0.6.0`, 2026-07-20). The spec
  is an explicit **DRAFT under active development** — breaking changes to wire types, actions, and state land
  in **MINOR** bumps while `MAJOR` is `0`. Do **not** assume backward compatibility yet.
- **Versioning is SemVer `MAJOR.MINOR.PATCH`**, negotiated once at `initialize` (client offers
  `protocolVersions[]` most-preferred-first; server picks one, returns it as `protocolVersion`, or errors with
  `UnsupportedProtocolVersion` = `-32005`). No per-message renegotiation.
- **Capabilities-first, then required:** new behaviour ships capability-gated (advertised on
  `ClientCapabilities` / `*.capabilities`), and only later becomes baseline. Feature-detect via **capabilities**,
  never by parsing `clientInfo`/`serverInfo` version strings.
- **Clients SHOULD ignore unknown action `type`s and unknown wire keys** (forward compatibility). Additive
  fields/actions/commands MUST be ignored by older peers.
- Per-language clients (TypeScript `@microsoft/agent-host-protocol`, Rust `ahp`/`ahp-types`/`ahp-ws`, Kotlin,
  Go, Swift) version **independently** of the spec; each exports `SUPPORTED_PROTOCOL_VERSIONS`.

## The one structural invariant (never forget this)

**Every command's `params` AND every notification's `params` carry a top-level `channel: URI`.** Any peer or
proxy routes any message by `(method, params.channel)` alone. Connection-level commands (`initialize`, `ping`,
`reconnect`, `listSessions`, `authenticate`, the `resource*` family, `createResourceWatch`,
`resolveSessionConfig`, `sessionConfigCompletions`) use the literal `'ahp-root://'`. Inner action payloads do
**not** carry their own `session`/`chat`/`terminal` URI — the target comes from the envelope.

## Task routing — read the reference that matches the task

| Task / question | Read |
|---|---|
| Wire framing, transport, handshake, subscribe/unsubscribe, snapshots, reconnect/replay, versioning, ping | `references/wire-protocol.md` |
| URI scheme; every channel's state shape (Root/Session/Chat/Terminal/Changeset/ResourceWatch/Annotations); `SessionStatus` bitset; summaries & aggregation | `references/channels-and-state.md` |
| The action envelope, the full per-channel action catalog (client-dispatchable flags + reducer effects), reducers, write-ahead reconciliation, server validation | `references/actions-and-reducers.md` |
| Tool-call lifecycle state machine, confirmation options, editable params, re-confirmation, MCP auth-required, client-provided tools | `references/tool-calls.md` |
| Turns & messages, elicitation/input requests, pending (steering/queued) messages, truncation, forking, multiroot working directories, customizations (Open Plugins), MCP servers + `mcp://` channel + MCP Apps, changesets, terminals, telemetry (OTLP) | `references/features.md` |
| Authentication (RFC 9728 / RFC 6750), the full command index, the `resource*` filesystem family + `resourceRequest`/`createResourceWatch`, error codes, message completions, config resolution | `references/auth-resources-errors.md` |
| **Building an AHP host (server) or client** — role responsibilities/obligations checklists, the SDK landscape (TS/Rust/Kotlin/Swift/Go), transport abstraction, state mirror, reconnect, server-initiated requests, the host↔agent (ACP) bridge, conformance testing | `references/implementing-hosts-and-clients.md` |

## Critical rules (the 12 that prevent most mistakes)

1. **Route by envelope, not by payload.** `channel` lives on `params`; the inner `action` object is channel-free.
2. **State is host-authoritative; mutation is actions-only.** No side RPC mutates a state tree. Reducers are
   **pure** — no I/O; the same reducer runs on both ends. Server-side effects live in a separate dispatch layer.
3. **Sessions vs chats (0.5.0+):** a **session** (`ahp-session:/<uuid>`) is a *catalog of chats* + session-wide
   config; a **chat** (`ahp-chat:/<cid>`) holds the conversation (turns, streaming, tool calls, pending
   messages, input requests, draft). A session starts with a **default chat**; multi-chat needs the
   `multipleChats` capability. Do **not** put turns on the session channel.
4. **The session list is NOT in root state.** Fetch it imperatively via `listSessions` (paginated: `limit` +
   opaque `cursor`/`nextCursor`) and keep it live with `root/sessionAdded` / `root/sessionRemoved` /
   `root/sessionSummaryChanged`. Those notifications are **ephemeral — never replayed**; re-fetch on reconnect.
5. **Write-ahead:** clients apply their own action to `optimisticState` before sending `dispatchAction`, then
   reconcile: own echo → pop pending onto `confirmedState`; foreign action → apply + rebase pending; echo with
   `rejectionReason` → drop the pending action (revert). Server-wins on true conflicts.
6. **`SessionStatus` is a bitset — use bitwise checks.** Bits 0–4 = mutually-exclusive activity
   (`Idle=1`, `Error=2`, `InProgress=8`, `InputNeeded=24` which *includes* the InProgress bit); bits 5+ =
   orthogonal flags (`IsRead=32`, `IsArchived=64`). A session's status is **aggregated** from its chats.
7. **Text streams create-then-append:** `chat/responsePart` creates a `markdown`/`reasoning` part with an `id`,
   then `chat/delta` / `chat/reasoning` append text targeting that `partId`. Wrong `turnId`/`partId` = no-op.
8. **Tool calls are a discriminated union on `status`** with a strict state machine — see `references/tool-calls.md`.
   Only the **first** `chat/toolCallConfirmed` wins; the host rejects the rest. Turn end force-cancels non-terminal
   tool calls with reason `'skipped'`.
9. **`terminal/input` (client→pty) and `terminal/data` (pty→client) are split on purpose** — a pty is mutable
   state, so write-ahead is unsafe. `terminal/input` is side-effect-only (reducer no-op); output returns as
   `terminal/data`. Strip shell-integration escape sequences before dispatching `terminal/data`.
10. **Authentication is per-resource, keyed by the RFC 9728 `resource` URI**, pushed via `authenticate` (never
    in `initialize`). Auth status is per-connection and is deliberately **not** in shared state.
11. **Customizations = Open Plugins**, a shallow tree of containers (`plugin`/`directory`, or a bare top-level
    `mcpServer`) with leaf children (`agent`/`skill`/`prompt`/`rule`/`hook`/`mcpServer`). Use **`id`** for protocol
    ops (toggle/update/remove), **`uri`** for durable references. Toggle math: `container.enabled && (child.enabled ?? true)`.
12. **Ground truth is the TypeScript types + JSON Schemas** at the repo root of `microsoft/agent-host-protocol`
    (`types/*.ts`, `schema/{state,actions,commands,notifications,errors}.schema.json`). Verify exact field names
    there before inventing; the docs site (<https://microsoft.github.io/agent-host-protocol/>) is the prose spec.

## Mental model in five lines

- **Channel** = URI-addressed subscribable resource (state-bearing or stateless).
- **Snapshot** = current immutable state, delivered on `subscribe`/`initialize`/`reconnect` for state channels.
- **Action** = typed mutation in a discriminated union, wrapped in an **`ActionEnvelope`** (`channel`,
  `serverSeq`, `origin`, optional `rejectionReason`).
- **Reducer** = pure `(state, action) → state`, selected by the channel URI scheme, exhaustive over `type`.
- **Reconciliation** = optimistic local apply, then converge on the host's server-ordered echoes.

## Workflow for implementing or debugging AHP

0. **Building a host or client from scratch?** Start at `references/implementing-hosts-and-clients.md` for the
   role checklist and SDK/transport setup, then use the steps below for each specific channel/action/command.
1. Identify the **channel** the concern belongs to (root / session / chat / terminal / changeset / annotations /
   telemetry / `mcp://` / resource-watch). Read that section of `references/channels-and-state.md`.
2. For a mutation, find the **action** in `references/actions-and-reducers.md`: is it client-dispatchable? what's
   the exact reducer effect and no-op condition? what validation must the server apply?
3. For request/response behaviour, find the **command** in `references/auth-resources-errors.md` or the channel's
   command table (`wire-protocol.md`), including which side may initiate it (some `resource*` calls are bidirectional).
4. Verify exact field names/optionality against the upstream `types/` + `schema/` before finalising.
5. Preserve unknown `_meta` and unknown wire keys verbatim; ignore unknown action `type`s.
