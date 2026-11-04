# The dual-process loop

System 1 decides. System 2 writes.

This is not a metaphor for “fast model, slow model.” It is a contract: the fast lane cannot emit prose, and the slow lane cannot silently take an action. The UI, the trace and the approval gate all depend on that separation.

---

## 1. Why split at all

A single agent loop asks one model to do three different jobs:

1. choose the next action,
2. decide whether the action is safe,
3. write the explanation.

Those jobs have different failure costs. A wrong action is expensive; a clumsy sentence is not. Splitting lets the cheap lane own the decision and makes its uncertainty visible as numbers, while the expensive lane is spent only on language and judgement.

The economics follow: a typed decision is a few thousand prompt tokens and ~250 ms. A frontier completion is several seconds and ~$0.03–0.05. If 90% of turns can be finished from a template or a fixed tool slot, the average cost drops by an order of magnitude.

The trust property matters more than the cost: if a fast answer is wrong and nothing says it was fast, users stop trusting all of it. Every turn therefore carries a trace that names the system, the probability, and the escalation reason.

---

## 2. System 1 — Jev

Jev (TypeSafe AI) answers typed questions over a state object. It does not receive a “write a reply” instruction and it has no tools.

### Request

```ts
{
  model: 'jev-1.14.0',
  state: {
    goal, plan, history, files, file_count, running_jobs
  },
  questions: [
    { id: 'next', kind: 'choice', prompt, options: [...] },
    { id: 'target_file', kind: 'choice', prompt, options: [...] },
    { id: 'needs_system_2', kind: 'noul', statement },
    { id: 'action_is_risky', kind: 'noul', statement },
    { id: 'on_track', kind: 'noul', statement }
  ]
}
```

`choice` returns `{ choice, probabilities, confidence }`.
`noul` returns a probability-like value (`value` or `noul` in the answer payload).
`score` is supported by the contract but not used in this pass.

### Actions

```
respond | search_files | read_file | write_file | transcribe | inspect_job | escalate
```

`respond` is only legal when a template can answer: greeting, status, help. Anything that needs a composed sentence goes to System 2 even if the choice was a tool. This guard lives in `runtime.ts` (`needsProse`), not in the model, because it is a product rule.

### Validation

`parseAnswers()` filters malformed items by id. The trace records `validation: 'ok' | 'repaired' | 'failed'`. In the live path, missing answers throw and the turn falls back to simulation rather than guessing. A decision that cannot be validated must never reach the action layer.

---

## 3. Routing

Defaults in `src/data/defaults.ts`; editable in Settings and saved to the account's workspace.

```ts
thresholds = { accept: 0.62, escalate: 0.55, risky: 0.50 }
```

```
route:
  needs_system_2 >= escalate                 → S2
  confidence < accept                        → S2
  next.choice === 'escalate'                 → S2
  next.choice === 'write_file' && risky >= risky
                                             → S1 plan + human gate
  otherwise                                  → S1 (template/tool)
```

Then the prose guard:

```
if route === 's1' and decision not in { respond, search_files }:
  route = 's2'
  reason = 'System 1 selected a tool, but the reply needs composed prose'
```

The guard is deliberately blunt. A tool call that needs a sentence is a System 2 turn, even if the tool decision itself was confident. Pretending otherwise produces the worst UX: a correct action with an explanation that reads like a form.

The risk gate is one-way. A high `action_is_risky` can add a human gate; low risk never removes one. The engine cannot talk itself out of an approval.

---

## 4. System 2

System 2 receives the goal, the file list, the evidence gathered by tools, and the plan. It returns:

```ts
{ plan: PlanStep[], prose: string, artifact?: { name, type, meta, content } }
```

It is the only lane allowed to write prose. In the traced turn it is also the only lane that can produce:

- a release note,
- a queue diagnosis,
- a transcript summary,
- a plan with blocked steps,
- a draft file (still behind an approval).

The trace records its model, latency and cost separately. Savings are computed as:

```
S1 only:   baseline ($0.041) − S1 cost ($0.0003)
S2 turn:   S1 cost + S2 cost − baseline
```

