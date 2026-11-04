import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Captions,
  Clock3,
  Download,
  FileText,
  Loader2,
  Music,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react'
import { useStore } from '../store'
import type { MediaItem, TranscriptLine } from '../types'
import { clock, fileSize } from '../lib/format'
import { Chip, Empty, Meter, StatusPill } from '../components/ui'

export function MediaPage() {
  const { media, jobs, addMedia, patchMedia, addJob, patchJob, notify } = useStore()
  const [selectedId, setSelectedId] = useState(media[0]?.id ?? '')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [rate, setRate] = useState(1)
  const [query, setQuery] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const item = media.find((entry) => entry.id === selectedId) ?? media[0]
  const now = Date.now()

  useEffect(() => {
    setTime(0)
    setPlaying(false)
  }, [item?.id])

  useEffect(() => {
    if (!playing || !item || item.src) return
    const timer = window.setInterval(() => {
      setTime((current) => {
        const next = current + 0.25 * rate
        if (next >= item.durationSec) {
          setPlaying(false)
          return item.durationSec
        }
        return next
      })
    }, 250)
    return () => window.clearInterval(timer)
  }, [playing, rate, item])

  const activeLine = useMemo(() => {
    if (!item) return undefined
    return [...item.transcript].reverse().find((line) => line.startMs <= time * 1000)
  }, [item, time])

  const lines = useMemo(() => {
    if (!item) return []
    const q = query.trim().toLowerCase()
    return q ? item.transcript.filter((line) => line.text.toLowerCase().includes(q)) : item.transcript
  }, [item, query])

  if (!item) {
    return (
      <div className="page">
        <Empty icon={<Video size={18} />} title="No media yet">
          Upload a video or audio file to transcribe it into a searchable, clickable transcript.
        </Empty>
      </div>
    )
  }

  const toggle = () => {
    if (item.src && videoRef.current) {
      if (videoRef.current.paused) void videoRef.current.play()
      else videoRef.current.pause()
      return
    }
    setPlaying((value) => !value)
  }

  const seek = (seconds: number) => {
    const next = Math.max(0, Math.min(item.durationSec, seconds))
    setTime(next)
    if (videoRef.current) videoRef.current.currentTime = next
  }

  const upload = (file: File) => {
    const url = URL.createObjectURL(file)
    const id = `med_${Math.random().toString(36).slice(2, 7)}`
    addMedia({
      id,
      name: file.name,
      kind: file.type.startsWith('audio') ? 'audio' : 'video',
      durationSec: 0,
      sizeMb: Number((file.size / 1_048_576).toFixed(1)),
      status: 'ready',
      transcript: [],
      tone: 'blue',
      src: url,
      uploadedAt: 'just now',
    })
    setSelectedId(id)
    notify(`${file.name} added · ready to transcribe`)
  }

  const transcribe = () => {
    const jobId = `job_${Math.floor(Math.random() * 800 + 100)}`
    patchMedia(item.id, { status: 'transcribing' })
    addJob({
      id: jobId,
      title: `Transcribe ${item.name}`,
      provider: 'Gemini',
      kind: 'transcribe',
      state: 'paused_rate',
      attempt: 1,
      maxAttempts: 5,
      resumeAt: Date.now() + 12_000,
      reason: 'Gemini: 12 of 15 RPM used. Retry-After honoured.',
      costUsd: 0.003,
      createdAt: 'just now',
      detail: 'chunked at quiet cuts · 10s overlap · 16 kHz mono',
      attempts: [{ n: 1, at: 'just now', status: 'rate_limited', code: 'RESOURCE_EXHAUSTED', retryAfterMs: 2100, backoffMs: 2000, jitterMs: 510 }],
      mediaId: item.id,
    })
    notify('Chunks queued · job pauses on the Gemini rate limit, then resumes')
    window.setTimeout(() => {
      patchMedia(item.id, {
        status: 'transcribed',
        transcript: demoTranscript(item.durationSec),
        summary:
          'A short walkthrough of the workspace: why the harness is mostly permissions and recovery, and how typed decisions cut the cost of navigation.',
      })
      patchJob(jobId, {
        state: 'succeeded',
        progress: 100,
        resumeAt: undefined,
        reason: undefined,
        attempt: 2,
        attempts: [
          { n: 1, at: 'just now', status: 'rate_limited', code: 'RESOURCE_EXHAUSTED', retryAfterMs: 2100, backoffMs: 2000, jitterMs: 510 },
          { n: 2, at: 'just now', status: 'ok', ms: 2180 },
        ],
      })
      notify('Transcript ready · timestamps merged')
    }, 13_000)
  }

  const download = (format: 'srt' | 'vtt') => {
    if (!item.transcript.length) return
    const body =
      format === 'srt'
        ? item.transcript
            .map((line, index) => `${index + 1}\n${srtStamp(line.startMs)} --> ${srtStamp(line.endMs)}\n${line.text}`)
            .join('\n\n')
        : `WEBVTT\n\n${item.transcript
            .map((line) => `${srtStamp(line.startMs).replace(',', '.')} --> ${srtStamp(line.endMs).replace(',', '.')}\n${line.text}`)
            .join('\n\n')}`
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${item.name.replace(/\.[^.]+$/, '')}.${format}`
    link.click()
    URL.revokeObjectURL(url)
    notify(`Downloaded ${format.toUpperCase()}`)
  }

  const expiryHours = item.expiresAt ? Math.max(0, Math.round((item.expiresAt - now) / 3_600_000)) : null
  const job = jobs.find((entry) => entry.mediaId === item.id && entry.state !== 'succeeded')

  return (
    <div className="page page-media">
      <header className="page-head">
        <div>
          <h1>Media</h1>
          <p>
            Video and audio become searchable transcripts. Chunking overlaps at quiet cuts, the player
            follows the text, and long jobs wait out rate limits instead of failing.
          </p>
        </div>
        <div className="head-actions">
          <input
            ref={uploadRef}
            type="file"
            accept="video/*,audio/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) upload(file)
              event.target.value = ''
            }}
          />
          <button type="button" className="btn" onClick={() => uploadRef.current?.click()}>
            <Upload size={13} /> Upload media
          </button>
        </div>
      </header>

      <div className="media-layout">
        <aside className="panel media-library">
          <header className="panel-head">
            <h2>Library</h2>
            <span className="tiny faint">{media.length} items</span>
          </header>
          <div className="media-list">
            {media.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`media-row ${entry.id === item.id ? 'is-active' : ''}`}
                onClick={() => setSelectedId(entry.id)}
              >
                <span className={`media-thumb tone-${entry.tone}`}>
                  {entry.kind === 'video' ? <Video size={14} /> : <Music size={14} />}
                </span>
                <span className="media-row-copy">
                  <span className="media-row-name">{entry.name}</span>
                  <span className="media-row-meta">
                    {clock(entry.durationSec)} · {entry.sizeMb} MB
                  </span>
                  <span className="media-row-meta">
                    {entry.status === 'transcribed' ? (
                      <Chip tone="lime">transcript</Chip>
                    ) : entry.status === 'transcribing' ? (
                      <Chip tone="amber">transcribing</Chip>
                    ) : entry.status === 'failed' ? (
                      <Chip tone="red">failed</Chip>
                    ) : (
                      <Chip tone="neutral">no transcript</Chip>
                    )}
                    {entry.expiresAt ? <span className="tiny faint">{Math.max(0, Math.round((entry.expiresAt - now) / 3_600_000))}h</span> : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <footer className="panel-foot">
            <span className="tiny faint">Uploads stay local to this tab · object URLs only</span>
          </footer>
        </aside>

        <div className="media-main">
          <section className="panel player-panel">
            <div className="player">
              {item.src ? (
                <video
                  ref={videoRef}
                  src={item.src}
                  className="player-video"
                  onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onLoadedMetadata={(event) => patchMedia(item.id, { durationSec: event.currentTarget.duration })}
                />
              ) : (
                <div className={`player-poster tone-${item.tone}`}>
                  <div className="poster-grid" />
                  <div className="poster-center">
                    <span className="poster-icon">{item.kind === 'video' ? <Video size={26} /> : <Music size={26} />}</span>
                    <span className="poster-name">{item.name}</span>
                    <span className="poster-meta">
                      {clock(item.durationSec)} · {item.sizeMb} MB · {item.kind}
                    </span>
                    {playing ? (
                      <span className="poster-wave">
                        {[0, 1, 2, 3, 4].map((bar) => <span key={bar} style={{ animationDelay: `${bar * 90}ms` }} />)}
                      </span>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="player-controls">
                <button type="button" className="icon-btn" onClick={() => seek(time - 5)} aria-label="Back 5 seconds">
                  <SkipBack size={15} />
                </button>
                <button type="button" className="play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <button type="button" className="icon-btn" onClick={() => seek(time + 5)} aria-label="Forward 5 seconds">
                  <SkipForward size={15} />
                </button>
                <span className="mono player-time">
                  {clock(time)} <span className="faint">/ {clock(item.durationSec)}</span>
                </span>
                <input
                  className="player-range"
                  type="range"
                  min={0}
                  max={Math.max(1, item.durationSec)}
                  step={1}
                  value={Math.floor(time)}
                  onChange={(event) => seek(Number(event.target.value))}
                  aria-label="Seek"
                />
                <select className="mini-select mono" value={rate} onChange={(event) => setRate(Number(event.target.value))} aria-label="Playback speed">
                  {[0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <option key={speed} value={speed}>{speed}×</option>
                  ))}
                </select>
                {item.transcript.length ? (
                  <div className="player-downloads">
                    <button type="button" className="icon-btn" onClick={() => download('srt')} aria-label="Download SRT">
                      <Download size={14} />
                    </button>
                    <span className="mono tiny faint">SRT</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="media-head">
              <div>
                <h2>{item.name}</h2>
                <div className="media-meta">
                  <span>{item.kind}</span>
                  <span>·</span>
                  <span>{clock(item.durationSec)}</span>
                  <span>·</span>
                  <span>{item.sizeMb} MB</span>
                  <span>·</span>
                  <span>uploaded {item.uploadedAt}</span>
                  {expiryHours !== null ? (
                    <Chip tone={expiryHours < 12 ? 'amber' : 'neutral'}>expires in {expiryHours}h</Chip>
                  ) : null}
                </div>
              </div>
              {item.status === 'ready' ? (
                <button type="button" className="btn btn-primary" onClick={transcribe}>
                  <Sparkles size={13} /> Transcribe with Gemini
                </button>
              ) : item.status === 'transcribing' ? (
                <StatusPill label="transcribing · waiting on the queue" tone="amber" live />
              ) : (
                <Chip tone="lime">transcript ready</Chip>
              )}
            </div>

            {item.status === 'transcribing' ? (
              <div className="transcribe-card">
                <div className="transcribe-head">
                  <Loader2 size={13} className="spin" /> Transcription paused on a provider limit
                </div>
                <p>
                  {job?.reason ?? 'Waiting for the next request slot.'} The job keeps its chunk checkpoints,
                  so nothing is re-transcribed when it resumes.
                </p>
                <Meter value={job?.progress ?? 45} tone="amber" />
                <div className="transcribe-steps">
                  <span className="done">probe</span>
                  <span className="done">chunk</span>
                  <span className="active">transcribe</span>
                  <span>merge timestamps</span>
                  <span>chapters</span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel transcript-panel">
            <header className="panel-head">
              <div className="transcript-title">
                <Captions size={14} />
                <h2>Transcript</h2>
                {item.transcript.length ? <Chip tone="neutral">{item.transcript.length} cues</Chip> : null}
              </div>
              <label className="search-box search-box-inline">
                <Search size={12} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the transcript"
                  aria-label="Search transcript"
                />
              </label>
            </header>

            {item.summary ? (
              <div className="summary-card">
                <span className="summary-label"><Sparkles size={11} /> System 2 summary</span>
                <p>{item.summary}</p>
              </div>
            ) : null}

            <div className="transcript">
              {lines.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  className={`transcript-line ${activeLine?.id === line.id ? 'is-active' : ''}`}
                  onClick={() => {
                    seek(line.startMs / 1000)
                    setPlaying(true)
                  }}
                >
                  <span className="mono transcript-time">{clock(line.startMs / 1000)}</span>
                  <span className="transcript-text">
                    {line.speaker ? <span className="transcript-speaker">{line.speaker}</span> : null}
                    {line.text}
                  </span>
                </button>
              ))}
              {!item.transcript.length ? (
                <div className="transcript-empty">
                  <FileText size={16} />
                  <p>No transcript yet. {item.status === 'ready' ? 'Run Gemini transcription to fill this in.' : 'Chunks are still processing.'}</p>
                </div>
              ) : null}
              {item.transcript.length && !lines.length ? <p className="tiny faint">No cue matches “{query}”.</p> : null}
            </div>

            <footer className="panel-foot transcript-foot">
              <span className="tiny faint">
                <Clock3 size={11} /> click any cue to seek · {item.transcript.length ? `ends ${clock(item.transcript[item.transcript.length - 1].endMs / 1000)}` : 'timestamps appear after transcription'}
              </span>
              <span className="tiny faint">{item.transcript.length ? `${item.transcript.reduce((sum, line) => sum + line.text.split(' ').length, 0)} words` : ''}</span>
            </footer>
          </section>
        </div>
      </div>
    </div>
  )
}

function srtStamp(ms: number): string {
  const total = Math.max(0, ms)
  const h = String(Math.floor(total / 3_600_000)).padStart(2, '0')
  const m = String(Math.floor((total % 3_600_000) / 60_000)).padStart(2, '0')
  const s = String(Math.floor((total % 60_000) / 1000)).padStart(2, '0')
  const milli = String(total % 1000).padStart(3, '0')
  return `${h}:${m}:${s},${milli}`
}

function demoTranscript(duration: number): TranscriptLine[] {
  const script = [
    'The harness is mostly permissions and recovery. The model is the smallest part.',
    'We wanted the thing to be done when you come back, not another chat box.',
    'Typed decisions changed the economics more than a bigger model did.',
    'A small model can pick the next move when the options are constrained.',
    'But it cannot write the paragraph. That is still the heavy model.',
    'So: reflex for choices, deliberation for prose, and a gate where the consequence is real.',
    'If a fast answer is wrong and nothing says it was fast, you lose trust in all of it.',
    'That is why every turn shows which system acted and what it cost.',
  ]
  const step = Math.max(8, Math.floor(duration / (script.length + 1)))
  return script.map((text, index) => ({
    id: `line_${index}`,
    startMs: index * step * 1000,
    endMs: Math.min(duration, (index + 1) * step) * 1000,
    text,
    speaker: index % 2 === 0 ? 'Amos' : 'Interviewer',
  }))
}

export function mediaSize(item: MediaItem): string {
  return fileSize(item.sizeMb * 1_048_576)
}
