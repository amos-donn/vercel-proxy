# Mezze — architecture

Two layers exist in this repository:

1. **What runs now** — a React SPA with a deterministic dual-process engine, a D1-backed account workspace, encrypted BYOK keys, an MCP client, and a Worker that serves the SPA plus the API.
2. **What the UI is designed for** — a durable Cloudflare runtime with D1, a Durable Object per thread, Workflows for jobs and approvals, and an encrypted BYOK vault.

This document keeps the two separate so the prototype is not mistaken for the production runtime.

---

## 1. Implemented topology

```
browser
  React 19 SPA
   ├── StoreProvider (src/store.tsx)        session state: chats, files, secrets,
   │                                        audit, jobs, media, automations, agents
   ├── engine/runtime.ts                    turn orchestration
   │    ├── engine/jev.ts                   typed questions, routing, trace
   │    └── engine/system2.ts               plans, prose, artifacts
   └── fetch('/api/jev' | '/api/system2')   only when settings.runtime === 'live'
          │
          ▼
Worker  sosystem.amos-donn.workers.dev
   ├── ASSETS.fetch                       dist/ SPA, run_worker_first for /api/*
   ├── /api/health                        booleans only, no key material
   ├── /api/jev                           server-side Jev proxy
   └── /api/system2                       OpenAI-compatible chat proxy
```

There is no database, no Durable Object and no session in this pass. Reloading clears every store. That is an explicit product decision, not an unfinished wire.

## 2. Turn lifecycle (implemented)

```
executeTurn(input)
  ├── runtime === 'simulated' → simulatedTurn()
  └── runtime === 'live'      → liveTurn(), catch → simulatedTurn() + notice

simulatedTurn
  1. simulateAnswers()             deterministic typed answers
  2. route()                       accept / escalate / risk gate
  3. tools[]                       search, read, inspect, transcribe
  4. needsProse guard              S1 tool decisions that need words → escalate
  5. makeTrace()                   decision, probabilities, cost, savings
  6. decision switch
       respond     → S1 template only
       search/read → tools, then S2 prose
       write_file  → plan + approval (never auto-writes)
       transcribe  → plan + paused job + media state
       inspect_job → attempt-log tool + S2 analysis
       escalate    → S2 plan/prose/artifact
```

The UI consumes `TurnResult` in `src/pages/ChatView.tsx`: append trace, run tools with a short running state, append plan/approval/artifact/job, then stream the assistant words. The same code path is used for new chats, follow-ups and automation runs.

### Live path

`liveTurn()` posts `buildStepRequest()` to `/api/jev`, reads typed answers, calls `/api/system2` only when the router escalates, and builds the same `DecisionTrace` shape. A missing route, non-JSON response, HTTP error or absent key falls back to simulation **per turn**, with a notice. The client never sees a provider key.

## 3. Typed contracts

`src/types.ts` is the single source of truth:

- `Question` / `Answer` — Jev's typed surface. `choice` answers carry probabilities and confidence; `noul` answers carry `value`/`noul`; file choice carries an id.
- `DecisionTrace` — route, S1 metrics, probabilities, validation, escalation, baseline and saved cost.
- `ChatMessage` — user, assistant, trace, plan, tool, approval, artifact, notice.
- Workspace entities — files, secrets, audit, jobs, quotas, media/transcripts, automations, integrations, agents, providers, settings.

UI-only fields (`streaming`, `selected`) stay out of what a durable store would persist.

## 4. Routing policy

| Signal | Condition | Result |
| --- | --- | --- |
| Needs deliberation | `needs_system_2 ≥ escalate` (default 0.55) | S2 |
| Low confidence | `confidence < accept` (default 0.62) | S2 |
| Explicit escalation | `next.choice === 'escalate'` | S2 |
| Risky write | `write_file` and `action_is_risky ≥ risky` (0.50) | S1 plans, human gate |
| Composed prose | Tool selected but reply must be written | S2 |
| Otherwise | Template or fixed tool slot | S1 |

A write decision is never auto-applied by the router. It becomes an approval card; approving writes the file through the store, denying leaves the workspace untouched.

## 5. State boundaries

`StoreProvider` holds the whole workspace in React state and exposes typed actions. It is intentionally the only place with mutation logic:

- `createChat` / `appendMessage` / `patchMessage` / queue for a pending first prompt.
- `writeFile` / `deleteFile` — path comes from the engine or the Files page, already validated.
- `addSecret` / `revealSecret` / `deleteSecret` — reveal writes an audit entry.
- `patchJob` / `addJob` — job transitions and demo queue.
- `patchMedia` / transcript state.
- Automations, integrations, agents, settings.

This is the seam a D1-backed repository will replace. Components never write storage directly.

## 6. API proxy contract

### `GET /api/health`

```json
{ "ok": true, "service": "mezze", "version": "0.4.1",
  "jev": true, "system2": false, "now": 1760000000000 }
```

Only booleans and metadata. No masks, no key fragments.

### `POST /api/jev`

Request: `{ model, state, questions }` (built by `buildStepRequest`).
Response: `{ answers: [...] }`.

