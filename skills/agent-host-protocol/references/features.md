# Features: turns, elicitation, pending messages, customizations, MCP, changesets, terminals, telemetry

Covers the higher-level surfaces built on channels + actions. Wire framing is in `wire-protocol.md`; the action
tables are in `actions-and-reducers.md`; tool calls in `tool-calls.md`.

## Turns & messages

A **turn** is one request/response cycle. Completed turns live in `ChatState.turns`; the in-progress one in
`activeTurn`.

```typescript
Turn { id: string; message: Message; responseParts: ResponsePart[]; usage?: UsageInfo;
       state: 'complete' | 'cancelled' | 'error'; error?: ErrorInfo /* + startedAt, duration (0.6.0+) */ }
ActiveTurn { id: string; message: Message; responseParts: ResponsePart[]; usage?: UsageInfo }

Message {
  text: string
  origin: { kind: 'user' | 'agent' | 'tool' | 'systemNotification' }   // clients may only send 'user'
  attachments?: MessageAttachment[]
  model?: ModelSelection      // { id, config?: Record<string,string> }
  agent?: AgentSelection      // { uri }  — stable custom-agent URI, survives across sessions
  _meta?: Record<string, unknown>
}
```

`origin.kind`: `user` (direct), `agent` (self-produced), `tool` (e.g. seeding a spawned worker chat's first
message), `systemNotification`. `model`/`agent` record the selection a message was/will be sent with (retained for
edit/resend; omitted → host default).

**Attachments** (`MessageAttachment`, union on `type`, four variants):
- `simple` — opaque; the producer supplies the model view via `modelRepresentation?: string`.
- `embeddedResource` — small inline base64 payload (e.g. a pasted image).
- `resource` — extends `ContentRef` (`{ uri, sizeHint?, contentType?, displayKind?, selection? }`); content
  fetched via `resourceRead` when needed.
- `annotations` — `{ resource: URI (the annotations channel), annotationIds?: string[] }`; references some or all
  of a session's inline annotations (omit `annotationIds` for all).
Shared base (`MessageAttachmentBase`): `label`, optional `range` (a `TextRange` span in `text` referencing the
attachment — text range, not bytes), `displayKind` (`'image'|'document'|'symbol'|'directory'|'selection'|string`),
`_meta`. `selection` (`{ range }`) marks a selected range within a textual resource (distinct from `range`).
Preserve attachment `_meta` verbatim when echoing (especially attachments minted by `completions`).

### Response parts (single `responseParts` array, in stream order)

```typescript
MarkdownResponsePart          { kind: 'markdown';  id; content }        // chat/delta appends by partId
ReasoningResponsePart         { kind: 'reasoning'; id; content }        // chat/reasoning appends by partId
ToolCallResponsePart          { kind: 'toolCall';  toolCall: ToolCallState }
ContentRef                    { kind: 'contentRef'; uri; sizeHint?; contentType? }   // fetch via resourceRead
SystemNotificationResponsePart{ kind: 'systemNotification'; content: StringOrMarkdown; _meta? }
InputRequestResponsePart      { kind: 'inputRequest'; request: ChatInputRequest; response? }
```

**Create-then-append:** `chat/responsePart` creates a markdown/reasoning part with an `id`; then `chat/delta` /
`chat/reasoning` stream text into that `partId`. Derive display text by concatenating `markdown` parts; find tool
calls by filtering `toolCall` parts. `ContentRef` keeps big content (images, long tool output) out of the state
tree — fetch separately via `resourceRead(uri)`.

```typescript
UsageInfo { inputTokens?; outputTokens?; model?; cacheReadTokens?; _meta? }
```

### Message completions (`@`-mentions etc.)

`completions` command (chat-scoped) supports inline completion while composing:

```typescript
CompletionsParams { kind: 'userMessage'; channel: URI; text: string; offset: number /* UTF-16 */ }
CompletionsResult { items: CompletionItem[] }
CompletionItem    { insertText: string; rangeStart?: number; rangeEnd?: number; attachment: MessageAttachment }
```

Servers advertise auto-trigger chars via `InitializeResult.completionTriggerCharacters` (e.g. `['@','#']`).
On accept, replace `[rangeStart, rangeEnd)` with `insertText` and attach `attachment` to the resulting `Message`.
`InitializeResult.terminalCommandPrefix === "!"` marks `!`-prefixed messages as terminal commands.

