# Channels & State: URI scheme and every state shape

Types below are transcribed from the spec/docs; verify exact optionality against `types/*/state.ts` and
`schema/state.schema.json` upstream. All URIs are opaque to clients except where a template must be expanded.

## URI scheme

| URI | State type | Description |
|---|---|---|
| `ahp-root://` | `RootState` | Global state (agents, terminal catalogue, host config). Exactly one, always present. |
| `ahp-session:/<uuid>` | `SessionState` | Per-session state: metadata + the `chats` catalog. Provider is on the summary, **not** the URI. Client picks the `<uuid>` at creation. |
| `ahp-chat:/<cid>` | `ChatState` | Per-chat conversation (turns, streaming, tool calls, pending messages, input requests, draft). Server allocates `<cid>`. |
| `ahp-terminal:/<id>` | `TerminalState` | Per-terminal pty state. Scheme+path server-defined. |
| `ahp-changeset:/<id>` | `ChangesetState` | Per-changeset file-diff view. URI obtained by expanding a `Changeset.uriTemplate`. |
| `ahp-session:/<uuid>/annotations` | `AnnotationsState` | Per-session inline file annotations. Derived by appending `/annotations`; also surfaced on `SessionSummary.annotations.resource`. |
| `ahp-otlp:` *(authority/path host-defined)* | *stateless* | OpenTelemetry logs/traces/metrics. Concrete URIs advertised on `InitializeResult.telemetry`; opaque. |
| `ahp-resource-watch:/<id>` | `ResourceWatchState` | Per-watch channel from `createResourceWatch`; delivers `resourceWatch/changed`. `<id>` receiver-assigned. |
| `mcp://` *(host-defined)* | *stateless* | Constrained MCP side-channel, exposed on `McpServerCustomization.channel`. Speaks MCP verbatim. |

Clients MUST NOT subscribe to a scheme they do not understand. Future channel types (LSP relay, MCP relay) add
their own schemes.

## Root state (`ahp-root://`)

```typescript
RootState {
  agents: AgentInfo[]
  activeSessions?: number     // count of non-disposed sessions (badge counter)
  terminals?: TerminalInfo[]  // lightweight terminal catalogue
  config?: RootConfigState    // host-level configuration schema + values
}

AgentInfo {
  provider: string            // e.g. 'copilot'
  displayName: string
  description: string
  models: SessionModelInfo[]
  customizations?: Customization[]        // server-declared containers (Open Plugins)
  protectedResources?: ProtectedResourceMetadata[]   // per-agent auth requirements (RFC 9728)
  capabilities?: AgentCapabilities
}

AgentCapabilities {
  // absent ⇒ clients MUST NOT createChat beyond the default chat
  multipleChats?: { fork?: boolean }                 // {} = multi-chat; fork enables chat forking
  // absent ⇒ clients MUST NOT set >1 working dir or mutate the dir set
  multipleWorkingDirectories?: { requiresPrimary?: boolean }   // requiresPrimary ⇒ each chat needs a primary
}

SessionModelInfo {
  id: string; provider: string; name: string
  maxContextWindow?: number
  maxPromptTokens?: number         // per-request input-token cap
  maxOutputTokens?: number         // per-request output-token cap
  supportsVision?: boolean
  policyState?: 'enabled' | 'disabled' | 'unconfigured'
  configSchema?: ConfigSchema             // model-specific options (e.g. thinking level) → render as a form
  _meta?: Record<string, unknown>         // intrinsic facts, e.g. a well-known `pricing` key
}
```

`RootState` is mutated **only by server-originated actions** except `root/configChanged` (client-dispatchable).
The **session list is not here** — fetch via `listSessions` (paginated), keep live via `root/session*`
notifications. `config` uses a `ConfigSchema` (JSON-Schema-like: `type: 'object'`, `properties`, `required`)
with `ConfigPropertySchema` fields (`title`, `enum` + parallel `enumLabels`/`enumDescriptions`, `default`,
`readOnly`, nested `additionalProperties?`). The per-**session** variant (`SessionConfigSchema` /
`SessionConfigPropertySchema`, on `SessionState.config`, mutated by `session/configChanged`) additionally carries
`enumDynamic?` (options resolved at runtime) and `sessionMutable?` (whether the value can change after creation).

## Session state (`ahp-session:/<uuid>`)

```typescript
SessionState {
  // Session metadata, inlined (mirrored into the root-channel SessionSummary):
  provider: string
  title: string
  status: number                 // SessionStatus bitset (aggregated from chats)
  activity?: string
  project?: ProjectInfo          // { uri, displayName }
  workingDirectories?: URI[]      // equal-peer working dirs (multiroot)
  annotations?: AnnotationsSummary

  lifecycle: 'creating' | 'ready' | 'creationFailed'
  creationError?: ErrorInfo
  chats: ChatSummary[]           // catalog of chats in this session
  defaultChat?: URI              // advisory input-routing hint (chats are equal peers)
  activeClients: SessionActiveClient[]
  customizations?: Customization[]
  changesets?: Changeset[]       // catalogue of subscribable diff views
  inputNeeded?: SessionInputRequest[]   // session-level roll-up of blocks across chats
  config?: SessionConfigState
}
```

