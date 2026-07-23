# Actions, Reducers & Reconciliation

Actions are the **sole** mutation mechanism for subscribable state — a discriminated union keyed by `type`,
wrapped in an `ActionEnvelope`. Ground truth: `types/*/actions.ts`, `types/reducers.ts`,
`schema/actions.schema.json`, and the reducer test corpus `types/test-cases/reducers/*.json`.

## Action envelope

```typescript
ActionEnvelope {
  channel: URI                          // the channel this action targets (routing key)
  action: Action                        // channel-free payload
  serverSeq: number                     // monotonic, assigned by the server
  origin: { clientId: string, clientSeq: number } | undefined   // undefined = server-originated
  rejectionReason?: string              // present when the server rejected the action (client reverts)
}
```

Client → server dispatch is a `dispatchAction` **notification** with `{ channel, clientSeq, action }` (no
`serverSeq`/`origin`). Inner payloads never carry their own `session`/`chat`/`terminal` URI.

## Reducers

```typescript
rootReducer(state: RootState, action: RootAction): RootState
sessionReducer(state: SessionState, action: SessionAction): SessionState
chatReducer(state: ChatState, action: ChatAction): ChatState
terminalReducer(state: TerminalState, action: TerminalAction): TerminalState
changesetReducer(state: ChangesetState, action: ChangesetAction): ChangesetState
annotationsReducer(state: AnnotationsState, action: AnnotationsAction): AnnotationsState
```

The reducer is selected by the **URI scheme of `envelope.channel`**. Reducers are **pure** (no I/O, no side
effects) and run **identically on server and client** — the basis for write-ahead. The `switch` on `type` is
**exhaustive** (compiler errors on a missing case). Unknown `type`s are a **no-op** (forward compatibility).
Server-side effects (forwarding to the agent SDK/ACP, aborting a turn) live in a separate dispatch layer — when
a client dispatches an interactive action the server applies it to state *and* reacts to it as a side effect
(e.g. `chat/turnStarted` triggers agent processing; `chat/turnCancelled` aborts it).

## Write-ahead reconciliation

Per subscription the client keeps: `confirmedState` (last server-acknowledged), `pendingActions[]`
(optimistically applied, not yet echoed), and the computed `optimisticState` (`confirmedState` with pending
replayed). **The UI always renders `optimisticState`.** On receiving an `ActionEnvelope`:

1. **Own echo** (`origin.clientId === myId` and matches head of `pendingActions`) → pop from pending, apply to
   `confirmedState`.
2. **Foreign / server-originated** → apply to `confirmedState`, **rebase** remaining pending actions.
3. **Rejected** (`rejectionReason` present) → remove from pending (optimistic effect reverted); MAY surface the
   reason.
4. Recompute `optimisticState`.

Rebasing is simple because most chat actions are **append-only** (add turn, append delta, add tool call/part) —
pending actions still apply cleanly. Rare true conflicts (two clients abort the same turn) resolve by
**server-wins**. On reconnect the client resets `confirmedState` from the replay/snapshot and **clears**
`pendingActions`.

## Root actions (`ahp-root://`)

| Type | Client-dispatchable? | Effect |
|---|:--:|---|
| `root/agentsChanged` | No | Replaces `agents` (agents/models changed). |
| `root/activeSessionsChanged` | No | Replaces `activeSessions`. |
| `root/terminalsChanged` | No | Replaces `terminals` (full replacement). |
| `root/configChanged` | **Yes** | Merges (or replaces) `config.values`. |

## Session actions (`ahp-session:/<uuid>`)