## Elicitation (input requests)

A chat requests structured input via a **live** `InputRequestResponsePart` in the active turn — not a one-shot
RPC. Every chat subscriber sees open requests and synchronized answer drafts in their original stream position.

```typescript
InputRequestResponsePart {
  kind: 'inputRequest'
  request: { id: string; message?: string; url?: URI; questions?: ChatInputQuestion[];
             answers?: Record<string, ChatInputAnswer> }   // keyed by question id
  response?: 'accept' | 'decline' | 'cancel'                // absent = still live
}
```

**Lifecycle:** keep the turn active → `chat/inputRequested` (stable request `id` + stable question ids) inserts
an unresolved part at the current stream end → 0+ client `chat/inputAnswerChanged` (each updates one question's
draft/submitted/skipped answer; drafts sync across clients) → `chat/inputCompleted` sets `response` + final
answers **on the same part** (position preserved) → resume the blocked op (e.g. MCP `elicitation/create`).

While any live request lacks a `response`, the chat status carries `InputNeeded` and the session status is
promoted to `InputNeeded`. If the turn ends before submission, the unresolved part stays in the transcript
(`response` absent). The part is both the live interaction and its durable record.

**Question kinds → answer value shapes:**

| Question `kind` | Answer value |
|---|---|
| `text` | `{ kind: 'text', value: string }` |
| `number` / `integer` | `{ kind: 'number', value: number }` |
| `boolean` | `{ kind: 'boolean', value: boolean }` |
| `single-select` | `{ kind: 'selected', value: optionId, freeformValues?: string[] }` |
| `multi-select` | `{ kind: 'selected-many', value: optionIds[], freeformValues?: string[] }` |

Per-question extras: a `text` question MAY carry `defaultValue?`; a `single-select` question MAY set
`allowFreeformInput?` (let the user type a value outside the options); each `ChatInputOption` MAY be flagged
`recommended?`. `ChatInputAnswer.state` separates draft/submitted (`ChatInputAnswered`) from skipped
(`ChatInputSkipped`). A request MAY carry `url` instead of/with questions (open or review it, then complete).
Answer/complete actions reference the question by `questionId`. Server validation is in `actions-and-reducers.md`.

## Pending messages (steering & queued)

Each chat holds up to one `steeringMessage` and a `queuedMessages[]` (each `PendingMessage { id, message }`).
Set/upsert via `chat/pendingMessageSet` (with `kind: 'steering' | 'queued'`), remove via
`chat/pendingMessageRemoved`, reorder queued via `chat/queuedMessagesReordered`.

- **Steering** — injected into the **current** turn at a convenient point (guide the agent mid-flight). Only one
  at a time (new replaces old). When set while idle, stored until a turn starts; the host consumes it at its
  discretion, dispatching `chat/pendingMessageRemoved` when it does. Injection mechanism is opaque.
- **Queued** — auto-started as **new turns** FIFO after the current one finishes: host dispatches
  `chat/pendingMessageRemoved` (`kind: 'queued'`) then `chat/turnStarted` with `queuedMessageId` set. When queued
  while idle, consumed immediately.

## Truncation & forking

- **`chat/truncated`** (client-dispatchable, either side): with `turnId` keeps turns up to and including it;
  without `turnId` empties the chat. An active turn is silently dropped (status → idle). No-op if `turnId`
  unknown. Common pattern: truncate to `t-1`, then `chat/turnStarted` with an edited message.
