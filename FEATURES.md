# sosystem — feature set (pass 2)

Legend: **●** shipped and interactive · **◐** shipped, simulated by design · **○** next pass (needs accounts/storage or infrastructure).

This pass is complete except for accounts and storage. Everything below is clickable in the app; no key is required.

---

## 1. Dual-process engine

| Feature | Status | Detail |
| --- | --- | --- |
| Jev as System 1 | ● | Typed question/answer interface. No prose generation. Model id `jev-1.14.0` in `src/engine/jev.ts`. |
| Five typed questions | ● | `next` (7-way choice), `target_file` (choice), `needs_system_2`, `action_is_risky`, `on_track` (numeric). |
| Confidence routing | ● | Accept at `0.62`, escalate at `0.55`, risk gate `0.50`; editable in Settings. |
| Risk gate | ● | A typed risky write above threshold routes to a human approval, never auto-applies. |
| Template-only S1 | ● | Greetings/status/help can be answered without System 2. Anything composed escalates even if routing accepted a tool. |
| System 2 planning | ● | Plan steps with done/active/pending/blocked state, visible in the chat and side panel. |
| System 2 prose/artifacts | ● | Drafts, reports, transcript summaries and queue analyses. |
| Per-turn trace | ● | Route, model, latency, tokens, questions, decision, probabilities, confidence bar with threshold marker, escalation reason, S2 cost, savings vs always-S2. |
| Live or simulated | ● | Default simulation; live worker proxies with per-turn fallback and a notice. |
| Forced deliberation | ● | “Think harder” and Research/Write modes force System 2 for that turn. |
| Chat-level telemetry | ● | Decisions, escalations, fast-path %, tool count, saved/spent. |

## 2. Superapp shell

| Feature | Status | Detail |
| --- | --- | --- |
| Icon rail | ● | Home, chats, files, vault, jobs, media, automations, integrations, settings. |
| Sidebar | ● | Workspace switcher, new chat, search, pinned chats, grouped recent chats, tool counts, spend summary. |
| Profile popup | ● | Identity, monthly spend meter, settings, shortcuts, density, reduced motion, sign-out placeholder. |
| Command palette | ● | `⌘K` across pages, chats, files and jobs; keyboard navigation. |
| Shortcut sheet | ● | `⌘K`, `⌘N`, `Esc`, send/newline. |
| Topbar | ● | Breadcrumb, approval alert, palette trigger, honest runtime badge. |
| Home | ● | Greeting, hero composer, follow-up suggestions, pinned chats, running job, latest artifact, workspace counts, loop explainer, tool grid. |
| Responsive layout | ● | Rail/sidebar collapse, chat inspector hides, single-column tool pages on narrow screens. |
| Density + motion | ● | Compact and reduced-motion preferences apply live. |

## 3. Chats

| Feature | Status | Detail |
| --- | --- | --- |
| Chat index | ● | Filter All/Pinned/Needs you, text search, status, item counts, tags. |
| Pinned chats | ● | Pin/unpin from sidebar, chat header or table; pinned groups on Home. |
| Streaming replies | ● | Word-paced streaming with a caret; trace, tools and plans appear in order. |
| Approval gates | ● | Inline card with risk, scope, approve once / always allow / deny. Approving writes a real in-memory file. |
| Tool cards | ● | Collapsible input/output, running/ok state, duration, optional diff renderer. |
| Artifact cards | ● | Jump to Files or Media; content retained on the message. |
| Chat inspector | ● | Trace, plan and artifacts tabs; S1/S2 configuration summary. |
| Export | ● | Download the thread as Markdown. |
| Delete/pin | ● | Session-local actions with confirmation where destructive. |
| Seeded demos | ● | Release notes, dead-letter diagnosis, transcription, competitor scan, digest. |

## 4. Files

| Feature | Status | Detail |
| --- | --- | --- |
| Workspace tree | ● | Grouped roots (`memory`, `reports`, `drafts`, `plans`, `data`, `runs`, `transcripts`, `uploads`, `docs`, `jobs`). |
| Path validation | ● | Root allowlist, no traversal, no empty filename; enforced before write. |
| Markdown preview | ● | Headings, lists, paragraphs; raw toggle for every file. |
| Create/write | ● | Real writes into session state, with origin (agent/user) and byte count. |
| Upload | ● | Text read into `uploads/`, clipped at 400 KB with a notice. |
| Download/copy | ● | Blob download and clipboard path copy. |
| Delete | ● | Inline confirmation, selection repair. |
| Search | ● | Path and content search. |
| Usage | ● | File count, total bytes, 5 MB demo budget. |
| Agent integration | ● | Agent writes and approved drafts appear immediately. |

## 5. Vault

| Feature | Status | Detail |
| --- | --- | --- |
| Secret list | ● | Key, mask, scopes, last update/use. |
| Masked secrets | ● | Reveal/hide with an audit entry; copy logs too. |
| Restricted secrets | ● | Never revealable or copyable; replace/delete only. |
| Add secret | ● | Key normalisation, value, agent scopes, masked vs restricted. |
| Delete | ● | Inline confirmation, crypto-shred language, audit entry. |
| Audit log | ● | Created, injected, revealed, replaced, denied — actor, time, outcome. |
| Custody card | ● | AES-256-GCM, per-workspace KEK, crypto-shred on revoke. |