The Worker forwards to `${TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai'}/v1/answer` with `Authorization: Bearer $TYPESAFE_API_KEY`. The path is configurable because it should be verified against current TypeSafe documentation at deploy time.

### `POST /api/system2`

Request: `{ model, messages }`.
Response: `{ plan: string[], prose: string, model, usage: { promptTokens, completionTokens, cost } }`.

The Worker forwards to an OpenAI-compatible `${SYSTEM2_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, asks for a JSON object, and tolerates non-JSON prose. Cost is estimated from token usage; the UI labels modeled costs as modeled.

Both POST routes require `application/json`, cap the body at 64 KB, reject non-POST with 405, and return 503 when the matching key is absent.

## 7. Security posture

**Now**

- Provider keys are Worker secrets, never client state.
- `/api/health` reveals only configured/not configured.
- The Vault's restricted secrets cannot be revealed or copied, even locally.
- Approval scope is shown on the card; writes are gated by the router and by the UI.
- There is no auth. Any deployed instance is effectively a single-user demo; do not put real traffic or real keys behind it until the next pass.

**Next**

- Session auth, workspace id derived from the session (never the body), and every query scoped by it.
- Envelope encryption for BYOK: KEK in Secrets Store → per-key DEK → AES-256-GCM ciphertext in D1; decrypt only in the model-call path; no plaintext in logs or DO state.
- Durable approvals written once with actor/time; Workflow resolves only the matching id.
- SSRF filtering and an egress allowlist before any fetch/browser/MCP tool.
- Prompt-injection rule: fetched content is data; actions derived from it require approval.

## 8. Target durable runtime

```
Worker
 ├── /api/threads/:id/events     SSE with Last-Event-ID replay
 ├── ThreadAgent (DO)            live stream, hot cursor, pending approval
 ├── Workflow                    long jobs, rate-limit waits, approvals
 ├── D1                          threads, messages, traces, files metadata,
 │                              secrets (ciphertext), jobs, usage
 ├── R2                          artifacts, full tool output, media
 └── AI Gateway / provider fetch with the user's key
```

Jobs already model the states the Workflow will expose: `paused_rate`, `paused_quota`, `awaiting_approval`, `dead_letter`, with Retry-After + truncated exponential backoff + jitter + preserved idempotency key. The UI is the contract.

D1 sketch:

```sql
create table threads (id text primary key, workspace_id text not null, title text,
  agent_id text, pinned integer default 0, created_at integer, updated_at integer);
create table messages (id text primary key, thread_id text not null, seq integer not null,
  kind text not null, payload text not null, created_at integer, unique (thread_id, seq));
create table traces (id text primary key, thread_id text not null, message_id text not null,
  route text, decision text, confidence real, s1_cost real, s2_cost real, payload text);
create table files (path text primary key, workspace_id text not null, bytes integer,
  origin text, updated_at integer);
create table secrets (id text primary key, workspace_id text not null, key text not null,
  ciphertext text, iv text, wrapped_dek text, visibility text, scopes text);
create table jobs (id text primary key, workspace_id text, state text, attempt integer,
  max_attempts integer, resume_at integer, idempotency_key text, payload text);
create table audit (id text primary key, workspace_id text, action text, key text,
  actor text, outcome text, at integer);
```

## 9. Failure modes already visible in the UI

| Failure | Current behavior | Durable behavior |
| --- | --- | --- |
| Missing Jev key | turn falls back to simulation + notice | 503 → queue or explicit config error |
| System 2 error | fallback turn + notice | retry, then pause with reason |
| Rate limit | `paused_rate` with countdown | Workflow waits, resumes automatically |
| Quota cap | `paused_quota` | wait for window or raise cap |
| Risky write | approval card | approval event + Workflow wait |
| Dead letter | attempt log + replay | manual replay with same idempotency key |
| Dropped stream | not applicable yet | `Last-Event-ID` replay from D1 |

## 10. Deploy

```bash
npm run build
npx wrangler deploy
```

Worker secrets:

```bash
npx wrangler secret put TYPESAFE_API_KEY
npx wrangler secret put SYSTEM2_API_KEY
```

Optional vars: `TYPESAFE_BASE_URL`, `SYSTEM2_BASE_URL`, `SYSTEM2_MODEL`.

Target: `https://sosystem.amos-donn.workers.dev`. D1 database `sosystem` is bound as `DB` in `wrangler.jsonc`; the Worker creates its tables on the first request.

## 11. Migration order

Done:

1. Auth + workspace scoping.
2. D1 schema + snapshot persistence behind the same `StoreProvider` action names.
3. Encrypted provider keys, rotation and audit.
4. MCP client: initialize, `tools/list`, `tools/call`, encrypted bearer tokens.
5. Skills as reusable System 2 instructions with `/` attachment.

Next:

1. ThreadAgent DO + SSE replay.
2. Workflow jobs/cron using the existing job states.
3. Real tools: sandbox shell, files, GitHub App, Gemini transcription.
7. Billing ledger and cap enforcement before model calls.
