import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Check,
  CircleCheck,
  Clock3,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Timer,
} from 'lucide-react'
import { useStore } from '../store'
import type { Job, JobState, Tone } from '../types'
import { cn, countdown, money } from '../lib/format'
import { Chip, Empty, Meter, Segmented, StatusPill } from '../components/ui'

const meta: Record<JobState, { label: string; tone: Tone; live?: boolean }> = {
  queued: { label: 'queued', tone: 'neutral' },
  running: { label: 'running', tone: 'blue', live: true },
  paused_rate: { label: 'rate limited', tone: 'amber' },
  paused_quota: { label: 'quota wait', tone: 'amber' },
  awaiting_approval: { label: 'awaiting approval', tone: 'violet' },
  succeeded: { label: 'succeeded', tone: 'lime' },
  failed: { label: 'failed', tone: 'red' },
  dead_letter: { label: 'dead letter', tone: 'red' },
}

export function JobsPage() {
  const { jobs, quotas, patchJob, addJob, notify } = useStore()
  const [selectedId, setSelectedId] = useState(jobs[0]?.id ?? '')
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const rows = useMemo(() => {
    if (filter === 'all') return jobs
    return jobs.filter((job) => !['succeeded'].includes(job.state))
  }, [jobs, filter])

  const job = jobs.find((item) => item.id === selectedId) ?? rows[0] ?? jobs[0]
  const active = jobs.filter((item) => ['running', 'paused_rate', 'paused_quota', 'awaiting_approval', 'queued'].includes(item.state))

  const setState = (target: Job, patch: Partial<Job>, message: string) => {
    patchJob(target.id, patch)
    notify(message)
  }

  const resume = (target: Job) => {
    setState(target, { state: 'running', resumeAt: undefined, reason: undefined, progress: Math.max(12, target.progress ?? 12) }, `${target.id} resumed`)
    window.setTimeout(() => {
      patchJob(target.id, {
        state: 'succeeded',
        progress: 100,
        attempts: [
          ...target.attempts,
          { n: target.attempt + 1, at: 'just now', status: 'ok', ms: 1840 },
        ],
        attempt: target.attempt + 1,
      })
      notify(`${target.id} finished after ${countdown(0)}`)
    }, 2600)
  }

  const retry = (target: Job) => {
    setState(
      target,
      {
        state: 'running',
        attempt: target.attempt + 1,
        resumeAt: undefined,
        reason: undefined,
        progress: 6,
        attempts: [...target.attempts, { n: target.attempt + 1, at: 'just now', status: 'ok', ms: 420 }],
      },
      `Replay queued with the preserved idempotency key`,
    )
  }

  const createDemo = () => {
    const id = `job_${Math.floor(Math.random() * 800 + 100)}`
    addJob({
      id,
      title: 'Replay Q3 usage export',
      provider: 'Stripe',
      kind: 'export',
      state: 'paused_quota',
      attempt: 1,
      maxAttempts: 5,
      resumeAt: Date.now() + 45_000,
      reason: 'Daily spend cap at 82% · resuming after the window resets',
      costUsd: 0,
      createdAt: 'just now',
      detail: '12,480 rows · 6 pages · idempotency preserved',
      attempts: [{ n: 1, at: 'just now', status: 'rate_limited', code: 'quota_window', backoffMs: 30_000, jitterMs: 4_200 }],
    })
    setSelectedId(id)
    setFilter('all')
    notify('Queued a paused job with a quota window')
  }

  return (
    <div className="page page-jobs">
      <header className="page-head">
        <div>
          <h1>Jobs</h1>
          <p>
            Durable work that outlives a chat. Rate limits are a state, not an exception: the queue
            pauses, honours Retry-After, jitters the backoff and resumes itself.
          </p>
        </div>
        <button type="button" className="btn" onClick={createDemo}>
          <Timer size={13} /> Queue a demo job
        </button>
      </header>

      <div className="job-stats">
        <div><span className="mono">{active.length}</span><span>active</span></div>
        <div><span className="mono">{jobs.filter((item) => item.state === 'awaiting_approval').length}</span><span>need approval</span></div>
        <div><span className="mono">{jobs.filter((item) => item.state === 'dead_letter' || item.state === 'failed').length}</span><span>dead letter</span></div>
        <div><span className="mono">{money(jobs.reduce((sum, item) => sum + item.costUsd, 0))}</span><span>spent</span></div>
      </div>

      <div className="jobs-layout">
        <section className="panel job-list-panel">
          <header className="panel-head">
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'all', label: 'All' },
              ]}
            />
            <span className="tiny faint">{rows.length} jobs</span>
          </header>

          <div className="job-list">
            {rows.map((item) => {
              const state = meta[item.state]
              const waiting = item.resumeAt ? item.resumeAt - now : 0
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn('job-row', job?.id === item.id && 'is-active')}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="job-row-top">
                    <StatusPill label={state.label} tone={state.tone} live={state.live} />
                    <span className="mono tiny faint">{item.id}</span>
                    <span className="grow" />
                    <span className="mono tiny">{money(item.costUsd)}</span>
                  </span>
                  <span className="job-row-title">{item.title}</span>
                  <span className="job-row-meta">
                    <span>{item.provider}</span>
                    <span>·</span>
                    <span>attempt {item.attempt}/{item.maxAttempts}</span>
                    {waiting > 0 ? (
                      <>
                        <span>·</span>
                        <span className="mono amber">resumes in {countdown(waiting)}</span>
                      </>
                    ) : null}
                  </span>
                </button>
              )
            })}
            {!rows.length ? <Empty title="No jobs here">Everything finished. Queue a demo job to see the pause states.</Empty> : null}
          </div>
        </section>

        <section className="panel job-detail">
          {job ? (
            <>
              <header className="job-detail-head">
                <div>
                  <div className="job-detail-title">
                    <h2>{job.title}</h2>
                    <StatusPill label={meta[job.state].label} tone={meta[job.state].tone} live={meta[job.state].live} />
                  </div>
                  <div className="job-detail-meta">
                    <span className="mono">{job.id}</span>
                    <span className="mono">{job.provider}</span>
                    <span className="mono">{job.kind}</span>
                    <span>{job.createdAt}</span>
                  </div>
                </div>
                <div className="job-actions">
                  {job.state === 'paused_rate' || job.state === 'paused_quota' ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => resume(job)}>
                      <Play size={12} /> Resume now
                    </button>
                  ) : null}
                  {job.state === 'running' ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setState(job, { state: 'paused_rate', resumeAt: Date.now() + 60_000, reason: 'Paused by you · resumes in 60s' }, 'Paused')}
                    >
                      <Pause size={12} /> Pause
                    </button>
                  ) : null}
                  {job.state === 'awaiting_approval' ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => resume(job)}>
                      <Check size={12} /> Approve and run
                    </button>
                  ) : null}
                  {job.state === 'dead_letter' || job.state === 'failed' ? (
                    <button type="button" className="btn btn-sm" onClick={() => retry(job)}>
                      <RotateCcw size={12} /> Replay
                    </button>
                  ) : null}
                  {job.state === 'running' || job.state === 'queued' ? (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => setState(job, { state: 'failed', reason: 'Cancelled by you' }, 'Job cancelled')}
                    >
                      <Ban size={12} /> Cancel
                    </button>
                  ) : null}
                </div>
              </header>

              {job.reason ? (
                <div className={cn('job-reason', job.state === 'dead_letter' || job.state === 'failed' ? 'is-bad' : '')}>
                  <AlertTriangle size={13} />
                  <div>
                    <strong>{job.state === 'dead_letter' ? 'Dead lettered' : 'Held'}</strong>
                    <p>{job.reason}</p>
                  </div>
                  {job.resumeAt ? <span className="mono job-count">{countdown(job.resumeAt - now)}</span> : null}
                </div>
              ) : null}

              <div className="job-progress">
                <div className="job-progress-head">
                  <span>progress</span>
                  <span className="mono">{job.progress ?? Math.round((job.attempt / job.maxAttempts) * 100)}%</span>
                </div>
                <Meter value={job.progress ?? (job.attempt / job.maxAttempts) * 100} tone={job.state === 'failed' || job.state === 'dead_letter' ? 'red' : 'lime'} />
                <p className="tiny faint">{job.detail}</p>
              </div>

              <div className="attempt-section">
                <h3>Attempts</h3>
                <div className="attempt-list">
                  {job.attempts.map((attempt) => (
                    <div key={attempt.n} className="attempt-row">
                      <span className={cn('attempt-mark', attempt.status === 'ok' ? 'ok' : 'warn')}>
                        {attempt.status === 'ok' ? <CircleCheck size={12} /> : attempt.status === 'rate_limited' ? <Clock3 size={12} /> : <AlertTriangle size={12} />}
                      </span>
                      <span className="mono attempt-n">#{attempt.n}</span>
                      <span className="attempt-status mono">{attempt.status}{attempt.code ? ` · ${attempt.code}` : ''}</span>
                      <span className="attempt-timing mono">
                        {attempt.retryAfterMs ? `retry-after ${attempt.retryAfterMs}ms · ` : ''}
                        {attempt.backoffMs ? `backoff ${attempt.backoffMs}ms` : ''}
                        {typeof attempt.jitterMs === 'number' ? ` ${attempt.jitterMs >= 0 ? '+' : '−'}${Math.abs(attempt.jitterMs)}ms` : ''}
                        {attempt.ms ? `${attempt.ms}ms` : ''}
                      </span>
                      <span className="tiny faint">{attempt.at}</span>
                    </div>
                  ))}
                  {!job.attempts.length ? <p className="tiny faint">No attempts yet.</p> : null}
                </div>
              </div>

              <div className="job-detail-grid">
                <div className="job-fact">
                  <span>Retry policy</span>
                  <strong className="mono">truncated exp · cap 30s · full jitter</strong>
                </div>
                <div className="job-fact">
                  <span>Idempotency</span>
                  <strong className="mono">preserved across attempts</strong>
                </div>
                <div className="job-fact">
                  <span>Resume token</span>
                  <strong className="mono">checkpoint per chunk</strong>
                </div>
                <div className="job-fact">
                  <span>Spend</span>
                  <strong className="mono">{money(job.costUsd)}</strong>
                </div>
              </div>
            </>
          ) : (
            <Empty icon={<ShieldAlert size={18} />} title="No job selected">
              Pick a job to see its attempt log, pause reason and retry budget.
            </Empty>
          )}
        </section>
      </div>

      <section className="panel quota-panel">
        <header className="panel-head">
          <h2>Provider budgets</h2>
          <span className="tiny faint">live · estimated from the last minute</span>
        </header>
        <div className="quota-grid">
          {quotas.map((quota) => {
            const pct = Math.round((quota.used / quota.limit) * 100)
            return (
              <div key={quota.id} className="quota-card">
                <div className="quota-top">
                  <span className="mono">{quota.provider}</span>
                  <Chip tone={pct >= 85 ? 'red' : pct >= 70 ? 'amber' : 'lime'}>{quota.metric}</Chip>
                </div>
                <div className="quota-value mono">
                  {formatMetric(quota.provider, quota.metric, quota.used)}
                  <span className="faint"> / {formatMetric(quota.provider, quota.metric, quota.limit)}</span>
                </div>
                <Meter value={pct} tone={pct >= 85 ? 'red' : pct >= 70 ? 'amber' : 'lime'} />
                <div className="quota-foot">
                  <span className="tiny faint">resets {quota.resets}</span>
                  <span className="mono tiny">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="quota-note">
          <Loader2 size={12} />
          Waiting is visible: a paused job keeps its order, countdown and idempotency key. Nothing is
          retried in a tight loop.
        </div>
      </section>
    </div>
  )
}

function formatMetric(provider: string, metric: string, value: number): string {
  if (metric === 'TPM' || metric === 'spend') {
    if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`
    if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  }
  if (metric === 'spend') return `$${value}`
  return `${value}${metric === 'RPM' ? '' : ''}${provider === 'Gemini' && metric === 'RPM' ? '' : ''}`
}