Negative savings are shown honestly as “spent” in the inspector. The point is not to claim every turn is cheaper; it is to show which turns were.

---

## 5. Turn sequence in the UI

1. User message is appended.
2. `executeTurn` returns a trace.
3. Trace card renders: decision, probabilities, confidence with the threshold marker, escalation reason and S2 plan.
4. Tool cards run in order with a visible running state, then output.
5. Plan card appears if System 2 planned.
6. Approval card appears for writes; composer disables until it is resolved.
7. Artifact card links to Files or Media.
8. Assistant prose streams word by word.
9. Chat status returns to idle; the inspector totals decisions, escalations, fast-path percentage and savings.

The live path uses the same sequence; only the source of the answers and prose changes.

---

## 6. Failure behavior

| Case | Behavior |
| --- | --- |
| Jev route missing / non-JSON / no key | turn falls back to simulation, notice shown |
| Jev answers empty/invalid | throw → fallback, never act on partial data |
| System 2 error | throw → fallback turn, notice shown |
| Low confidence | escalate, do not guess |
| Risky write | approval, never auto-apply |
| Denied approval | no file written, transcript preserved |
| Tool error | tool card error state; no silent retry in this pass |
| Rate limit | `paused_rate` job with countdown and attempt log |

The fallback is intentionally visible. A prototype that silently pretends to be live is worse than one that admits it simulated the turn.

---

## 7. Cost and latency model

| Lane | Latency | Cost / turn |
| --- | --- | --- |
| Jev | 197–301 ms | $0.0003 |
| System 2 | 3.2–4.2 s | $0.028–0.041 |
| Always-System-2 baseline | ~3.5 s | $0.041 |

Prompt tokens are estimated from the goal length, file count and history. The displayed savings are a model, not a bill; the Worker's live path estimates cost from token usage and the UI continues to label it as modeled.

---

## 8. Extending the loop

**Add an action**

1. Add it to `ACTIONS` in `src/engine/jev.ts` and to the `next` options.
2. Handle it in `simulatedTurn` (tool + result shape).
3. Add a `ChatMessage` tool/approval/artifact branch if it produces something new.
4. Teach the router whether it needs prose or a gate.
5. Add a trace assertion in the UI or a unit test if the repo grows a test runner.

**Add a question**

1. Add it to `buildStepRequest`.
2. Add the simulated answer in `simulateAnswers`.
3. Read it with `probabilityOf`/`choiceOf`/`confidenceOf`.
4. Decide whether it can only add a gate or can also route.

**Change thresholds**

Edit in Settings; the changes are live and persist to D1. The defaults are in `src/data/defaults.ts` so a reset is meaningful.

**Swap the System 2 lane**

Settings → System 2 lane. The engine passes `s2Model` through to the trace and the live request; model IDs are strings, not enums, so a new lane requires no type change.

With an OpenRouter key, Settings loads the live catalog from `/api/models` and the picker searches every model the key can see. Any `vendor/model` id routes to OpenRouter; native Claude, GPT and Gemini ids keep their direct providers.

---

## 9. Testing the loop without a key

The simulation is deterministic:

- “hi” → S1 template.
- “status” → S1 template with running-job count.
- “transcribe the interview” → transcribe decision, S2 plan, paused job.
- “why did the export dead-letter?” → inspect job, S2 prose, attempt log.
- “draft release notes” → write decision, S2 plan, approval gate.
- “write a plan for X” with Think harder → forced S2.

Use the chat inspector to confirm the route, threshold marker, probabilities and savings. Approve the write and check Files for the workspace file; deny and confirm nothing changed.

For the live path, add keys in Vault (or set Worker-level provider secrets), flip Settings → Live Worker, run the health probe, then send a greeting (S1) and a drafting request (S2). If either route is missing a key, the notice explains the fallback instead of leaving an empty turn.

Skills and MCP output both enter the System 2 request: a skill contributes its instruction, and an attached MCP call runs before the turn so its result arrives as evidence. Neither can widen the tool belt or skip an approval gate.
