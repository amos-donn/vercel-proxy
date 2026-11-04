# sosystem

A **bring-your-own-key agent workspace** with two brains:

- **System 1 — Jev (TypeSafe AI)** answers typed questions. It picks the next action, scores risk, and decides whether a turn needs deliberation. It never writes a sentence.
- **System 2 — a heavy LLM** plans, judges and writes the prose. It only sees the turns System 1 cannot finish from a template or a fixed tool call.

Around that loop sits a superapp shell: home composer, pinned chats, search, files, a secret vault, durable-looking jobs with rate-limit waits, media transcription with a transcript-synced player, automations, MCP integrations, agent configuration and settings.

> **Pass 2 status:** the full UI and the dual-process loop are implemented. The loop runs deterministically in the browser by default; `/api/jev` and `/api/system2` are live Worker proxies when keys are configured. Accounts, persistence and a real sandbox are intentionally out of scope.

---

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # tsc --noEmit
npm run build    # typecheck + vite build → dist/
```

No key is needed to render or exercise the product. Type in the home composer, open **Billing release notes from this week**, approve the write gate, then inspect the trace panel.

## What is implemented

| Surface | Shipped behavior |
| --- | --- |
| **Dual process** | Five typed questions per turn, confidence and `needs_system_2` routing, risk gate, template-only S1 replies, S2 plans/prose, per-turn trace with probabilities, cost and savings |
| **Home** | Greeting, hero composer (Auto / Research / Write + Think harder), suggestions, pinned work, live jobs, latest artifact, tools and loop explainer |
| **Chats** | Rail + sidebar, pinned groups, search, chat index, streaming replies, plan cards, tool cards, approvals, artifacts, trace inspector, Markdown export |
| **Files** | Rooted path validation, tree, Markdown/raw preview, create, upload, download, delete confirmation, byte accounting |
| **Vault** | Masked and restricted secrets, reveal/copy with audit events, scoped to agents, add/replace/delete, custody model |
| **Jobs** | Queued/running/paused/approval/dead-letter states, countdowns, resume/pause/replay/cancel, attempt log with Retry-After, backoff and jitter, provider budgets |
| **Media** | Library, upload, simulated Gemini transcriptions, queue pause, player with seek and speed, clickable synced transcript, search, SRT/VTT download, summary |
| **Automations** | Cadence list, enable/pause, run-now into a fresh chat, create/delete, next-run countdown |
| **Integrations** | MCP catalog, connect/disconnect, scopes, tool counts, per-agent exposure, custom server form |
| **Agents** | Four harnesses, System 2 lane, effort, posture, tool belt, questions-per-turn, dual-process diagram |
| **Settings** | Simulated/live switch, health probe, S1 thresholds and model, S2 lane and effort, posture, BYOK provider list, density/motion, deploy commands |

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

## Live runtime

The Worker exposes:

| Route | Purpose |
| --- | --- |
| `GET /api/health` | booleans for configured lanes |
| `POST /api/jev` | server-side Jev proxy; body `{ model, state, questions }`, returns `{ answers }` |
| `POST /api/system2` | OpenAI-compatible chat proxy; returns `{ plan, prose, usage }` |

Configure with Worker secrets/vars:

```bash
npx wrangler secret put TYPESAFE_API_KEY
npx wrangler secret put SYSTEM2_API_KEY
# optional
npx wrangler secret put SYSTEM2_BASE_URL   # default https://api.openai.com/v1
npx wrangler secret put SYSTEM2_MODEL      # default gpt-5.2
npx wrangler secret put TYPESAFE_BASE_URL   # default https://api.typesafe.ai
```

Keys live only in the Worker. The browser never receives them. If a route is missing, returns non-JSON, or lacks a key, the turn falls back to simulation with a visible notice instead of failing the chat.

> The Jev upstream path (`/v1/answer`) and `TYPESAFE_BASE_URL` are configurable because the API surface should be verified against the current TypeSafe docs at deploy time. The app is fully usable while that is confirmed.

## Deploy

```bash
npm run build
npx wrangler deploy
```

Target: `https://sosystem.amos-donn.workers.dev`. The Worker serves `dist/` with SPA fallback and handles `/api/*` first. `wrangler.jsonc` includes a commented D1/DO block for the storage pass.

## Deliberately out of scope

- **Accounts / auth.** No login, sessions or per-user scoping.
- **Persistence.** Chats, files, secrets, jobs and settings reset on reload.
- **Real sandbox / shell / browser.** Tool cards show deterministic outputs.
- **Durable queues and schedules.** Job and automation state is in-memory; the UI is built around the states a durable runtime will expose.
- **Real provider billing.** Costs are modeled, not invoiced.

## Structure

```
worker/index.ts          assets + health + Jev/System 2 proxies
src/App.tsx              shell, routing, shortcuts, palette
src/store.tsx            in-memory workspace state and actions
src/types.ts             typed domain model
src/data/mock.ts         seeded chats, files, secrets, jobs, media, agents
src/engine/jev.ts        typed questions, answers, routing, traces
src/engine/system2.ts    plans, prose, deterministic simulation
src/engine/runtime.ts    turn orchestration + live/simulated fallback
src/components/          rail, sidebar, profile, composer, trace, palette, UI
src/pages/               Home, Chats, Chat, Files, Vault, Jobs, Media,
                         Automations, Integrations, Agents, Settings
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
