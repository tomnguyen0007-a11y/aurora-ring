import { useState } from 'react'
import { Bar, Chip, DangerBtn, Dot, Empty, Eyebrow, InlineArea, InlineText, Page, Reorder, Section, Tools } from '../components/ui'
import { useStore } from '../store/store'
import type { Goal, GoalHorizon } from '../store/types'

const HORIZONS: { id: GoalHorizon; label: string; lede: string; empty: string }[] = [
  {
    id: 'long',
    label: 'Long term',
    lede: 'Year-plus. The pillars everything else answers to.',
    empty: 'No long-term goals. What are you actually building this year?',
  },
  {
    id: 'short',
    label: 'Short term',
    lede: 'This month, this quarter — the next concrete moves toward the pillars.',
    empty: 'Nothing short-term. Pick the one move that pushes a pillar this month.',
  },
]

const horizonOf = (g: Goal): GoalHorizon => g.horizon ?? 'long'

function GoalCard({ g, first, last }: { g: Goal; first: boolean; last: boolean }) {
  const s = useStore()
  const [draft, setDraft] = useState('')
  const msDone = g.milestones.filter((m) => m.done).length
  const derived = g.milestones.length ? Math.round((msDone / g.milestones.length) * 100) : g.progress
  const other = horizonOf(g) === 'long' ? 'short' : 'long'

  return (
    <Section className="group">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <InlineText value={g.title} onChange={(v) => s.updateGoal(g.id, { title: v })} ariaLabel="Goal title" className="t-page" />
          <InlineText
            value={g.target}
            onChange={(v) => s.updateGoal(g.id, { target: v })}
            ariaLabel="Goal target"
            placeholder="What does done look like?"
            className="mt-2 text-body text-mute"
          />
        </div>
        <Tools>
          <button
            type="button"
            className="px-1.5 text-micro text-faint hover:text-paper"
            onClick={() => s.updateGoal(g.id, { horizon: other })}
            title={`Move to ${other} term`}
          >
            → {other === 'long' ? 'Long' : 'Short'}
          </button>
          <Reorder onUp={() => s.moveGoal(g.id, -1)} onDown={() => s.moveGoal(g.id, 1)} first={first} last={last} />
          <DangerBtn onConfirm={() => s.removeGoal(g.id)} label={`Delete ${g.title}`} />
        </Tools>
      </div>

      <div className="mb-5 flex items-baseline justify-between">
        <span className="flex items-baseline gap-2">
          <Eyebrow>Deadline</Eyebrow>
          <input
            type="date"
            className="field-line num text-micro text-mute"
            value={g.deadline ?? ''}
            aria-label="Deadline"
            onChange={(e) => s.updateGoal(g.id, { deadline: e.target.value || null })}
          />
        </span>
        <span className="num text-body text-paper">{derived}%</span>
      </div>
      <Bar pct={derived} />

      <ul className="mt-5">
        {g.milestones.map((m) => (
          <li key={m.id} className="group/ms flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
            <Dot checked={m.done} onToggle={() => s.toggleMilestone(g.id, m.id)} label={m.title} size={16} />
            <span className="min-w-0 flex-1">
              <InlineText
                value={m.title}
                onChange={(v) => s.updateMilestone(g.id, m.id, v)}
                ariaLabel="Milestone"
                className={`text-body ${m.done ? 'text-faint line-through' : 'text-paper'}`}
              />
            </span>
            <span className="shrink-0 opacity-100 transition-opacity lg:opacity-0 lg:group-hover/ms:opacity-100">
              <DangerBtn onConfirm={() => s.removeMilestone(g.id, m.id)} label="Delete milestone" />
            </span>
          </li>
        ))}
      </ul>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const t = draft.trim()
          if (!t) return
          s.addMilestone(g.id, t)
          setDraft('')
        }}
      >
        <input
          className="field min-w-0 flex-1"
          placeholder="Add a milestone…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="New milestone"
        />
        <button className="btn" type="submit">
          Add
        </button>
      </form>

      <div className="mt-5 border-t border-line pt-4">
        <InlineArea
          value={g.notes}
          onChange={(v) => s.updateGoal(g.id, { notes: v })}
          ariaLabel="Goal notes"
          placeholder="Notes, constraints, the plan…"
          className="!text-micro"
        />
      </div>
    </Section>
  )
}

export function Goals({ label }: { label: string }) {
  const s = useStore()
  const [newTitle, setNewTitle] = useState('')
  const [newHorizon, setNewHorizon] = useState<GoalHorizon>('short')

  return (
    <Page
      title={label}
      lede="Long term sets direction, short term is what you do about it this month. Every line is editable; Jarvis can rewrite them too."
      actions={
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newTitle.trim()) return
            s.addGoal({ title: newTitle.trim(), horizon: newHorizon })
            setNewTitle('')
          }}
        >
          <span className="flex gap-1" role="radiogroup" aria-label="Horizon">
            {HORIZONS.map((h) => (
              <Chip key={h.id} active={newHorizon === h.id} onClick={() => setNewHorizon(h.id)}>
                {h.id === 'long' ? 'Long' : 'Short'}
              </Chip>
            ))}
          </span>
          <input className="field w-48" placeholder="New goal…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="New goal" />
          <button className="btn btn-solid" type="submit">
            Add
          </button>
        </form>
      }
    >
      <div className="space-y-16">
        {HORIZONS.map((h) => {
          const goals = s.goals.filter((g) => horizonOf(g) === h.id)
          return (
            <div key={h.id}>
              <div className="mb-2 flex items-baseline gap-3 border-b border-line pb-3">
                <h2 className="t-head">{h.label}</h2>
                <span className="num text-micro text-faint">{goals.length}</span>
                <p className="ml-auto hidden max-w-sm text-right text-micro text-faint sm:block">{h.lede}</p>
              </div>
              {goals.length ? (
                <div className="grid gap-x-14 gap-y-2 xl:grid-cols-2">
                  {goals.map((g, i) => (
                    <GoalCard key={g.id} g={g} first={i === 0} last={i === goals.length - 1} />
                  ))}
                </div>
              ) : (
                <Empty>{h.empty}</Empty>
              )}
            </div>
          )
        })}
      </div>
    </Page>
  )
}