**Lifecycle:** initial snapshot after `createSession` is `lifecycle: 'creating'`; the host then dispatches
`session/ready` or `session/creationFailed` (with `creationError`). Chats accept turns only once `ready`.

### Session summary (root catalog entry)

```typescript
SessionSummary {
  resource: URI; provider: string; title: string
  status: number                 // SessionStatus bitset
  activity?: string
  createdAt: string; modifiedAt: string   // ISO 8601
  project?: ProjectInfo
  workingDirectories?: URI[]
  annotations?: AnnotationsSummary          // { resource, annotationCount, entryCount }
  changes?: ChangesSummary                   // optional roll-up of change stats
}
```

Identity fields (`resource`, `provider`, `createdAt`) never change and are omitted from
`root/sessionSummaryChanged.changes`.

### `SessionStatus` bitset (use bitwise checks)

| Name | Value | Bits | Meaning |
|---|--:|---|---|
| `Idle` | `1` | `1<<0` | No active turn, no pending input. |
| `Error` | `2` | `1<<1` | Most recent turn ended with an error. |
| `InProgress` | `8` | `1<<3` | A turn is active. |
| `InputNeeded` | `24` | `(1<<3)\|(1<<4)` | Active turn **and** an open input request or a tool call awaiting confirmation. **Includes** the `InProgress` bit. |
| `IsRead` | `32` | `1<<5` | Viewed since last modification. Cleared automatically on new turn / input request. Toggled via `session/isReadChanged`. |
| `IsArchived` | `64` | `1<<6` | Archived by the client. Toggled via `session/isArchivedChanged`. |

Bits 0–4 = mutually-exclusive **activity** (exactly one set). Bits 5+ = orthogonal **metadata** flags OR-combinable
with any activity. `(status & InProgress) !== 0` is true for both `InProgress` and `InputNeeded`. Idle+read+archived
= `1|32|64 = 97`.

### Chat aggregation onto the session summary

The host derives the session's mutable summary fields from its chats:

| Field | Derivation |
|---|---|
| `status` | Activity bits from `defaultChat` (else most-recently-modified chat). Promote `InputNeeded` if **any** chat needs input; promote `Error` if **any** chat errored. `IsRead`/`IsArchived` stay session-scoped, pass through. |
| `activity` | Mirror the activity string of the chat contributing the activity bits (the promoting chat when a non-default one wins). |
| `modifiedAt` | Max of every chat's `modifiedAt`. |
| `workingDirectory` | Session-level default; per-chat overrides are **not** aggregated up. |
| `changes` | Optional roll-up (sum per-chat stats, or the most expensive chat's). |

Single-chat sessions satisfy all of this trivially (chat values pass through).

### Aggregated input requests (`SessionState.inputNeeded`)

A session-level roll-up so a client watching only the session can find/answer blocks without subscribing to every
chat. Upserted via `session/inputNeededSet`, removed via `session/inputNeededRemoved`. Whenever non-empty, the
session `status` carries `InputNeeded`. Each entry is a `SessionInputRequest` (discriminated on `kind`), always
carrying the owning `chat` URI + the ids needed to respond:

| `kind` | Carries | Respond by |
|---|---|---|
| `chatInput` | mirrored `ChatInputRequest` | `chat/inputCompleted` (or `chat/inputAnswerChanged`) to that chat |
| `toolConfirmation` | `ToolCallConfirmationState` + `turnId` | `chat/toolCallConfirmed` or `chat/toolCallResultConfirmed` |
| `toolClientExecution` | `running` `ToolCallState` + `turnId` + owning `clientId` | `chat/toolCallComplete` (optionally `chat/toolCallContentChanged`) |
| `toolAuthentication` | `ToolCallAuthRequiredState` + `turnId` | **`authenticate`** (connection-level) with `toolCall.auth.resource` — *not* a `chat/*` action |

Answer by dispatching the ordinary `chat/*` action **to that chat's channel** even without subscribing first —
`inputNeeded` is a read/respond convenience surface; the chat channel remains the source of truth. The host
removes the aggregate entry once the chat-level request resolves.

## Chat state (`ahp-chat:/<cid>`)

```typescript
ChatState {
  // ChatSummary fields, inlined (mirrored into SessionState.chats via session/chatUpdated):
  resource: URI
  title: string
  status: number                 // SessionStatus bitset
  activity?: string
  modifiedAt: string
  origin?: ChatOrigin            // how the chat came to exist (user / fork / tool)
  interactivity?: ChatInteractivity   // 'full' (default) | 'read-only' (watch only) | 'hidden' (internal worker, not shown)
  workingDirectories?: URI[]      // subset of the session's (multiroot)
  primaryWorkingDirectory?: URI   // read-only, fixed at creation (when agent requiresPrimary)

  turns: Turn[]                  // completed turns
  turnsNextCursor?: string        // page older turns via fetchTurns
  activeTurn?: ActiveTurn        // the in-progress turn, if any
  steeringMessage?: PendingMessage
  queuedMessages?: PendingMessage[]
  draft?: Message                // user's in-progress input (state-only; NOT on ChatSummary)
}

ChatOrigin =                     // 'user' | fork | tool  (see features.md)
  | { kind: 'user' }
  | { kind: 'fork'; chat: URI; turnId: string }
  | { kind: 'tool'; chat: URI; toolCallId: string }
```

Producers MUST keep `ChatSummary` in the session catalog consistent with these inlined fields (dispatch
`session/chatUpdated` when any summary field changes). `origin` is a rendering hint, **not** a hierarchy — every
chat is an equally-addressable peer; ancestry (walking `origin.chat`) is advisory and MAY be incomplete/cyclic —
guard against missing refs, cycles, unbounded depth. Turn/message/tool-call/response-part shapes live in
`features.md` and `tool-calls.md`.

## Terminal state (`ahp-terminal:/<id>`)

```typescript
TerminalState {
  title: string
  cwd?: URI
  cols?: number; rows?: number
  content: TerminalContentPart[]
  exitCode?: number
  claim: TerminalClaim               // a terminal is ALWAYS owned
  supportsCommandDetection?: boolean
}

TerminalContentPart =
  | { type: 'unclassified'; value: string }   // raw VT output
  | { type: 'command'; commandId: string; commandLine: string; output: string;
      timestamp: number; isComplete: boolean; exitCode?: number; durationMs?: number }

TerminalClaim =
  | { kind: 'client'; clientId: string }
  | { kind: 'session'; session: URI; turnId?: string; toolCallId?: string }
```

Raw VT stream = `content.map(p => p.type === 'command' ? p.output : p.value).join('')`. Session claim with
`turnId`+`toolCallId` = actively used by a running tool call; without = backgrounded but still owned. Root
catalog entries are `TerminalInfo { resource, title, claim, exitCode? }`. See `features.md` for flows.

## Changeset state (`ahp-changeset:/<id>`)

```typescript
ChangesetState {
  status: 'computing' | 'ready' | 'error'
  error?: ErrorInfo
  files: ChangesetFile[]
  operations?: ChangesetOperation[]
}

ChangesetFile {
  id: string                     // typically after.uri (or before.uri for deletions)
  edit: FileEdit
  reviewed?: boolean             // GitHub "Viewed"; absent = not reviewed
  _meta?: Record<string, unknown>
}
```

Advertised on `SessionState.changesets` as lightweight `Changeset` catalog entries (`label`, `uriTemplate`,
`changeKind`, optional `capabilities.review`). See `features.md` for templates, operations, and review.

## Resource-watch state (`ahp-resource-watch:/<id>`)

```typescript
ResourceWatchState {         // captured at createResourceWatch, never mutates
  root: URI
  recursive: boolean
  excludes?: { items: string[] }
  includes?: { items: string[] }
}
```

Change events flow through the `resourceWatch/changed` action (batched `ResourceChange { uri, type }` where
`type` is `'added' | 'updated' | 'deleted'`), not through state mutation.

## Annotations state (`ahp-session:/<uuid>/annotations`)

```typescript
AnnotationsState { annotations: Annotation[] }

Annotation {
  id: string                   // assigned by the dispatching client
  turnId: string               // anchors to the file versions that turn produced
  resource: URI                // annotated file
  range?: TextRange            // omitted = whole file
  resolved?: boolean
  entries: AnnotationEntry[]    // >= 1; last-entry removal collapses the annotation
}
```

Every annotation MUST hold ≥1 entry (a conversation anchored to a file/turn). `AnnotationsSummary
{ resource, annotationCount, entryCount }` is surfaced on `SessionSummary.annotations` for badge UI. All
annotations actions are client-dispatchable (the host MAY also originate them) — see `actions-and-reducers.md`.

## Common cross-cutting types

- **`StringOrMarkdown`** — either a plain `string` or `{ kind: 'markdown', value: string }`.
- **`URI`** — a string URI.
- **`ErrorInfo`** — `{ errorType: string, message: string, stack?: string, _meta? }` carried on failed turns, changeset/operation errors, MCP errors, etc.
- **`ChangesSummary`** — `{ additions?: number, deletions?: number, files?: number }` — the roll-up on `SessionSummary.changes`.
- **`Icon`** — `{ src: URI (http(s) or `data:`), contentType?, sizes?: string[], theme?: 'light' | 'dark' }` used on agents/customizations for display. Consumers SHOULD only trust same-origin/trusted icon URLs and sanitize SVGs.
- **`TextRange` / `TextPosition`** — `{ start: { line, character }, end: {...} }`, zero-based **text** positions (UTF-16), not byte offsets.
- **`_meta: Record<string, unknown>`** — appears on many types (models, messages, usage, customizations, tool
  calls, system notifications, changeset files). Provider-specific escape hatch mirroring the MCP `_meta`
  convention. **Preserve every property verbatim when echoing.** Prefer a first-class field when one exists.