- **Session fork** — `createSession` with `fork: { session: <sourceURI>, turnId }` copies content through that
  turn into an independent new session (later changes don't cross over). Host broadcasts `root/sessionAdded`.
- **Chat fork** — `createChat` with `source: ChatForkSource` forks from an existing chat at a turn; the new
  chat's `origin` is `{ kind: 'fork', chat, turnId }`.
- **Tool-spawned chat** — a chat spawned by a tool call carries `origin: { kind: 'tool', chat, toolCallId }`; the
  spawning tool call surfaces the same edge forward via a `ToolResultSubagentContent` block whose `resource` is
  the worker **chat** URI. Hosts MUST keep the two consistent.
- **Chat disposal** — the 0.7.0 `CommandMap` includes `disposeChat` (`params.channel = ahp-chat:/<cid>`) to
  remove a single chat; a chat is also implicitly disposed when its owning session is. Either way the host MUST
  update the session catalog via `session/chatRemoved` so subscribers release their per-chat subscriptions. (The
  prose spec page predates `disposeChat`; the type map is authoritative.)

## Multiroot working directories

Gated on the agent's `multipleWorkingDirectories` capability. At the **session** level directories are always
**equal peers** (`SessionState.workingDirectories`); there is no session primary. A **primary** is a per-chat
notion (`ChatState.primaryWorkingDirectory`, read-only, fixed at creation, present only when the agent
`requiresPrimary`).

- **Create:** pass `workingDirectories` (plural) to `createSession`; when `requiresPrimary`, also pass
  `primaryWorkingDirectory` (MUST be one of them) — it seeds the **default chat's** primary (the session stores
  none). Without the capability, only the first entry is used. Forked sessions ignore both fields (inherit source).
- **Manage after creation (state, via actions):** `session/workingDirectorySet` (add; no-op if present) /
  `session/workingDirectoryRemoved` (remove; host MAY decline, e.g. still a chat's primary — no atomic backend
  "remove one"). Verify the capability first.
- **Per-chat subset:** a chat may restrict to a subset via `createChat`'s `workingDirectories` (each must already
  be in the session set) + `primaryWorkingDirectory` when `requiresPrimary`. After creation:
  `chat/workingDirectorySet` (must be in the session set; host MUST reject otherwise) / `chat/workingDirectoryRemoved`
  (chat-only; the dir stays in the session set). Absent chat subset = inherit the full session set.

## Customizations (Open Plugins)

Extend sessions with agents, skills, prompts, rules, hooks, and MCP servers — a discriminated union in a shallow
tree exposed on `SessionState.customizations`. The **host is authoritative** on the effective tree.

- **Top-level = containers:** `PluginCustomization` (`type: 'plugin'`, an [Open Plugins](https://open-plugins.com/)
  package) or `DirectoryCustomization` (`type: 'directory'`, a watched dir). The host MAY also surface a **bare
  top-level** `McpServerCustomization`.
- **Children (leaves):** `AgentCustomization`, `SkillCustomization`, `PromptCustomization`, `RuleCustomization`,
  `HookCustomization`, `McpServerCustomization` — no further nesting; parent implied by the holding container.

**Identity — two distinct concepts:** `id` = session-unique opaque token used by **every** customization action
(toggle/update/remove), minted by the publisher. `uri` = descriptive **source** URI (package URL / directory /
file), plus optional `range` narrowing to an inline declaration's span. **Use `id` for protocol ops, `uri` for
durable references** (e.g. `AgentSelection.uri`).

**Container fields** carry `enabled`, host-reported `load` state, and `children`:

```typescript
PluginCustomization    { type:'plugin'; id; uri; name; icons?; enabled; clientId?; load?; children? }
DirectoryCustomization { type:'directory'; id; uri; name; icons?; enabled; clientId?; load?; children?;
                         contents: ChildCustomizationType; writable: boolean }
```

`load` (`CustomizationLoadState`): `loading` → `loaded` | `degraded` (`message`) | `error` (`message`).
`children` **absent** = not parsed yet; **empty** = parsed, nothing found. Children carry base fields + `enabled`
(optional on the five leaves — absent = enabled; **always present** on `McpServerCustomization`):

```typescript
AgentCustomization  { type:'agent';  description?; model?; tools?; disableModelInvocation?; disableUserInvocation? }
SkillCustomization  { type:'skill';  description?; disableModelInvocation?; disableUserInvocation? }
PromptCustomization { type:'prompt'; description? }
RuleCustomization   { type:'rule';   description?; alwaysApply?; globs? }
HookCustomization   { type:'hook';   event?; matcher? }
McpServerCustomization { type:'mcpServer'; enabled; state; channel?; mcpApp? }   // see MCP below
```

Agents/skills invocation matrix: `disableModelInvocation` hides it from the agent's auto-choices (user can still
pick); `disableUserInvocation` hides it from user pickers (agent can still invoke). Independent, both default
false. The protocol omits host-internal execution details (hook command, MCP `command`/`args`/`env`).

**Toggling:** `session/customizationToggled { id, enabled }` matches top-level entries then children; effective
child state = `container.enabled && (child.enabled ?? true)`. No-op on unknown id.

