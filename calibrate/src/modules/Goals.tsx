import { Crosshair, Dumbbell, Briefcase, Moon, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CheckDot, HudLabel, Panel } from '../components/ui'
import { useStore } from '../store/store'
import type { Pillar } from '../store/types'

const PILLAR_META: Record<Pillar, { label: string; color: string; icon: typeof Dumbbell }> = {
  physique: { label: 'Physique', color: '#f6b83c', icon: Dumbbell },
  golf: { label: 'Golf', color: '#5dd39e', icon: Crosshair },
  business: { label: 'Business', color: '#e0a458', icon: Briefcase },
  recovery: { label: 'Recovery', color: '#7f8fd8', icon: Moon },
  custom: { label: 'Custom', color: '#7fb4d8', icon: Sparkles },
}

export function Goals() {
  const s = useStore()
  const [newTitle, setNewTitle] = useState('')
  const [newMilestone, setNewMilestone] = useState<Record<string, string>>({})

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="h-lumen text-3xl font-bold tracking-wide">STRATEGIC PILLARS</h1>
        <p className="mt-1 text-sm text-haze">The four pillars from the Blueprint, plus anything you add. Jarvis can update these.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {s.goals.map((g) => {
          const meta = PILLAR_META[g.pillar]
          const Icon = meta.icon
          const msDone = g.milestones.filter((m) => m.done).length
          const derived = g.milestones.length ? Math.round((msDone / g.milestones.length) * 100) : g.progress
          return (
            <Panel key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${meta.color}55`, background: `${meta.color}14`, color: meta.color }}
                  >
                    <Icon size={17} />
                  </span>
                  <div>
                    <div className="font-display text-lg font-bold leading-tight tracking-wide text-ice">{g.title}</div>
                    <div className="hud-label !mb-0 mt-0.5 !text-[8px]" style={{ color: meta.color }}>
                      {meta.label}
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost !px-2" aria-label={`Delete goal ${g.title}`} onClick={() => s.removeGoal(g.id)}>
                  <Trash2 size={15} className="text-alert/70" />
                </button>
              </div>

              <p className="mt-3 text-sm text-haze">{g.target}</p>
              {g.deadline && <p className="num mt-1 text-xs text-fog">Deadline {g.deadline}</p>}

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-fog">Progress</span>
                  <span className="num text-ice">{derived}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${derived}%`, background: meta.color, boxShadow: `0 0 10px ${meta.color}66` }}
                  />
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {g.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <CheckDot checked={m.done} onToggle={() => s.toggleMilestone(g.id, m.id)} label={m.title} />
                    <span className={`text-sm ${m.done ? 'text-fog line-through' : 'text-ice'}`}>{m.title}</span>
                  </li>
                ))}
              </ul>

              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = (newMilestone[g.id] ?? '').trim()
                  if (!t) return
                  s.addMilestone(g.id, t)
                  setNewMilestone({ ...newMilestone, [g.id]: '' })
                }}
              >
                <input
                  className="field flex-1 !py-1.5 text-sm"
                  placeholder="Add milestone…"
                  value={newMilestone[g.id] ?? ''}
                  onChange={(e) => setNewMilestone({ ...newMilestone, [g.id]: e.target.value })}
                />
                <button className="btn !px-3" type="submit" aria-label="Add milestone">
                  <Plus size={15} />
                </button>
              </form>

              {g.notes && <p className="mt-3 border-t border-edge pt-3 text-xs leading-relaxed text-fog">{g.notes}</p>}
            </Panel>
          )
        })}
      </div>

      <Panel>
        <HudLabel>New Goal</HudLabel>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newTitle.trim()) return
            s.addGoal({ title: newTitle.trim() })
            setNewTitle('')
          }}
        >
          <input className="field flex-1" placeholder="e.g. Read 12 books this year" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <button className="btn btn-signal" type="submit">
            <Plus size={15} /> Add goal
          </button>
        </form>
      </Panel>
    </div>
  )
}