| Type | Client-dispatchable? | Effect / when |
|---|:--:|---|
| `session/ready` | No | Backend initialised; sets `lifecycle: 'ready'` (preserves in-progress status). |
| `session/creationFailed` | No | Backend init failed; sets `lifecycle: 'creationFailed'` + `creationError`. |
| `session/chatAdded` | No¹ | Upsert `ChatSummary` into `chats` by `summary.resource`. Mirrors `root/sessionAdded`. |
| `session/chatRemoved` | No¹ | Remove chat by URI; clears `defaultChat` if it referenced it. |
| `session/chatUpdated` | No¹ | Merge non-identity `changes` onto the matching chat entry (no-op if absent). |
| `session/defaultChatChanged` | **Yes** | Set/unset `defaultChat`. Server MUST reject a URI not in the chat catalog. |
| `session/titleChanged` | **Yes** | Set `title` (auto-gen or rename). |
| `session/activityChanged` | No | Set/clear `activity`. |
| `session/isReadChanged` | **Yes** | Toggle `IsRead` bit. |
| `session/isArchivedChanged` | **Yes** | Toggle `IsArchived` bit. |
| `session/metaChanged` | No | Replace the session `_meta` side-channel. |
| `session/configChanged` | **Yes** | Merge (or replace) mutable session config values. |
| `session/serverToolsChanged` | No | Replace server-provided tool list. |
| `session/activeClientSet` | **Yes** | Upsert an active client (keyed by `clientId`) with its `tools` + `customizations`. |
| `session/activeClientRemoved` | **Yes** | Remove an active client by `clientId`. |
| `session/customizationsChanged` | No | Replace the top-level customization list. |
| `session/customizationToggled` | **Yes** | Toggle a container/child `enabled` by `id` (no-op if unknown). |
| `session/customizationUpdated` | No | Upsert one top-level container by `id` (full-entry replacement incl. `children`). |
| `session/customizationRemoved` | No | Remove by `id` (containers cascade to children). |
| `session/changesetsChanged` | No | Replace the `changesets` catalogue. |
| `session/mcpServerStateChanged` | No | Upsert `state` (+ optional `channel`) on an MCP-server customization. |
| `session/mcpServerStartRequested` | **Yes** | Optimistically → `starting`, clear stale `channel`; host is authoritative. |
| `session/mcpServerStopRequested` | **Yes** | Optimistically → `stopped`, clear stale `channel`. |
| `session/inputNeededSet` | No² | Upsert a `SessionInputRequest` into `inputNeeded`. |
| `session/inputNeededRemoved` | No² | Remove an `inputNeeded` entry; clears the `InputNeeded` status when empty. |
| `session/workingDirectorySet` | **Yes** | Add `directory` to `workingDirectories` (multiroot; no-op if present). |
| `session/workingDirectoryRemoved` | **Yes** | Remove `directory` (host MAY decline, e.g. still a chat's primary). |

¹ Catalog actions are produced by the host as chats come/go. ² Host-maintained roll-up mirroring chat-level state.

## Chat actions (`ahp-chat:/<cid>`)

### Turn lifecycle

| Type | Client-dispatchable? | When |
|---|:--:|---|
| `chat/turnStarted` | **Yes** | Begin a turn (carries `turnId`, `message`, optional `queuedMessageId`, `startedAt`). Clears `IsRead`. |
| `chat/delta` | No | Append streaming text to a `markdown` part by `partId` (wrong `turnId`/`partId`/kind = no-op). |
| `chat/reasoning` | No | Append reasoning text to a `reasoning` part by `partId`. |
| `chat/responsePart` | No | Create a new response part (markdown, reasoning, contentRef, toolCall, systemNotification, inputRequest). |
| `chat/usage` | No | Set `UsageInfo` on the active turn. |
| `chat/turnComplete` | No | Finalise turn as `complete`; force-cancel non-terminal tool calls (`'skipped'`); carries `duration`. |
| `chat/turnCancelled` | **Yes** | Abort the active turn (`cancelled`); force-cancels in-progress tool calls. Reject if no active turn. |
| `chat/error` | No | Finalise turn as `error` with `ErrorInfo`. |
| `chat/truncated` | **Yes** | Keep turns up to `turnId` (or clear all if omitted); drops the active turn; no-op if `turnId` unknown. |

### Tool calls (see `tool-calls.md` for the state machine)

| Type | Client-dispatchable? | When |
|---|:--:|---|
| `chat/toolCallStart` | No | Tool call created; LM begins streaming params. Sets `contributor` (client/mcp) here. |
| `chat/toolCallDelta` | No | Append partial params (`partialInput`). |
| `chat/toolCallReady` | No | Params complete → `pending-confirmation`, or → `running` when `confirmed`; also re-confirmation. |
| `chat/toolCallConfirmed` | **Yes** | Approve/deny a `pending-confirmation` call (`approved`, `reason`, `selectedOptionId?`, `editedToolInput?`). |
| `chat/toolCallComplete` | **Yes**³ | Finish execution (`result`); from `auth-required` a **failed** result cancels → `completed`. |
| `chat/toolCallResultConfirmed` | **Yes** | Approve/deny a `pending-result-confirmation` result. |
| `chat/toolCallContentChanged` | **Yes**³ | Replace `content` while `running` (intermediate streaming; no-op if not running). |
| `chat/toolCallAuthRequired` | No | `running` → `auth-required` (MCP-contributed only), carries `auth: McpAuthRequirement`. |
| `chat/toolCallAuthResolved` | No | `auth-required` → `running`, restoring pre-pause fields. |

³ Client-dispatchable only for **client-provided tools** (dispatcher's `clientId` matches `contributor.clientId`).

### Pending messages & input requests

| Type | Client-dispatchable? | When |
|---|:--:|---|
| `chat/pendingMessageSet` | **Yes** | Upsert a steering/queued message (`kind: 'steering' \| 'queued'`). |
| `chat/pendingMessageRemoved` | **Yes** | Remove a pending message (client cancel, or server consume). |
| `chat/queuedMessagesReordered` | **Yes** | Reorder queued messages (unknown ids ignored; unmentioned kept at end). |
| `chat/inputRequested` | No | Insert an unresolved `InputRequestResponsePart` (upsert by request `id`). |
| `chat/inputAnswerChanged` | **Yes** | Update one question's draft/submitted/skipped answer. |
| `chat/inputCompleted` | **Yes** | Set `response` (`accept`/`decline`/`cancel`) + final answers on the same part. |
| `chat/draftChanged` | **Yes** | Set/clear `ChatState.draft` (debounced sync of composing input). |
| `chat/activityChanged` | No | Set/clear the chat's `activity`. |
| `chat/turnsLoaded` | No | Prepend older turns (from `fetchTurns`), dedupe overlap, update/clear `turnsNextCursor`. |
| `chat/workingDirectorySet` | **Yes** | Add `directory` to the chat's multiroot subset (MUST be in the session set; host rejects otherwise; no-op if already present). |
| `chat/workingDirectoryRemoved` | **Yes** | Remove `directory` from the chat's subset (idempotent; the dir stays in the session set). |

## Terminal actions (`ahp-terminal:/<id>`)

| Type | Client-dispatchable? | Effect |
|---|:--:|---|
| `terminal/data` | No | Append pty output to the tail content part (command `output` or `unclassified` `value`, else new part). |
| `terminal/input` | **Yes** | **Side-effect-only** — reducer no-op; server forwards keystrokes to the pty. |
| `terminal/resized` | **Yes** | Set `cols`, `rows`. |
| `terminal/claimed` | **Yes** | Set `claim` (client ↔ session transfer). Conflicts resolved server-wins with `rejectionReason`. |
| `terminal/titleChanged` | **Yes** | Set `title`. |
| `terminal/cwdChanged` | No | Set `cwd`. |
| `terminal/exited` | No | Set `exitCode`. |
| `terminal/cleared` | **Yes** | Reset `content` to `[]`. |
| `terminal/commandDetectionAvailable` | No | Set `supportsCommandDetection: true`. |
| `terminal/commandExecuted` | No | Append a `command` part; set `supportsCommandDetection`. |
| `terminal/commandFinished` | No | Mark the matching `command` part complete (`exitCode`, `durationMs`). |

## Changeset actions (`ahp-changeset:/<id>`)

| Type | Client-dispatchable? | Effect |
|---|:--:|---|
| `changeset/statusChanged` | No | Transition `status` (e.g. `computing → ready`). |
| `changeset/fileSet` | No | Upsert a `ChangesetFile` by `id`. |
| `changeset/fileRemoved` | No | Drop a file. |
| `changeset/filesReviewChanged` | **Yes** | Batch-set `reviewed` on listed file ids (unknown ids ignored; no-op if none match). |
| `changeset/contentChanged` | No | Full replacement of files (+ optional operations / error). |
| `changeset/operationsChanged` | No | Replace `operations`. |
| `changeset/operationStatusChanged` | No | Transition one operation's `status` by `operationId` (no-op if absent). |
| `changeset/cleared` | No | Drop all files (branch switch / session end). |

## Annotations actions (`ahp-session:/<uuid>/annotations`)

All are **client-dispatchable** (host MAY also originate); clients assign `Annotation.id` / `AnnotationEntry.id`
and apply optimistically.

| Type | Effect |
|---|---|
| `annotations/set` | Upsert an annotation (create with its mandatory first entry, or re-anchor/resolve an existing one). |
| `annotations/updated` | Partially update an annotation's own props (resolve/re-open, re-anchor) without resending entries. |
| `annotations/removed` | Remove an entire annotation (and all its entries). |
| `annotations/entrySet` | Upsert one entry within an annotation (unknown annotation = no-op). |
| `annotations/entryRemoved` | Remove one entry (use `annotations/removed` to drop the last remaining entry). |

## Resource-watch actions (`ahp-resource-watch:/<id>`)

| Type | Client-dispatchable? | Effect |
|---|:--:|---|
| `resourceWatch/changed` | No (receiver → caller) | Deliver a batch of `ResourceChange { uri, type: 'added'\|'updated'\|'deleted' }` under `changes.items[]`. Consumed off the action stream; the reducer keeps no history. |

## Version each action was introduced (`ACTION_INTRODUCED_IN`)

Authoritative map from `types/version/registry.ts` — use it to gate behaviour on the negotiated
`protocolVersion` (a peer MUST NOT emit an action newer than the negotiated version; receivers ignore unknown
`type`s). `PROTOCOL_VERSION = '0.7.0'`.

| Version | Actions introduced |
|---|---|
| `0.1.0` | `root/agentsChanged`, `root/activeSessionsChanged`, `root/terminalsChanged`, `root/configChanged`, `session/ready`, `session/creationFailed`, `session/titleChanged`, `session/serverToolsChanged`, `session/customizationsChanged`, `session/customizationToggled`, `session/customizationUpdated`, `session/isReadChanged`, `session/isArchivedChanged`, `session/activityChanged`, `session/configChanged`, `session/metaChanged`, all `terminal/*` (data, input, resized, claimed, titleChanged, cwdChanged, exited, cleared, commandDetectionAvailable, commandExecuted, commandFinished) |
| `0.2.0` | `session/customizationRemoved`, `session/changesetsChanged`, `changeset/statusChanged`, `changeset/fileSet`, `changeset/fileRemoved`, `changeset/operationsChanged`, `changeset/cleared`, `resourceWatch/changed` |
| `0.3.0` | `session/mcpServerStateChanged`, `changeset/operationStatusChanged` |
| `0.4.0` | `session/chatAdded`, `session/chatRemoved`, `session/chatUpdated`, `session/defaultChatChanged`, all `chat/*` turn/tool-call/pending/input/reasoning/usage/truncated actions, `changeset/contentChanged`, all `annotations/*` |
| `0.5.0` | `session/activeClientSet`, `session/activeClientRemoved`, `chat/activityChanged`, `chat/draftChanged` |
| `0.5.1` | `session/inputNeededSet`, `session/inputNeededRemoved`, `chat/turnsLoaded` |
| `0.5.2` | `session/mcpServerStartRequested`, `session/mcpServerStopRequested` |
| `0.6.0` | `chat/toolCallAuthRequired`, `chat/toolCallAuthResolved`, `changeset/filesReviewChanged` |
| `0.7.0` | `session/workingDirectorySet`, `session/workingDirectoryRemoved`, `chat/workingDirectorySet`, `chat/workingDirectoryRemoved` |

Notification methods (`NOTIFICATION_INTRODUCED_IN`): `root/sessionAdded`/`Removed`/`sessionSummaryChanged` +
`auth/required` since `0.1.0`; `otlp/export{Logs,Traces,Metrics}` since `0.2.0`; `root/progress` since `0.5.0`.

## Server validation of client-dispatched actions

The server MUST validate client actions before applying. On rejection it **echoes the action back with a
`rejectionReason`** (so the client reverts its optimistic prediction) — except for actions targeting a
non-existent channel, which are **silently ignored (no echo)**.

| Action | Reject when |
|---|---|
| any action on a non-existent session/chat | channel URI not found → **silently ignore** |
| `session/defaultChatChanged` | `defaultChat` not in the chat catalog → **reject** |
| `chat/toolCallConfirmed` | tool call not in `pending-confirmation` → reject |
| `chat/turnCancelled` | no active turn → reject |
| `chat/inputAnswerChanged` | no unresolved request with matching `requestId`; or value missing/kind-mismatched → reject |
| `chat/inputCompleted` | no matching `requestId`; or `response: 'accept'` with required questions unanswered → reject |
| `chat/pendingMessageRemoved` | no pending message with matching `id` + `kind` → reject |
| `chat/toolCallComplete` (client tool) | dispatcher's `clientId` ≠ `contributor.clientId` → reject |
| `invokeChangesetOperation` | `operationId` absent, or target `kind` not in the operation's `scopes` → JSON-RPC error |
