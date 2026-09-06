import { useState } from 'react'
import { Bar, DangerBtn, Dot, Empty, Eyebrow, InlineArea, InlineText, Page, Reorder, Section, Tools } from '../components/ui'
import { useStore } from '../store/store'

export function Goals({ label }: { label: string }) {
  const s = useStore()
  const [newTitle, setNewTitle] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})

  return (
    <Page
      title={label}
      lede="The pillars, and everything you add to them. Every line is editable; Jarvis can rewrite them too."
      actions={
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newTitle.trim()) return
            s.addGoal({ title: newTitle.trim() })
            setNewTitle('')
          }}
        >
          <input className="field w-48" placeholder="New goal…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} aria-label="New goal" />
          <button className="btn btn-solid" type="submit">
            Add
          </button>
        </form>
      }
    >
      {!s.goals.length && (
        <Section>
          <Empty>No goals yet. What are you actually building this year?</Empty>
        </Section>
      )}

      <div className="grid gap-x-14 gap-y-2 xl:grid-cols-2">
        {s.goals.map((g, gi) => {
          const msDone = g.milestones.filter((m) => m.done).length
          const derived = g.milestones.length ? Math.round((msDone / g.milestones.length) * 100) : g.progress
          return (
            <Section key={g.id} className="group">
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
                  <Reorder onUp={() => s.moveGoal(g.id, -1)} onDown={() => s.moveGoal(g.id, 1)} first={gi === 0} last={gi === s.goals.length - 1} />
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
                  const t = (draft[g.id] ?? '').trim()
                  if (!t) return
                  s.addMilestone(g.id, t)
                  setDraft({ ...draft, [g.id]: '' })
                }}
              >
                <input
                  className="field min-w-0 flex-1"
                  placeholder="Add a milestone…"
                  value={draft[g.id] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [g.id]: e.target.value })}
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
        })}
      </div>
    </Page>
  )
}