## 6. Jobs and quota

| Feature | Status | Detail |
| --- | --- | --- |
| Job states | ● | queued, running, `paused_rate`, `paused_quota`, `awaiting_approval`, succeeded, failed, dead letter. |
| Countdown | ● | Live resume countdown in list and detail. |
| Rate-limit semantics | ● | Retry-After honoured, truncated exponential backoff, full jitter, cap. |
| Attempt log | ● | Status, provider code, retry-after, backoff, jitter, duration, timestamp. |
| Controls | ● | Resume now, pause, approve and run, replay, cancel. |
| Quota cards | ● | Gemini RPM/TPM/concurrency, GitHub RPM, percent bars, reset text. |
| Idempotency | ● | Preserved key and checkpoint language on replay. |
| Demo queue | ● | “Queue a demo job” creates a paused quota job. |

## 7. Media

| Feature | Status | Detail |
| --- | --- | --- |
| Library | ● | Video/audio, duration, size, status, expiry. |
| Upload | ● | Object URL playback, duration probed on metadata. |
| Transcribe flow | ● | Progress states, chunk probe, Gemini queue pause, automatic resume, transcript + summary. |
| Player | ● | Play/pause, ±5 s, seek, speed (0.75–2×), timecode, native video for uploads, animated poster for seeded media. |
| Synced transcript | ● | Active cue follows playback; click a cue to seek; speakers and timestamps. |
| Search | ● | Filter cues without losing timestamps. |
| Export | ● | SRT download with millisecond timestamps. |
| Job linkage | ● | Transcription creates a visible job with the same pause/resume story. |

## 8. Automations

| Feature | Status | Detail |
| --- | --- | --- |
| List | ● | Name, cadence, prompt, next run, run count, last run, enabled state. |
| Enable/pause | ● | Immediate, with reset next-run time. |
| Run now | ● | Opens a fresh chat with the automation prompt and updates counters. |
| Create | ● | Name, prompt, 15m/1h/1d/1w cadence. |
| Delete | ● | Inline confirmation. |
| Honest limit | ● | No cron while storage is out of scope; the UI says so. |

## 9. Integrations

| Feature | Status | Detail |
| --- | --- | --- |
| MCP catalog | ● | GitHub, Linear, Slack, Postgres, Notion, Browserbase with categories. |
| Statuses | ● | connected, needs auth, degraded, available. |
| Connect flow | ● | Connecting state → connected; disconnect; authorize. |
| Detail | ● | Scopes, transport, tool namespace, auth mode, agent exposure. |
| Per-agent exposure | ● | Toggle server availability; tool policy still applies. |
| Custom server | ● | Name, endpoint, streamable-http/SSE/stdio; added to the catalog. |

## 10. Agents

| Feature | Status | Detail |
| --- | --- | --- |
| Four harnesses | ● | Forge, Scout, Courier, Sentinel with distinct roles and tool belts. |
| System 2 lane | ● | Per-agent model select. |
| Effort | ● | Low/medium/high. |
| Posture | ● | Auto, gate risky, ask first. |
| Tool belt | ● | Ten tools, check/uncheck live. |
| Questions per turn | ● | 3–8 range. |
| Stats | ● | Runs, success, cost-per-run, recent work. |
| Shared S1 card | ● | Explains the shared typed layer and escalation gate. |

## 11. Settings and operations

| Feature | Status | Detail |
| --- | --- | --- |
| Runtime switch | ● | Simulated/live with health probe and honest fallback warning. |
| S1 tuning | ● | Jev model, accept/escalate/risk thresholds, reset. |
| S2 tuning | ● | Lane, effort, baseline costs, monthly budget. |
| Approval posture | ● | Auto / gate risky / ask first with explanations. |
| Providers | ● | Six BYOK providers, masks, model counts, missing/connected. |
| Key handling | ● | Explains Worker secrets; no credential is stored by the UI. |
| Interface | ● | Compact, reduced motion, disabled light-theme preview. |
| Workspace status | ● | Auth, persistence, D1, deploy target. |
| Deploy | ● | Worker URL, secret commands, copyable deploy command. |

---

## 12. Security and trust posture

- Keys are never sent to the browser by the Worker in this pass; only booleans leave `/api/health`.
- Provider keys in the UI are session-only masks, never persisted.
- The Vault separates “masked” (logged reveal) from “restricted” (no reveal, no copy).
- Writes stop at approval regardless of System 1 confidence; the typed risk answer can only add a gate.
- Every reveal, copy, injection and denial writes an audit event.
- The app states that `/api/*` is unauthenticated until accounts land; do not deploy it as a public multi-user service yet.

## 13. Explicit gaps for the next pass

1. Auth and workspace scoping.
2. D1 schema for chats/messages/traces/files/secrets/jobs/automations; D1-backed queue/cron.
3. Encrypted BYOK storage with envelope encryption and rotation.
4. Durable Object per thread + SSE resume via `Last-Event-ID`.
5. Real tool execution (sandbox, shell, GitHub App, MCP client).
6. Real Gemini transcription, signed object storage and cleanup/expiry.
7. Real scheduling (Workflow/cron) and notifications on approvals.
8. Billing/ledger reconciliation for provider usage.
