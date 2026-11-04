# sosystem

A **bring-your-own-key agent workspace** with two brains:

- **System 1 — Jev (TypeSafe AI)** answers typed questions. It picks the next action, scores risk, and decides whether a turn needs deliberation. It never writes a sentence.
- **System 2 — a heavy LLM** plans, judges and writes the prose. It only sees the turns System 1 cannot finish from a template or a fixed tool call.

Around that loop sits a superapp shell: home composer, pinned chats, search, files, a secret vault, durable-looking jobs with rate-limit waits, media transcription with a transcript-synced player, automations, MCP integrations, agent configuration and settings.

> **Status:** accounts, D1 persistence, encrypted BYOK keys, MCP tool calls and skills are implemented. The loop runs deterministically in the browser when the runtime is **Simulated**; **Live Worker** sends the same turns to `/api/jev` and `/api/system2` using the key stored for your account. A real sandbox, shell and provider billing are still out of scope.

---

## Run it

```bash
npm install
npx wrangler dev            # Worker + local D1 on :8787
npm run dev                 # SPA on :3000, proxies /api to :8787
npm run check               # tsc --noEmit (client + worker)
npm run build               # typecheck + vite build → dist/
```

Create an account on first load; the workspace is empty apart from starter memory files and four builtin skills. No provider key is needed to exercise the product: leave the runtime on **Simulated**, type in the home composer, approve the write gate, then inspect the trace panel. Add keys in **Vault** and switch to **Live Worker** for real calls.

## What is implemented

| Surface | Shipped behavior |
| --- | --- |
| **Dual process** | Five typed questions per turn, confidence and `needs_system_2` routing, risk gate, template-only S1 replies, S2 plans/prose, per-turn trace with probabilities, cost and savings |
| **Home** | Greeting, hero composer (Auto / Research / Write + Think harder), suggestions, pinned work, live jobs, latest artifact, tools and loop explainer |
| **Chats** | Rail + sidebar, pinned groups, search, chat index, streaming replies, plan cards, tool cards, approvals, artifacts, trace inspector, Markdown export |
| **Files** | Rooted path validation, tree, Markdown/raw preview, create, upload, download, delete confirmation, byte accounting |
| **Vault** | Encrypted provider keys per account, masked metadata, replace/delete, server-side audit log, custody mode |
| **Jobs** | Queued/running/paused/approval/dead-letter states, countdowns, resume/pause/replay/cancel, attempt log with Retry-After, backoff and jitter, provider budgets |
| **Media** | Library, upload, simulated Gemini transcriptions, queue pause, player with seek and speed, clickable synced transcript, search, SRT/VTT download, summary |
| **Automations** | Cadence list, enable/pause, run-now into a fresh chat, create/delete, next-run countdown |
| **Integrations** | Real MCP servers over streamable HTTP or SSE, tool discovery, encrypted bearer tokens, enable/disable, tool runner with live output, attachable from any composer |
| **Agents** | Four harnesses, System 2 lane, effort, posture, tool belt, questions-per-turn, dual-process diagram |
| **Skills** | Reusable instructions attached with `/`, slash menu with keyboard navigation, chips on the turn, builtin and custom, enable/disable |
| **Settings** | Simulated/live switch, health probe, S1 thresholds and model, S2 lane and effort, posture, per-account providers, account and persistence status, density/motion, deploy notes |

The UI is deliberately honest about simulation: the topbar shows **simulated** or **live runtime**, and every simulated turn still goes through the same routing code as the live path.

## How a turn works

```
user message
   │
   ▼
System 1 (Jev) ── 5 typed questions ──► answers { choice, confidence, probabilities, value }
   │
   ├── confidence ≥ accept, needs_system_2 < escalate, no prose needed
   │        └── template reply / tool call / approval gate
   │
   └── low confidence, high needs_system_2, `escalate`, or composed prose required
            └── System 2: plan → prose → artifact → approval gate
   │
   ▼
trace: decision, probabilities, latency, cost, saved vs always-S2
```

Full contract and thresholds: [`docs/dual-process.md`](docs/dual-process.md).

## API and accounts