**Server updates:** `session/customizationsChanged` (replace top-level list); `session/customizationUpdated`
(upsert one container by `id`, **full-entry replacement including `children`** — per-child change = re-dispatch
the whole container); `session/customizationRemoved { id }` (containers cascade to children).

**Saving new customizations:** target a `DirectoryCustomization` with `writable: true` and `resourceWrite` into
it; the host watches the dir and re-dispatches `customizationUpdated`. No dedicated save action.

### Active clients & client-provided tools

A client joins via `session/activeClientSet` (upsert keyed by `clientId`), publishing its `tools` and
`ClientPluginCustomization[]` (a `PluginCustomization` + optional `nonce` for change detection):

```typescript
SessionActiveClient { clientId; displayName; tools: ToolDefinition[]; customizations: ClientPluginCustomization[] }
ToolDefinition {
  name; title?; description?
  inputSchema?:  { type: 'object'; properties?; required? }   // mirrors MCP Tool.inputSchema
  outputSchema?: { type: 'object'; properties?; required? }   // mirrors MCP Tool.outputSchema
  annotations?: ToolAnnotations   // advisory: title?, readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint?
  _meta?
}
```

- **Client tools are state, not RPC** — visible to all subscribers under `activeClients[].tools`. Execution uses
  the same state machine (see `tool-calls.md`); the server marks ownership via the tool call's client `contributor`.
- To update tools/customizations, **re-publish the whole entry** (there's no tools-only action). Hosts MAY use
  each customization's `nonce` to skip re-parsing.
- Server tools and client tools share a flat `name` namespace — hosts SHOULD ensure uniqueness (e.g. prefixing).
- **Leave:** `session/activeClientRemoved { clientId }`. The host SHOULD remove a client on unsubscribe, on
  disconnect past a host-defined grace period, or on reconnect that omits the session from `subscriptions`; it
  then drops the client's tools+customizations and fail-completes its in-flight tool calls.

## MCP servers

An `McpServerCustomization` represents one MCP server in a session. AHP does **not** re-spec MCP — it exposes
just enough to render, authenticate, and (optionally) drive an MCP App. Find MCP servers at either position:

```typescript
state.customizations
  ?.flatMap(c => c.type === 'mcpServer' ? [c] : (c.children ?? []))
  .filter(c => c.type === 'mcpServer')
```

**Shape:** `{ type:'mcpServer'; id; uri; name; icons?; range?; enabled; state; channel?; mcpApp? }`.

**Runtime `state`** (`McpServerState`, discriminated on `kind`) — the host's view, separate from `enabled` (user
intent): `starting` → `ready` | `authRequired` (carries `ProtectedResourceMetadata`) | `error` (`ErrorInfo`);
`ready` may go `authRequired` / `error` / `stopped`; `authRequired` → `ready` on `authenticate`. High-frequency
transitions go through the narrow `session/mcpServerStateChanged` (upserts `state` + optional `channel`); use
`session/customizationUpdated` for name/icons/`mcpApp`.

**Managing the process** without changing `enabled`: `session/mcpServerStartRequested` (→ `starting`, clears
stale `channel`) / `session/mcpServerStopRequested` (→ `stopped`; unblocks an `authRequired` server and removes
its input-needed entry). Toggling `enabled` off signals the host to stop.

