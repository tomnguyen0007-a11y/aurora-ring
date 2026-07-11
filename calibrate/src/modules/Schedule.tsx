import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { HudLabel, Panel, TAG_COLORS } from '../components/ui'
import { toMinutes, WEEKDAY_NAMES, weekdayOf } from '../lib/dates'
import { DAY_CODENAMES } from '../store/seed'
import { useStore } from '../store/store'
import type { BlockTag, ScheduleBlock, Weekday } from '../store/types'

const TAGS: BlockTag[] = ['morning', 'school', 'gym', 'golf', 'run', 'business', 'meal', 'study', 'recovery', 'social', 'language']

export function Schedule() {
  const s = useStore()
  const [day, setDay] = useState<Weekday>(weekdayOf())
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Omit<ScheduleBlock, 'id'>>({
    weekday: day,
    start: '16:00',
    end: '17:00',
    title: '',
    detail: '',
    tag: 'business',
  })
  const [adding, setAdding] = useState(false)

  const blocks = s.schedule.filter((b) => b.weekday === day).sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  const Editor = ({ value, onSave, onCancel }: { value: Omit<ScheduleBlock, 'id'>; onSave: (v: Omit<ScheduleBlock, 'id'>) => void; onCancel: () => void }) => {
    const [v, setV] = useState(value)
    return (
      <div className="space-y-2 rounded-xl border border-signal/30 bg-black/30 p-3">
        <div className="grid grid-cols-2 gap-2">
          <input className="field num" type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} aria-label="Start" />
          <input className="field num" type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} aria-label="End" />
        </div>
        <input className="field w-full" placeholder="Block title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <input className="field w-full" placeholder="Detail (optional)" value={v.detail ?? ''} onChange={(e) => setV({ ...v, detail: e.target.value })} />
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setV({ ...v, tag: t })}
              className={`rounded-full border px-2.5 py-1 font-display text-[11px] font-semibold tracking-wide transition-colors ${
                v.tag === t ? 'border-transparent text-black' : 'border-edge text-haze hover:text-ice'
              }`}
              style={v.tag === t ? { background: TAG_COLORS[t] } : {}}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn btn-signal flex-1" disabled={!v.title.trim()} onClick={() => onSave(v)}>
            Save
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="h-lumen text-3xl font-bold tracking-wide">WEEKLY BLUEPRINT</h1>
        <p className="mt-1 text-sm text-haze">Your operating schedule. Edit blocks, or tell Jarvis to do it.</p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1">
        {WEEKDAY_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => setDay(i as Weekday)}
            className={`shrink-0 rounded-xl border px-3.5 py-2 font-display text-sm font-semibold tracking-wide transition-all ${
              day === i ? 'border-signal/50 bg-signal/10 text-signal' : 'border-edge bg-black/20 text-haze hover:text-ice'
            }`}
          >
            {name.slice(0, 3).toUpperCase()}
          </button>
        ))}
      </div>

      <Panel>
        <HudLabel>
          {WEEKDAY_NAMES[day]} — {DAY_CODENAMES[day]}
        </HudLabel>
        <ol className="space-y-1.5">
          {blocks.map((b) =>
            editing === b.id ? (
              <li key={b.id}>
                <Editor
                  value={b}
                  onCancel={() => setEditing(null)}
                  onSave={(v) => {
                    s.updateBlock(b.id, v)
                    setEditing(null)
                  }}
                />
              </li>
            ) : (
              <li key={b.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: TAG_COLORS[b.tag] }} />
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEditing(b.id)}>
                  <span className="num w-[86px] shrink-0 text-[11px] leading-tight text-fog">
                    {b.start}
                    {b.end && <><br />{b.end}</>}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-[0.95rem] font-semibold tracking-wide text-ice">{b.title}</span>
                    {b.detail && <span className="block truncate text-xs text-fog">{b.detail}</span>}
                  </span>
                </button>
                <button
                  className="btn btn-ghost !px-2 transition-opacity focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label={`Delete ${b.title}`}
                  onClick={() => s.removeBlock(b.id)}
                >
                  <Trash2 size={15} className="text-alert/80" />
                </button>
              </li>
            ),
          )}
        </ol>

        {adding ? (
          <div className="mt-3">
            <Editor
              value={{ ...draft, weekday: day }}
              onCancel={() => setAdding(false)}
              onSave={(v) => {
                s.addBlock({ ...v, weekday: day })
                setDraft(v)
                setAdding(false)
              }}
            />
          </div>
        ) : (
          <button className="btn mt-3 w-full" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add block
          </button>
        )}
      </Panel>
    </div>
  )
}
