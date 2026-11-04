import { useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { useStore } from '../store'
import type { Skill, View } from '../types'
import { cn } from '../lib/format'
import { Chip, Empty, Field, Modal, Toggle } from '../components/ui'

export function SkillsPage({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { skills, chats, addSkill, patchSkill, deleteSkill, notify } = useStore()
  const [draft, setDraft] = useState<Skill | 'new' | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const usage = (skill: Skill) => chats.filter((chat) => chat.skillIds?.includes(skill.id)).length

  const open = (skill: Skill | 'new') => {
    setDraft(skill)
    setError(null)
    setName(skill === 'new' ? '' : skill.name)
    setDescription(skill === 'new' ? '' : skill.description)
    setPrompt(skill === 'new' ? '' : skill.prompt)
    setEnabled(skill === 'new' ? true : skill.enabled)
  }

  const save = () => {
    if (!name.trim()) {
      setError('Give the skill a name.')
      return
    }
    if (!prompt.trim()) {
      setError('Write the instruction the model should follow.')
      return
    }
    if (draft === 'new') {
      addSkill({ name, description, prompt })
      notify(`${name.trim()} added · type / to attach it`)
    } else if (draft) {
      patchSkill(draft.id, { name, description, prompt, enabled })
      notify(`${name.trim()} updated`)
    }
    setDraft(null)
  }

  return (
    <div className="page page-skills">
      <header className="page-head">
        <div>
          <h1>Skills</h1>
          <p>
            A skill is a reusable instruction, not a prompt template. Type <code>/</code> in any
            composer to attach one; it becomes a chip on the turn and travels into the System 2 prompt.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open('new')}>
          <Plus size={13} /> New skill
        </button>
      </header>

      <div className="slash-hint">
        <span className="slash-hint-key mono">/</span>
        <div>
          <strong>Slash to attach</strong>
          <span>
            Open a chat, type <code>/</code>, and pick a skill. The chip stays on the message so the
            reference is visible later.
          </span>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => onNavigate({ name: 'home' })}>
          Try it <ArrowRight size={12} />
        </button>
      </div>

      {skills.length ? (
        <div className="skill-grid">
          {skills.map((skill) => (
            <article key={skill.id} className={cn('skill-card', !skill.enabled && 'is-off')}>
              <header className="skill-card-head">
                <span className="skill-mark">/{skill.slug.slice(0, 1)}</span>
                <div className="skill-title">
                  <strong>{skill.name}</strong>
                  <span className="mono tiny faint">/{skill.slug}</span>
                </div>
                <Toggle
                  checked={skill.enabled}
                  onChange={(next) => patchSkill(skill.id, { enabled: next })}
                  label={skill.name}
                />
              </header>

              <p className="skill-desc">{skill.description || 'No description yet.'}</p>
              <p className="skill-prompt">{skill.prompt}</p>

              <footer className="skill-card-foot">
                {skill.builtin ? <Chip tone="violet">builtin</Chip> : <Chip tone="neutral">custom</Chip>}
                <span className="tiny faint">
                  {usage(skill)} chat{usage(skill) === 1 ? '' : 's'}
                </span>
                <span className="grow" />
                <button type="button" className="icon-btn" onClick={() => open(skill)} aria-label={`Edit ${skill.name}`}>
                  <Pencil size={13} />
                </button>
                {confirmId === skill.id ? (
                  <span className="confirm-inline">
                    sure?
                    <button
                      type="button"
                      className="danger-link"
                      onClick={() => {
                        deleteSkill(skill.id)
                        setConfirmId(null)
                        notify(`${skill.name} deleted`)
                      }}
                    >
                      delete
                    </button>
                    <button type="button" className="link-btn" onClick={() => setConfirmId(null)}>
                      cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => setConfirmId(skill.id)}
                    aria-label={`Delete ${skill.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<BookOpen size={18} />}
          title="No skills yet"
          action={
            <button type="button" className="btn btn-primary" onClick={() => open('new')}>
              <Plus size={13} /> Create the first skill
            </button>
          }
        >
          A skill is a few sentences that change how System 2 approaches a turn.
        </Empty>
      )}

      <div className="int-note">
        <Zap size={13} />
        <div>
          <strong>Skills are instructions, not permissions</strong>
          <p>
            Attaching a skill cannot widen the tool belt or skip an approval. It only adds guidance to
            the System 2 request, alongside the workspace files and any MCP output.
          </p>
        </div>
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft === 'new' ? 'New skill' : 'Edit skill'}
        subtitle="Short, specific instructions work better than long preambles."
        width={540}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save}>
              <Check size={12} /> {draft === 'new' ? 'Create skill' : 'Save skill'}
            </button>
          </>
        }
      >
        <Field label="Name" htmlFor="skill-name">
          <input
            id="skill-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Release notes"
            maxLength={60}
          />
        </Field>
        <Field label="Description" hint="Shown in the slash menu." htmlFor="skill-description">
          <input
            id="skill-description"
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Turn merged work into a themed release note."
            maxLength={160}
          />
        </Field>
        <Field label="Instruction" hint="This text is added to the System 2 prompt verbatim." htmlFor="skill-prompt">
          <textarea
            id="skill-prompt"
            className="textarea mono"
            rows={6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Group changes by theme, link every source, and mark anything you cannot verify."
          />
        </Field>
        {draft !== 'new' ? (
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Enabled"
            hint="Disabled skills stay in the library but drop out of the slash menu."
          />
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
        <p className="tiny faint">
          <Sparkles size={10} /> The slug is derived from the name and stays unique.
        </p>
      </Modal>
    </div>
  )
}
