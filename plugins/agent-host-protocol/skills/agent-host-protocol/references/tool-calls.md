# Tool-Call Lifecycle

A tool call is a `ToolCallResponsePart` (`kind: 'toolCall'`) inside a turn's `responseParts`, holding a
`ToolCallState` — a **discriminated union on `status`** where each phase only exposes valid fields. Ground
truth: `types/channels-chat/state.ts` + the `019-`, `020-`…`028-`, `070`, `127-132`, `158`, `163`, `241-255`
reducer test cases.

## State machine

```
[*] --> streaming                              (chat/toolCallStart)

streaming --> pending-confirmation             (chat/toolCallReady)
streaming --> running                          (chat/toolCallReady, auto-confirmed)

pending-confirmation --> running               (chat/toolCallConfirmed, approved)
pending-confirmation --> cancelled             (chat/toolCallConfirmed, denied/skipped)

running --> pending-confirmation               (chat/toolCallReady, re-confirmation)
running --> auth-required                       (chat/toolCallAuthRequired, MCP only)
running --> completed                           (chat/toolCallComplete)
running --> pending-result-confirmation         (chat/toolCallComplete, requiresResultConfirmation)

auth-required --> running                       (chat/toolCallAuthResolved)
auth-required --> completed                      (chat/toolCallComplete, FAILED result only = cancel)

pending-result-confirmation --> completed        (chat/toolCallResultConfirmed, approved)
pending-result-confirmation --> cancelled         (chat/toolCallResultConfirmed, denied)

completed --> [*]
cancelled --> [*]
```

## States and their fields

| Status | Key fields | Meaning |
|---|---|---|
| `streaming` | `partialInput?` | LM streaming params; `partialInput` accumulates via `toolCallDelta`. |
| `pending-confirmation` | `invocationMessage`, `toolInput?`, `edits?`, `editable?`, `options?`, `riskAssessment?`, `_meta?` | Params complete (or mid-exec re-confirmation). `edits` (`{ items: FileEdit[] }`) previews file changes; `editable` = client may edit params; `options` = richer choices; `riskAssessment` = safety score (below). |
| `running` | `confirmed`, `selectedOption?`, `content?` | Executing. `confirmed` records how it was approved. |
| `auth-required` | `confirmed`, `selectedOption?`, `contributor` (MCP), `auth`, preserved `invocationMessage`/`toolInput`/`content` | Paused on MCP auth. **MCP-contributed only** (structurally enforced). |
| `pending-result-confirmation` | `success`, `pastTenseMessage`, `content?`, `selectedOption?` | Finished; waiting for the client to approve the **result**. |
| `completed` | `success`, `pastTenseMessage`, `content?`, `selectedOption?` | Terminal. Tool finished. |
| `cancelled` | `reason`, `reasonMessage?`, `userSuggestion?`, `selectedOption?` | Terminal. `reason` ∈ `'denied' \| 'skipped' \| 'result-denied'`. |

