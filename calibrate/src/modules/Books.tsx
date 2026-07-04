import { BookOpen, Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Empty, HudLabel, Panel, StatTile } from '../components/ui'
import { todayISO } from '../lib/dates'
import { streaks } from '../lib/stats'
import { useStore } from '../store/store'
import type { BookStatus } from '../store/types'

const STATUS_LABEL: Record<BookStatus, string> = { reading: 'Reading', queued: 'Queue', finished: 'Finished' }

export function Books() {
  const s = useStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const st = streaks(s)
  const todayMin = s.readingLog[todayISO()] ?? 0
  const groups: BookStatus[] = ['reading', 'queued', 'finished']

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ice">READING PROTOCOL</h1>
          <p className="mt-1 text-sm text-haze">15 minutes of physical reading every morning ignition. Track the library here.</p>
        </div>
        <div className="flex gap-2.5">
          <StatTile label="Today" value={`${todayMin}m`} sub="of 15m target" accent={todayMin >= 15 ? 'text-affirm' : 'text-ice'} />
          <StatTile label="Streak" value={st.reading} sub="days ≥ 15m" accent="text-signal" />
        </div>
      </header>

      <Panel>
        <HudLabel>Log Reading</HudLabel>
        <div className="flex flex-wrap gap-2">
          {[15, 30, 45].map((m) => (
            <button key={m} className="btn" onClick={() => s.logReading(todayISO(), m)}>
              +{m} min
            </button>
          ))}
          {todayMin > 0 && (
            <button className="btn btn-ghost !text-xs" onClick={() => s.logReading(todayISO(), -todayMin)}>
              reset today
            </button>
          )}
        </div>
      </Panel>

      <Panel>
        <HudLabel>Add Book</HudLabel>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            s.addBook({ title: title.trim(), author: author.trim() })
            setTitle('')
            setAuthor('')
          }}
        >
          <input className="field flex-1" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="field flex-1" placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <button className="btn btn-signal" type="submit">
            <Plus size={15} /> Add
          </button>
        </form>
      </Panel>

      {groups.map((g) => {
        const books = s.books.filter((b) => b.status === g)
        if (!books.length && g !== 'reading') return null
        return (
          <div key={g}>
            <HudLabel className="px-1">{STATUS_LABEL[g]}</HudLabel>
            {!books.length ? (
              <Empty>No book in progress. Add one above — morning ignition needs fuel.</Empty>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {books.map((b) => {
                  const pct = b.totalPages ? Math.min(100, Math.round((b.currentPage / b.totalPages) * 100)) : 0
                  return (
                    <Panel key={b.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <BookOpen size={16} className="mt-0.5 shrink-0 text-steel" />
                          <div>
                            <div className="font-display text-base font-bold leading-tight tracking-wide text-ice">{b.title}</div>
                            {b.author && <div className="text-xs text-fog">{b.author}</div>}
                          </div>
                        </div>
                        <button aria-label={`Delete ${b.title}`} onClick={() => s.removeBook(b.id)}>
                          <Trash2 size={14} className="text-alert/60 hover:text-alert" />
                        </button>
                      </div>

                      {g !== 'finished' && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-fog">Progress</span>
                            <span className="num text-ice">
                              <input
                                className="w-12 rounded bg-black/40 px-1 text-center outline-none focus:ring-1 focus:ring-signal/50"
                                inputMode="numeric"
                                aria-label="Current page"
                                value={b.currentPage || ''}
                                placeholder="0"
                                onChange={(e) => s.updateBook(b.id, { currentPage: parseInt(e.target.value) || 0 })}
                              />
                              {' / '}
                              <input
                                className="w-12 rounded bg-black/40 px-1 text-center outline-none focus:ring-1 focus:ring-signal/50"
                                inputMode="numeric"
                                aria-label="Total pages"
                                value={b.totalPages || ''}
                                placeholder="pages"
                                onChange={(e) => s.updateBook(b.id, { totalPages: parseInt(e.target.value) || 0 })}
                              />
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                            <div className="h-full rounded-full bg-steel transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}

                      {g === 'finished' && (
                        <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <button key={v} onClick={() => s.updateBook(b.id, { rating: v === b.rating ? null : v })} aria-label={`Rate ${v}`}>
                              <Star size={14} className={v <= (b.rating ?? 0) ? 'fill-signal text-signal' : 'text-fog/40'} />
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex gap-1.5">
                        {groups
                          .filter((x) => x !== g)
                          .map((x) => (
                            <button key={x} className="btn !py-1 !text-[11px]" onClick={() => s.updateBook(b.id, { status: x })}>
                              → {STATUS_LABEL[x]}
                            </button>
                          ))}
                      </div>
                    </Panel>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
