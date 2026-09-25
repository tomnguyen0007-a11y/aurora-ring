import { useState } from 'react'
import { Bar, DangerBtn, Dot, Empty, Eyebrow, InlineArea, InlineText, Page, Reorder, Tools } from '../components/ui'
import { useStore } from '../store/store'
import type { Goal, GoalHorizon } from '../store/types'

const HORIZONS: { id: GoalHorizon; label: string; lede: string; empty: string; add: string }[] = [
  {
    id: 'long',
    label: 'Long term',
    add: 'Add a long-term goal…',
    lede: 'Year-plus. The pillars everything else answers to.',
    empty: 'No long-term goals. What are you actually building this year?',
  },
  {
    id: 'short',
    label: 'Short term',
    add: 'Add a short-term goal…',
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
    <article className="group py-8 first:pt-0 last:pb-0">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <InlineArea
            value={g.title}
            onChange={(v) => s.updateGoal(g.id, { title: v })}
            ariaLabel="Goal title"
            minRows={1}
            className="!text-[1.1875rem] font-semibold !leading-snug tracking-[-0.016em] !text-paper"
          />
          <InlineArea
            value={g.target}
            onChange={(v) => s.updateGoal(g.id, { target: v })}
            ariaLabel="Goal target"
            placeholder="What does done look like?"
            minRows={1}
            className="mt-1 !leading-normal"
          />
        </div>
        <Tools>
          <button
            type="button"
            className="px-1.5 text-micro text-faint hover:text-paper"
            onClick={() => s.updateGoal(g.id, { horizon: other })}
            title={`Move to ${other} term`}
          >
            → {other === 'long' ? 'Long' : 'Short'} term
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
    </article>
  )
}

/** One horizon as a column: a heading that owns it, a quick add, then its goals stacked. */
function HorizonColumn({ h }: { h: (typeof HORIZONS)[number] }) {
  const s = useStore()
  const [draft, setDraft] = useState('')
  const goals = s.goals.filter((g) => horizonOf(g) === h.id)
  return (
    <section aria-labelledby={`h-${h.id}`} className="min-w-0">
      <header className="border-b-2 border-paper pb-3">
        <div className="flex items-baseline gap-3">
          <h2 id={`h-${h.id}`} className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-paper">
            {h.label}
          </h2>
          <span className="num rounded-full border border-line-2 px-2 py-0.5 text-micro text-mute">{goals.length}</span>
        </div>
        <p className="mt-2 text-label text-faint">{h.lede}</p>
      </header>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const t = draft.trim()
          if (!t) return
          s.addGoal({ title: t, horizon: h.id })
          setDraft('')
        }}
      >
        <input className="field min-w-0 flex-1" placeholder={h.add} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={h.add} />
        <button className="btn btn-solid" type="submit">
          Add
        </button>
      </form>

      {goals.length ? (
        <div className="mt-8 divide-y divide-line">
          {goals.map((g, i) => (
            <GoalCard key={g.id} g={g} first={i === 0} last={i === goals.length - 1} />
          ))}
        </div>
      ) : (
        <Empty>{h.empty}</Empty>
      )}
    </section>
  )
}

export function Goals({ label }: { label: string }) {
  return (
    <Page
      title={label}
      lede="Long term sets direction, short term is what you do about it this month. Every line is editable; Jarvis can rewrite them too."
    >
      {/* Side by side, so each pillar sits across from the moves that serve it. */}
      <div className="grid gap-x-12 gap-y-16 lg:grid-cols-2">
        {HORIZONS.map((h) => (
          <HorizonColumn key={h.id} h={h} />
        ))}
      </div>
    </Page>
  )
}
