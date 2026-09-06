import { useEffect, useMemo, useRef, useState } from 'react'
import { todayISO } from '../lib/dates'
import { useStore } from '../store/store'
import { Icon, type GlyphName } from './icons'

export interface Command {
  id: string
  label: string
  hint?: string
  glyph: GlyphName
  run: () => void
}

/** Subsequence match — "trn" finds "Training". Cheap, forgiving, no library. */
function fuzzy(needle: string, hay: string): boolean {
  if (!needle) return true
  const n = needle.toLowerCase()
  const h = hay.toLowerCase()
  let i = 0
  for (const ch of h) if (ch === n[i]) i++
  return i === n.length
}

/**
 * ⌘K — one keystroke to anywhere, plus the actions worth doing without
 * navigating at all. Anything typed that matches nothing becomes a
 * question for Jarvis, so the palette is never a dead end.
 */
export function Palette({
  open,
  onClose,
  onAsk,
}: {
  open: boolean
  onClose: () => void
  onAsk: (text: string) => void
}) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const date = todayISO()

  useEffect(() => {
    if (open) {
      setQ('')
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const go = (id: string) => () => {
      s.setView(id)
      window.scrollTo({ top: 0 })
    }
    const nav: Command[] = s.sections
      .filter((sec) => !sec.hidden)
      .sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order)
      .map((sec) => ({
        id: `go-${sec.id}`,
        label: sec.label,
        hint: s.groups.find((g) => g.id === sec.group)?.label ?? '',
        glyph: (sec.icon as GlyphName) ?? 'custom',
        run: go(sec.id),
      }))

    const todaysWorkout = s.workouts.find((w) => w.weekday === ((new Date().getDay() + 6) % 7))

    const actions: Command[] = [
      { id: 'a-water', label: 'Log 500ml water', glyph: 'water', hint: 'Fuel', run: () => s.addWater(date, 500) },
      { id: 'a-water250', label: 'Log 250ml water', glyph: 'water', hint: 'Fuel', run: () => s.addWater(date, 250) },
      { id: 'a-read', label: 'Log 15 min reading', glyph: 'books', hint: 'Reading', run: () => s.logReading(date, 15) },
      {
        id: 'a-workout',
        label: todaysWorkout ? `Mark "${todaysWorkout.name}" complete` : 'No session scheduled today',
        glyph: 'training',
        hint: 'Training',
        run: () => todaysWorkout && s.setWorkoutDone(date, todaysWorkout.id, true),
      },
      { id: 'a-note', label: 'New note', glyph: 'notes', hint: 'Notes', run: () => { s.addNote('Untitled'); s.setView('notes') } },
      { id: 'a-table', label: 'New table', glyph: 'layers', hint: 'Notes', run: () => { s.addTable('New table'); s.setView('notes') } },
      { id: 'a-grocery', label: 'Open supply list', glyph: 'grocery', hint: 'Supply', run: go('grocery') },
      {
        id: 'a-section',
        label: 'Create a new section',
        glyph: 'plus',
        hint: 'Navigation',
        run: () => {
          const id = s.addSection({ label: 'New section', module: 'custom', icon: 'custom' })
          s.setView(id)
        },
      },
      { id: 'a-customise', label: 'Customise navigation', glyph: 'sliders', hint: 'Navigation', run: () => s.setView('settings') },
      { id: 'a-reset-scroll', label: 'Jump to Today', glyph: 'today', hint: 'Navigation', run: go('today') },
    ]

    const habits: Command[] = s.habits
      .filter((h) => !h.archived && h.kind === 'boolean')
      .map((h) => ({
        id: `h-${h.id}`,
        label: `Mark "${h.label}" done`,
        glyph: 'check' as GlyphName,
        hint: 'Habit',
        run: () => s.setHabit(date, h.id, 1),
      }))

    return [...nav, ...actions, ...habits]
  }, [s, date])

  const results = useMemo(() => commands.filter((c) => fuzzy(q, `${c.label} ${c.hint ?? ''}`)).slice(0, 24), [commands, q])

  useEffect(() => setCursor(0), [q])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const commit = (cmd?: Command) => {
    if (cmd) {
      cmd.run()
    } else if (q.trim()) {
      onAsk(q.trim())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/85 px-4 pt-[12vh]" onClick={onClose}>
      <div
        className="animate-lift w-full max-w-lg border border-line-2 bg-ink"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Icon name="search" size={15} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Go to, do, or ask…"
            aria-label="Command"
            className="w-full bg-transparent text-lede text-paper outline-none placeholder:text-faint"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(results.length - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                commit(results[cursor])
              } else if (e.key === 'Escape') {
                onClose()
              }
            }}
          />
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {results.map((c, i) => (
            <button
              key={c.id}
              data-idx={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => commit(c)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === cursor ? 'bg-white/[0.06] text-paper' : 'text-mute'
              }`}
            >
              <Icon name={c.glyph} size={15} className={i === cursor ? 'text-paper' : 'text-faint'} />
              <span className="min-w-0 flex-1 truncate text-body">{c.label}</span>
              {c.hint && <span className="eyebrow shrink-0">{c.hint}</span>}
            </button>
          ))}

          {q.trim() && (
            <button
              onClick={() => commit(undefined)}
              className={`flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-left ${
                results.length === 0 ? 'bg-white/[0.06] text-paper' : 'text-mute'
              }`}
            >
              <Icon name="jarvis" size={15} className="text-faint" />
              <span className="min-w-0 flex-1 truncate text-body">
                Ask Jarvis — <span className="text-paper">{q.trim()}</span>
              </span>
              <span className="eyebrow shrink-0">Enter</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