`confirmed` + `selectedOption?` are a shared `ToolCallPostConfirmationFields` base (invariant: "confirmation
already resolved") present on `running`, `auth-required`, `pending-result-confirmation`, `completed`.
`pending-confirmation` (not yet confirmed) and `cancelled` (never ran) keep their own fields.

## `contributor` — who owns the call

`chat/toolCallStart` carries `toolName` (internal name), `displayName` (human-readable), optional `intention` (what the invocation intends to do), and `contributor?`. `contributor` is a `ToolCallContributor`:
- `{ kind: 'client', clientId }` → a **client-provided tool**; the owning client executes it.
- `{ kind: 'mcp', customizationId }` → contributed by an MCP server (`McpServerCustomization.id`); render its
  name/icon. Only MCP contributors can enter `auth-required`.
- Absent/server → a normal server-side tool.

## Risk assessment (0.6.0+)

A `pending-confirmation` tool call MAY carry an asynchronous `riskAssessment?: ToolCallRiskAssessment` — a
discriminated union on `status`:

- `loading` — assessment in flight (`kind: 'judge'`).
- `complete` — `{ kind: 'judge', reason: StringOrMarkdown, safety: number }` where `safety` is a normalized
  float, **`0` = unsafe … `1` = safe**, and `reason` is the judge's explanation.

It is stored/updated on `chat/toolCallReady` (the reducer stores a loading assessment, then completes it on a
later `toolCallReady`; ignored for finished tool calls). Clients MAY surface the score/explanation next to the
approve/deny UI.

## Tool result content (`content` blocks)

The `content?` on `running` / `pending-result-confirmation` / `completed` (and streamed via
`chat/toolCallContentChanged`) is a list of `ToolResultContent` — a union of:

| Variant | Shape (key fields) |
|---|---|
| `ToolResultTextContent` | plain text output |
| `ToolResultEmbeddedResourceContent` | small inline base64 resource |
| `ToolResultResourceContent` | extends `ContentRef` — large content fetched by URI |
| `ToolResultFileEditContent` | extends `FileEdit` — a file change produced by the tool |
| `ToolResultTerminalContent` | `{ resource: URI (terminal), title?, isPty?, result?: ToolResultTerminalCommandResult { exitCode?, preview?, previewTruncated? } }` |
| `ToolResultSubagentContent` | `{ resource: URI (worker chat), title?, agentName?, description? }` — the forward edge to a tool-spawned worker chat (mirrors that chat's `origin.kind: 'tool'`) |

The result carried by `chat/toolCallComplete` is a **`ToolCallResult`**:
`{ success: boolean, pastTenseMessage: StringOrMarkdown, content?: ToolResultContent[], structuredContent?: Record<string,unknown> (mirrors MCP CallToolResult.structuredContent), error?: { message, code? } }`.

## Confirmation flow

Default is a binary approve/deny UI for `pending-confirmation`. Approve/deny by dispatching
`chat/toolCallConfirmed`:

```jsonc
{ "type": "chat/toolCallConfirmed", "turnId": "t1", "toolCallId": "tc1",
  "approved": true, "confirmed": "user-action",
  "selectedOptionId": "approve-session",   // optional, when options were offered
  "editedToolInput": { /* ... */ } }        // optional, only when editable === true
```

- Deny with `approved: false` + `reason` (`'denied'` or `'skipped'`) → `cancelled`.
- **Only the first `toolCallConfirmed` wins**; the host rejects subsequent ones (`rejectionReason`). The host
  arbitrates across clients.
- **Editable params:** when `editable: true`, an included `editedToolInput` **replaces** the original `toolInput`
  on the transition to `running`.

### Confirmation options (richer than approve/deny)

`options?: ConfirmationOption[]`, each:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Returned as `selectedOptionId`. |
| `label` | string | Localise using the client's `initialize` `locale`. |
| `kind` | `'approve' \| 'deny'` | Classifies the option. |
| `group` | number? | Display in definition order; different groups MAY insert dividers. |

The reducer resolves the chosen `ConfirmationOption` and stores it as `selectedOption` on the resulting `running`
/ `cancelled` state; it carries through to `completed` and result-confirmation/denial.

### Result confirmation

If the server sets `requiresResultConfirmation`, `chat/toolCallComplete` moves the call to
`pending-result-confirmation`. The client then dispatches `chat/toolCallResultConfirmed` (approve → `completed`,
deny → `cancelled` with `reason: 'result-denied'`).

## Mid-execution re-confirmation

A `running` tool needing more approval (e.g. a shell permission) gets another `chat/toolCallReady` **without**
`confirmed`, transitioning `running → pending-confirmation` (updating `invocationMessage`, an optional
`confirmationTitle`, and `_meta`). Resolve with the normal `chat/toolCallConfirmed` flow.

## Mid-execution MCP authentication (`auth-required`)

For an MCP-contributed `running` call that hits an auth challenge (commonly a 403 insufficient-scope step-up):

1. Server dispatches `chat/toolCallAuthRequired` with `auth: McpAuthRequirement`
   (`{ reason, oauthClient?, resource, requiredScopes?, description? }` — **no token**), `running → auth-required`.
   This is a **first-class status**, not a generic "blocked" — its resolution path differs from approve/deny.
2. Host SHOULD also raise `session/inputNeededSet` with a `toolAuthentication` entry so it's visible at the
   session level (see `channels-and-state.md`).
3. Client obtains a token for `auth.resource` and pushes it via the connection-level **`authenticate`** command
   (`resource` matches `toolCall.auth.resource`). Host then dispatches `chat/toolCallAuthResolved`,
   `auth-required → running`, restoring pre-pause fields (`invocationMessage`, `toolInput`, `confirmed`,
   `selectedOption`, `content`).
4. **Cancel path:** the client MAY instead dispatch `chat/toolCallComplete` with a **failed** result
   (e.g. `error.code: 'cancelled'`). The reducer accepts this from `auth-required` and goes **straight to
   `completed`** — `requiresResultConfirmation` is ignored (a cancelled challenge produced no real result).
5. A **successful** result dispatched from `auth-required` is **invalid** — the reducer ignores it as a no-op
   (stays `auth-required`), so a client can't bypass the pending auth by claiming success. Only
   `chat/toolCallAuthResolved` (real token exchange) resumes it.

This tool-call `auth-required` is deliberately **separate** from the MCP server's own `authRequired` lifecycle
state (`McpServerAuthRequiredState`): "the server needs auth" and "this invocation is waiting on that auth" are
independent facts.

## Client-provided tool execution

Client tools live in `SessionState.activeClients[].tools` (state, not RPC) and follow the same state machine —
only *who executes* differs. Sequence:

1. `chat/toolCallStart` — `contributor.clientId` = owning client (tells it to execute).
2. `chat/toolCallDelta` (0+) — streamed params; client can preview `partialInput`.
3. `chat/toolCallReady` — typically `confirmed: 'not-needed'` → straight to `running` (or omit `confirmed` to
   require user confirmation first).
4. **Client executes** using `toolInput` when the call reaches `running`.
5. `chat/toolCallContentChanged` (0+, client-dispatched) — stream intermediate `content` (e.g. terminal output).
6. `chat/toolCallComplete` (client-dispatched) — the result. Server MUST reject if the dispatcher's `clientId`
   ≠ `contributor.clientId`.

- **Unrecognised tool** (stale registration): the client MUST dispatch `chat/toolCallConfirmed` with
  `approved: false`, `reason: 'denied'`.
- **Removed client cleanup:** when the host removes an active client, it SHOULD **fail-complete** that client's
  in-flight tool calls across the session — `chat/toolCallComplete` with `result.success = false`. Note this ends
  in `completed` (success:false), **not** `cancelled` (which is reserved for user denial/skip/result-denied and
  the whole-turn `chat/turnCancelled`). There is no per-tool-call server-initiated cancel action.

## Turn end

When a turn completes/cancels/errors, non-terminal tool calls in `responseParts` are **force-cancelled** with
`reason: 'skipped'` (including `running` and `auth-required` calls).
