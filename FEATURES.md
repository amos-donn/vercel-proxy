# Mezze — feature set

Legend: **●** shipped and interactive · **◐** shipped, simulated by design · **○** next pass (needs infrastructure).

Everything below is implemented. Accounts, D1 persistence, encrypted keys, MCP and skills are live. A provider key is only needed for the live runtime.

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
| Icon rail | ● | Home, chats, files, canvas, vault, jobs, media, automations, integrations, skills, settings. |
| Sidebar | ● | New chat, search, pinned chats, grouped recent chats, tool counts, workspace spend and fast-path share. |
| Profile popup | ● | Real identity, workspace spend and fast-path meter, settings, keys, shortcuts, density, reduced motion, sign out. |
| Command palette | ● | `⌘K` across pages, chats, skills, files and jobs; file entries open the file. |
| Shortcut sheet | ● | `⌘K`, `⌘N`, `⌘\`, `⌘/`, `/`, `Esc`, send/newline. |
| Topbar | ● | Breadcrumb, save indicator, approval alert, palette trigger, honest runtime badge. |
| Home | ● | Greeting, hero composer, follow-up suggestions, pinned chats, running job, latest artifact, workspace counts, loop explainer, tool grid. |
| Responsive layout | ● | Rail/sidebar collapse, chat inspector hides, single-column tool pages on narrow screens. |
| Density + motion | ● | Compact and reduced-motion preferences apply live. |

## 3. Chats

| Feature | Status | Detail |
| --- | --- | --- |
| Chat index | ● | Filter All/Pinned/Needs you, text search, status, item counts, tags. |
| Pinned chats | ● | Pin/unpin from sidebar, chat header or table; pinned groups on Home. |
| Streaming replies | ● | Word-paced streaming with a caret; trace, tools and plans appear in order. |
| Scheduled send | ● | Dropdown beside send: in 15 minutes, 1 hour, tomorrow 9:00, or a custom time. Queued per chat, shown as chips, sent while Mezze is open. |
| Approval gates | ● | Inline card with risk, scope, approve once / deny. Approving writes a real workspace file. |
| Skill chips | ● | Skills attached with `/` show on the user turn and in the chat header. |
| MCP calls | ● | Attached tool calls run before the turn, render their real output, and reach System 2 as evidence. |
| Tool cards | ● | Collapsible input/output, running/ok state, duration, optional diff renderer. |
| Artifact cards | ● | Jump to Files, Media or Canvas; content retained on the message. |
| Chat inspector | ● | Trace, plan and artifacts tabs; S1/S2 configuration summary. |
| Export | ● | Download the thread as Markdown. |
| Delete/pin | ● | Persisted to the workspace snapshot, with confirmation where destructive. |
| Starter workspace | ● | New accounts get memory, welcome files, four builtin skills and a live welcome canvas; chats start empty. |

## 4. Files

| Feature | Status | Detail |
| --- | --- | --- |
| Workspace tree | ● | Grouped roots (`memory`, `reports`, `drafts`, `plans`, `data`, `runs`, `transcripts`, `uploads`, `docs`, `jobs`). |
| Path validation | ● | Root allowlist, no traversal, no empty filename; enforced before write. |
| Markdown preview | ● | Headings, lists, paragraphs; raw toggle for every file. |
| Create/write | ● | Real writes into the workspace snapshot, with origin (agent/user) and byte count. |
| Upload | ● | Text read into `uploads/`, clipped at 400 KB with a notice. |
| Download/copy | ● | Blob download and clipboard path copy. |
| Delete | ● | Inline confirmation, selection repair. |
| Search | ● | Path and content search. |
| Usage | ● | File count, total bytes, 5 MB demo budget. |
| Agent integration | ● | Agent writes and approved drafts appear immediately. |

## 5. Vault

| Feature | Status | Detail |
| --- | --- | --- |
| Key list | ● | Provider key name, provider, masked tail, source, last update and last use. |
| Per-account storage | ● | Each account stores its own keys; Worker-level secrets are listed separately as fallbacks. |
| Add / replace | ● | Provider preset or a custom upper-snake-case name; overwrites the ciphertext in place. |
| Delete | ● | Inline confirmation; removes the row and writes an audit event. |
| Write-only values | ● | No reveal or copy endpoint: the browser only ever receives a mask. |
| Audit log | ● | Created, replaced, deleted — written server-side with a timestamp. |
| Custody | ● | AES-GCM with a key derived from `SOSYSTEM_SECRET` or a generated deployment key in D1. |

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
| Honest limit | ● | Cadence and prompts persist, but no scheduler runs them yet; Run now opens a real chat. |

## 9. Canvas

| Feature | Status | Detail |
| --- | --- | --- |
| Library | ● | Saved canvases with name, origin (agent/you), updated date, and a live dirty dot. |
| Sandboxed preview | ● | Runs in an iframe with `allow-scripts allow-forms allow-modals allow-popups` and an opaque origin: no cookies, storage or workspace access. |
| Code editor | ● | HTML, CSS and JS tabs with a real `Run` that commits the draft and reloads the preview. |
| Agent generation | ● | Canvas mode, or a canvas-shaped prompt, produces a complete interactive page. Live providers return canvas JSON; simulation generates a real landing page, dashboard or task board. |
| Import | ● | Upload HTML, CSS, JS, SVG, JSON, text or Markdown; files are combined into one canvas. |
| Export | ● | Download the current canvas as a single HTML file. |
| Persistence | ● | Canvases live in the workspace snapshot and save to D1 with everything else. |

## 10. Skills

| Feature | Status | Detail |
| --- | --- | --- |
| Skill library | ● | Name, slug, description, instruction, enabled state, builtin/custom. |
| Slash menu | ● | Type `/` in any composer; filter by slug or name, arrow keys, Enter or Tab to attach. |
| Chips | ● | Attached skills become removable chips in the composer, on the user turn and in the chat header. |
| Prompt wiring | ● | Enabled skills are added to the System 2 system prompt by name and instruction. |
| Create / edit / delete | ● | Shared modal with validation and a unique derived slug. |
| Persistence | ● | Skills live in the workspace snapshot and save with everything else. |

## 11. Integrations

| Feature | Status | Detail |
| --- | --- | --- |
| MCP servers | ● | Real list from D1: name, endpoint, transport, status, tool count, agent exposure. |
| Add server | ● | HTTPS endpoint, streamable HTTP or SSE, optional bearer token. |
| Discovery | ● | Real `initialize` + `tools/list` handshake with pagination, stored tool schemas. |
| Tool runner | ● | Schema-driven argument form, live `tools/call`, output shown in the modal. |
| Composer attach | ● | Pick a server and tool, fill its schema, attach the call to a chat turn. |
| Tokens | ● | Bearer tokens encrypted with the same AES-GCM key store as provider keys. |
| Enable / disable | ● | Disabled servers stay configured but drop out of the composer picker. |
| Refresh / remove | ● | Re-run discovery, or delete the server and its tools. |
| Transport scope | ● | HTTPS only; private and loopback endpoints require `ALLOW_PRIVATE_MCP=1` for local development. |

## 12. Agents

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

## 13. Settings and operations

| Feature | Status | Detail |
| --- | --- | --- |
| Runtime switch | ● | Simulated/live with health probe and honest fallback warning. |
| S1 tuning | ● | Jev model, accept/escalate/risk thresholds, reset. |
| S2 tuning | ● | Lane, effort, real workspace spend, savings, decision count and prompt tokens. |
| Approval posture | ● | Auto / gate risky / ask first with explanations. |
| Providers | ● | Five provider lanes with live key masks, model counts and source (yours or Worker secret). |
| Key handling | ● | Manage keys in Vault; values are encrypted before storage and never returned. |
| Interface | ● | Compact density and reduced motion. |
| Account | ● | Name, email, member since, session lifetime, sign out. |
| Workspace status | ● | D1 snapshot, last save state, chat and file counts. |
| Deploy | ● | Worker URL, D1 binding and the push-to-deploy command. |

---

## 14. Security and trust posture

- Every API route except health and auth requires a session; ownership is taken from the session, never from the request body.
- Session IDs are hashed at rest, cookies are HttpOnly and SameSite=Lax, passwords use PBKDF2-SHA256 with a per-user salt at the Workers maximum of 100,000 iterations.
- Writes require a matching `Origin`; cross-origin mutations return 403.
- Provider keys and MCP tokens are sealed with AES-GCM before they reach D1 and are decrypted only inside the Worker for one upstream call.
- Key values are write-only: there is no reveal or copy endpoint, and the inventory returns masks only.
- Writes stop at approval regardless of System 1 confidence; the typed risk answer can only add a gate.
- MCP endpoints must use HTTPS and private hosts are rejected unless explicitly enabled for local development.

## 15. Explicit gaps for the next pass

1. Durable Object per thread + SSE resume via `Last-Event-ID`.
2. D1-backed queue/cron for jobs and automations.
3. Real sandbox: shell, files, GitHub App, Gemini transcription with signed object storage.
4. Notifications on approvals and long-running jobs.
5. Billing/ledger reconciliation for provider usage.