The Worker serves the SPA plus a same-origin JSON API. Session cookies are HttpOnly, SameSite=Lax, and hashed session IDs live in D1.

| Route | Purpose |
| --- | --- |
| `POST /api/auth/register` · `login` · `logout` | email + password accounts |
| `GET /api/auth/me` | the signed-in user |
| `GET` · `PUT /api/workspace` | the account's workspace snapshot |
| `GET` · `PUT /api/keys`, `DELETE /api/keys/:name` | encrypted BYOK keys + audit |
| `GET` · `POST /api/mcp`, `PATCH` · `DELETE /api/mcp/:id` | MCP servers |
| `POST /api/mcp/:id/refresh` · `call` | tool discovery and invocation |
| `GET /api/health` | which lanes and providers are ready |
| `POST /api/jev` · `/api/system2` | System 1 and System 2 proxies |

Add keys in **Vault**; each account stores its own. Keys are sealed with AES-GCM before they are written to D1 and are decrypted only for the upstream call that needs them. `SOSYSTEM_SECRET` is optional: when it is set the Worker derives the sealing key from it, otherwise it generates one and keeps it in the `meta` table. Either way the browser never receives a stored key and there is no reveal endpoint.

Worker-level secrets still work as a fallback for a deployment owner who wants one shared key (`TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`). A key saved in the Vault takes precedence. If a route is missing a key, the turn falls back to simulation with a visible notice instead of failing the chat.

## Deploy

```bash
npm run build
npx wrangler deploy
```

Target: `https://sosystem.amos-donn.workers.dev`. The Worker serves `dist/` with SPA fallback and handles `/api/*` first. D1 database `sosystem` is bound as `DB` in `wrangler.jsonc`; the Worker creates its tables on the first API request, so no remote migration step is required.

Workers Builds runs `npm run build` and `npx wrangler deploy` on every push to `master`.

## Known limits

- **Real sandbox / shell / browser.** Tool cards are deterministic; the agent does not execute shell commands.
- **Durable queues and schedules.** Automation cadence is stored, but nothing runs on a timer yet; Run now opens a chat.
- **Provider billing.** Costs are modeled from tokens, not invoiced.
- **Concurrent edits.** The workspace is a snapshot: two tabs signed in at once resolve last-write-wins.

## Structure

```
worker/index.ts          router: auth, workspace, keys, MCP, model lanes, assets
worker/db.ts             D1 schema + helpers (tables created on first request)
worker/auth.ts           PBKDF2 accounts, hashed sessions, cookies
worker/crypto.ts         AES-GCM sealing for keys and MCP tokens
worker/providers.ts      key inventory, System 1 and System 2 calls
worker/mcp.ts            MCP initialize/list/call over HTTP and SSE
src/App.tsx              boot, auth gate, shell, routing, shortcuts, palette
src/store.tsx            session, hydration, debounced D1 saves, keys, MCP, skills
src/lib/api.ts           typed client for the Worker API
src/types.ts             typed domain model
src/data/defaults.ts     starter files, builtin skills, agents, settings
src/data/providers.ts    provider catalog and model routing
src/engine/jev.ts        typed questions, answers, routing, traces
src/engine/system2.ts    plans, prose, deterministic simulation
src/engine/runtime.ts    turn orchestration + live/simulated fallback
src/components/          rail, sidebar, profile, composer, trace, palette, UI
src/pages/               Home, Chats, Chat, Files, Vault, Jobs, Media,
                         Automations, Integrations, Agents, Skills, Settings
src/styles.css           tokens, shell, all page layouts
docs/dual-process.md     the loop contract in detail
```

## Docs

- [`FEATURES.md`](FEATURES.md) — shipped surface, status, deliberate gaps.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — implemented topology and the durable target.
- [`docs/dual-process.md`](docs/dual-process.md) — Jev questions, routing, traces, costs.

## Verified

- `npx tsc --noEmit` passes.
- `npm run build` passes (2074 modules; ~405 kB JS, ~68 kB CSS before gzip).
- Dev server responds `200` on localhost and on the preview host; Worker routes typecheck.