**Authentication** reuses the `authenticate` command, driven entirely by state (no MCP-specific notification).
`McpServerAuthRequiredState` carries: `reason` (`required`/`expired`/`insufficientScope`), optional `oauthClient`
(pre-registered — `clientId`, optional `clientSecret` = confidential; else public/PKCE), `resource`
(`ProtectedResourceMetadata`, whose inner `resource` is the canonical MCP server URI passed to `authenticate`),
`requiredScopes` (from `WWW-Authenticate`, authoritative — don't assume it relates to `scopes_supported`), and
`description`. Step-up (`insufficientScope`) usually surfaces mid-turn — the host SHOULD raise session
`InputNeeded`, and clients SHOULD watch the `state.kind` of the MCP server backing a running tool call (via the
tool call's `mcp` contributor) and offer a "grant additional access" affordance tied to *that* call. This
server-level state is distinct from the tool-call-level `auth-required` (see `tool-calls.md`).

**MCP tools** follow the normal tool-call flow; the originating server is identified by `contributor = { kind:
'mcp', customizationId }`. No separate "MCP tool" state.

### The `mcp://` side-channel

An optional stateless channel letting a client originate a **constrained subset** of MCP against a server the
host already runs. URI is exposed on `McpServerCustomization.channel` (scheme `mcp://`, opaque). It speaks MCP
**verbatim** (JSON-RPC 2.0) plus the universal `channel: URI` envelope. The MCP `initialize` handshake is **not**
carried (the client joins an in-flight session). The served surface is the **union** of capability sets on the
owning customization; today the only set is `AhpMcpUiHostCapabilities`:

| Capability flag | Methods served (client→host→server) | Notifications forwarded |
|---|---|---|
| `serverTools` | `tools/list`, `tools/call` | `notifications/tools/list_changed` (when `listChanged`) |
| `serverResources` | `resources/list`, `resources/templates/list`, `resources/read` | `notifications/resources/list_changed` (when `listChanged`) |
| `logging` | `logging/setLevel`, `notifications/message` | — |
| `sampling` | `sampling/createMessage` | — |

Any method outside every advertised set MUST be rejected with `-32601`. The host MAY expose `channel` only while
the customization is `ready`; clients MUST re-read `channel` on every customization update (it MAY change, e.g.
after restart) and treat its absence as "unavailable".

### MCP Apps (SEP-1865)

An MCP server may ship a UI resource (HTML) rendered for a specific tool call in a client-controlled sandbox.
AHP carries **no** `ui/*` traffic — that lives between the client and the iframe. Client opts in with
`InitializeParams.capabilities.mcpApps = {}`. Support is advertised per server via `McpServerCustomization.mcpApp
= { capabilities: AhpMcpUiHostCapabilities }` — a **subset** of the upstream `HostCapabilities` covering only what
depends on the host↔server relationship (`serverTools`, `serverResources`, `logging`, `sampling`); the client
fills `openLinks`/`downloadFile`/`sandbox`/`experimental` itself. An App tool call is signalled by (1)
`contributor = { kind:'mcp', customizationId }` and (2) `_meta.ui` mirroring `McpUiToolMeta` (`{ resourceUri?,
visibility? }`); absent `_meta.ui.resourceUri` = ordinary MCP tool call. The client resolves the UI resource over
`mcp://` (`resources/read`), mounts the iframe, runs `ui/initialize`, pumps `ui/notifications/tool-input` +
`tool-result`, and routes the View's `tools/*` / `resources/*` / `logging/*` / `sampling/*` back over `mcp://`.

## Changesets

A **changeset** is a named, individually subscribable view of file changes for a session. The catalogue is on
`SessionState.changesets` (kept live by `session/changesetsChanged`):

```typescript
Changeset {
  label: string
  uriTemplate: string          // RFC 6570 — expand to a subscribable ahp-changeset:/<id> URI
  description?: string
  changeKind: string           // advisory: 'session'|'branch'|'uncommitted'|'turn'|'compare-turns'|other
  capabilities?: { review?: {} }   // presence ⇒ per-file review workflow supported
}
```

**Template variables** (ignore templates with unknown vars): none = static session-wide (template *is* the URI);
`{turnId}` = per-turn slice (expand with a `Turn.id`); `{originalTurnId}` + `{modifiedTurnId}` = diff between two
turns. Changesets aren't scoped to one working directory (a per-turn/session changeset spans every dir touched);
a client groups by directory itself by matching file URIs against `workingDirectories`, or the host MAY advertise
dedicated per-directory changesets.

**State** (`ChangesetState`) and its actions are in `channels-and-state.md` / `actions-and-reducers.md`. Key
points: `status` = `computing`|`ready`|`error`; files upsert via `changeset/fileSet` / removed via
`changeset/fileRemoved` / full-replace via `changeset/contentChanged`.

**File review** is a **capability** (`capabilities.review`). Each `ChangesetFile.reviewed?` = GitHub "Viewed"
(absent = not reviewed). `changeset/filesReviewChanged` is the **only client-dispatchable** changeset action
(host may also originate it) — **batched** `{ files: string[], reviewed: boolean }`, unknown ids ignored. Review
is **not** auto-reset on content change (no per-file version); the server resets it explicitly (re-emit the file
without `reviewed: true`, or `filesReviewChanged { reviewed: false }`).

**Operations** — server-declared invokable verbs (revert, etc.):

```typescript
ChangesetOperation { id; label; description?; scopes: ('changeset'|'resource'|'range')[];
                     confirmation?: StringOrMarkdown; icon?;
                     status: 'idle'|'running'|'error'|'disabled'; error? }
```

Invoked via the **`invokeChangesetOperation`** command (not a dispatched action, because it returns data and may
fail per call):

```typescript
invokeChangesetOperation({ channel: URI; operationId: string;
  target?: { kind:'resource'; resource: URI; side?:'before'|'after' }
         | { kind:'range'; resource: URI; side?:'before'|'after'; range: TextRange }
}) → { message?: StringOrMarkdown; followUp?: { content: ContentRef; external?: boolean } }
```

The server validates `operationId` exists and the target `kind` is in the operation's `scopes` (else JSON-RPC
error); progress/outcome flow back via `changeset/operationStatusChanged` so all subscribers see a consistent
view. **Lifecycle:** catalogue on `SessionState.changesets` → client subscribes to expanded URIs → snapshot
(`status: 'computing'` allowed) then `changeset/*` updates → operations → on session end, subscribers get
`changeset/cleared` and are unsubscribed.

## Terminals

First-class root-scoped subscribable ptys, independent of any session. **Always owned** via a `claim` (client or
session; see `channels-and-state.md` for `TerminalState`/`TerminalClaim`/content parts). Root carries a
lightweight `TerminalInfo[]` catalogue kept live by `root/terminalsChanged` (full replacement).

- **Create:** `createTerminal` with a required initial `claim` + optional `name`, `cwd`, `cols`, `rows`. Then
  `root/terminalsChanged` fires; subscribe to the terminal URI for full state.
- **Dispose:** `disposeTerminal` kills the pty (if running) and removes it (`root/terminalsChanged`). There is no
  "release without disposal".
- **I/O split** (write-ahead unsafe for a mutable pty): `terminal/input` (client→pty, side-effect-only, reducer
  no-op) vs `terminal/data` (server→client, appended to the tail content part). **Strip shell-integration escape
  sequences from `terminal/data` before dispatch.**
- **Command detection** (shell integration): `terminal/commandExecuted` (new `command` part) → `terminal/data`
  (appends to its `output`) → `terminal/commandFinished` (`exitCode`, `durationMs`). Clients MUST check
  `supportsCommandDetection` before relying on boundaries.
- **Claim narrowing** models background: `{ session, turnId, toolCallId }` (active tool call) → `{ session }`
  (backgrounded, still owned) → the session's disposal cleans up its terminals. Any client may claim; conflicts
  resolve server-wins with `rejectionReason`. Multiple clients see the same terminal via subscription.

## Telemetry (OTLP)

The `ahp-otlp:` channel is a thin pass-through of **OTLP/JSON** verbatim (AHP adds only the routing envelope; it
does not redeclare the OTel data model). The host advertises signal URIs on `InitializeResult.telemetry`
(`{ logs?, traces?, metrics? }`); each optional. Clients treat URIs as opaque except for expanding well-known
template vars, and subscribe to the ones they can process.

- **Stateless** — `subscribe` returns `{}`; not replayed on reconnect (re-subscribe, resume at the live edge).
- **Notifications:** `otlp/exportLogs` / `otlp/exportTraces` / `otlp/exportMetrics`, params `{ channel, payload }`
  where `payload` is the OTLP/JSON `ExportXxxServiceRequest` verbatim (`resourceLogs` / `resourceSpans` /
  `resourceMetrics`). Route by `channel`, then parse `payload`.
- **Log filtering:** a host supporting it advertises a template with `{level}` (e.g. `"ahp-otlp://logs{?level}"`).
  Expand to a min `SeverityNumber` band by short name (`trace`/`debug`/`info`/`warn`/`error`/`fatal`, e.g.
  `info` → `>= 9`). Each expansion is its own subscription URI (independent pre-filtered streams). Literal URI =
  all severities. No filter vars for traces/metrics.
- **Correlation** (conventions, not protocol fields): `service.name`, `ahp.session.id`, `ahp.turn.id`,
  `ahp.tool_call.id` as OTel resource/record attributes.
