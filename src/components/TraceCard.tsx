import { ArrowRight, Brain, Gauge, Sparkles } from 'lucide-react'
import type { DecisionTrace } from '../types'
import { money } from '../lib/format'
import { Chip } from './ui'

export function TraceCard({ trace }: { trace: DecisionTrace }) {
  const { s1, escalation } = trace
  return (
    <div className="trace-card">
      <header className="trace-head">
        <span className="trace-badge">
          <Sparkles size={11} /> System 1
        </span>
        <span className="mono trace-model">{s1.version}</span>
        <span className="trace-decision mono">{s1.decision}</span>
        {trace.route === 's2' ? <Chip tone="violet">escalated</Chip> : <Chip tone="lime">fast path</Chip>}
        <span className="trace-metrics mono">
          {s1.latencyMs}ms · {money(s1.costUsd)} · {s1.questions}q
        </span>
      </header>

      <div className="trace-body">
        <Confidence value={s1.confidence} threshold={trace.route === 's2' ? escalation?.threshold : undefined} />

        <div className="prob-list">
          {Object.entries(s1.probabilities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([action, probability]) => (
              <div key={action} className="prob-row">
                <span className="mono">{action}</span>
                <span className="prob-bar">
                  <span style={{ width: `${Math.round(probability * 100)}%` }} />
                </span>
                <span className="mono faint">{probability.toFixed(2)}</span>
              </div>
            ))}
        </div>
      </div>

      {escalation ? (
        <div className="escalation">
          <div className="escalation-head">
            <Brain size={13} />
            <span>System 2</span>
            <span className="mono">{escalation.s2.model}</span>
            <span className="mono faint">{escalation.s2.latencyMs}ms · {money(escalation.s2.costUsd)}</span>
          </div>
          <p className="escalation-reason">
            <ArrowRight size={12} /> {escalation.reason}
          </p>
          {escalation.s2.plan.length ? (
            <ol className="escalation-plan">
              {escalation.s2.plan.map((step, index) => (
                <li key={`${step}-${index}`}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <footer className="trace-foot">
        <span>
          <Gauge size={11} /> template-only reply
        </span>
        <span className={trace.savedUsd >= 0 ? 'saved' : 'spent'}>
          {trace.savedUsd >= 0 ? 'saved' : 'spent'} {money(Math.abs(trace.savedUsd))} vs always-System 2
        </span>
      </footer>
    </div>
  )
}

function Confidence({ value, threshold }: { value: number; threshold?: number }) {
  return (
    <div className="conf">
      <div className="conf-head">
        <span>confidence</span>
        <span className="mono">{value.toFixed(2)}</span>
      </div>
      <div className="conf-track">
        <span className="conf-fill" style={{ width: `${Math.max(2, value * 100)}%` }} />
        {typeof threshold === 'number' ? (
          <span className="conf-threshold" style={{ left: `${threshold * 100}%` }} title={`threshold ${threshold}`} />
        ) : null}
      </div>
      {typeof threshold === 'number' ? (
        <span className="conf-note mono">threshold {threshold.toFixed(2)}</span>
      ) : null}
    </div>
  )
}
