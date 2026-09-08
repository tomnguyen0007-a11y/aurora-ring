import { useState } from 'react'
import { Icon } from '../components/icons'
import { Bar, Chain, DangerBtn, Empty, InlineText, NumCell, Page, Section, Tools } from '../components/ui'
import { todayISO } from '../lib/dates'
import { habitChain, habitStreak } from '../lib/habits'
import { useStore } from '../store/store'
import type { BookStatus } from '../store/types'

const STATUS: { id: BookStatus; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'queued', label: 'Queue' },
  { id: 'finished', label: 'Finished' },
]

export function Books({ label }: { label: string }) {
  const s = useStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const todayMin = s.readingLog[todayISO()] ?? 0
  const habit = s.habits.find((h) => h.id === 'h-read')

  return (
    <Page title={label} lede="Fifteen minutes of physical reading, every morning. The library keeps the score.">
      <Section label="Today">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="readout text-[2.5rem]">{todayMin}</span>
            <span className="text-body text-faint">/15 min</span>
            {habit && <div className="eyebrow mt-2">{habitStreak(s, habit)} day streak</div>}
          </div>
          <div className="flex gap-2">
            {todayMin > 0 && (
              <button className="btn" onClick={() => s.logReading(todayISO(), -15)} aria-label="Subtract 15 minutes">
                −15
              </button>
            )}
            {[15, 30, 45].map((m) => (
              <button key={m} className="btn" onClick={() => s.logReading(todayISO(), m)}>
                +{m}
              </button>
            ))}
            {todayMin > 0 && (
              <button className="btn btn-quiet" onClick={() => s.logReading(todayISO(), -todayMin)}>
                Reset
              </button>
            )}
          </div>
        </div>
        <Bar pct={Math.min(100, (todayMin / 15) * 100)} className="mt-5" />
        {habit && (
          <div className="mt-5">
            <div className="eyebrow mb-2">Last 30 days</div>
            <Chain days={habitChain(s, habit, 30)} />
          </div>
        )}
      </Section>

      <Section label="Add a book">
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
          <input className="field min-w-0 flex-1" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="field min-w-0 flex-1" placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <button className="btn btn-solid" type="submit">
            Add
          </button>
        </form>
      </Section>

      {STATUS.map(({ id, label: statusLabel }) => {
        const books = s.books.filter((b) => b.status === id)
        if (!books.length && id !== 'reading') return null
        return (
          <Section key={id} label={`${statusLabel} · ${books.length}`}>
            {!books.length ? (
              <Empty>Nothing in progress. Morning ignition needs fuel.</Empty>
            ) : (
              <ul>
                {books.map((b) => {
                  const pct = b.totalPages ? Math.min(100, (b.currentPage / b.totalPages) * 100) : 0
                  return (
                    <li key={b.id} className="group border-b border-line py-4 last:border-b-0">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <InlineText value={b.title} onChange={(v) => s.updateBook(b.id, { title: v })} ariaLabel="Book title" className="t-head" />
                          <InlineText
                            value={b.author}
                            onChange={(v) => s.updateBook(b.id, { author: v })}
                            ariaLabel="Author"
                            placeholder="Author"
                            className="mt-1 text-micro text-faint"
                          />
                        </div>
                        {id !== 'finished' && (
                          <span className="shrink-0 text-body text-faint">
                            <NumCell
                              value={b.currentPage || null}
                              onChange={(v) => s.updateBook(b.id, { currentPage: v ?? 0 })}
                              ariaLabel="Current page"
                              width="w-10"
                            />
                            <span className="mx-0.5">/</span>
                            <NumCell
                              value={b.totalPages || null}
                              onChange={(v) => s.updateBook(b.id, { totalPages: v ?? 0 })}
                              ariaLabel="Total pages"
                              width="w-10"
                            />
                          </span>
                        )}
                        {id === 'finished' && (
                          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="Rating">
                            {[1, 2, 3, 4, 5].map((v) => (
                              <button key={v} onClick={() => s.updateBook(b.id, { rating: v === b.rating ? null : v })} aria-label={`Rate ${v}`}>
                                <Icon name="star" size={13} className={v <= (b.rating ?? 0) ? 'text-paper' : 'text-ghost'} />
                              </button>
                            ))}
                          </div>
                        )}
                        <Tools>
                          <DangerBtn onConfirm={() => s.removeBook(b.id)} label={`Delete ${b.title}`} />
                        </Tools>
                      </div>
                      {id !== 'finished' && b.totalPages > 0 && <Bar pct={pct} className="mt-3" />}
                      <div className="mt-3 flex gap-1.5">
                        {STATUS.filter((x) => x.id !== id).map((x) => (
                          <button key={x.id} className="btn btn-sm" onClick={() => s.updateBook(b.id, { status: x.id })}>
                            → {x.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        )
      })}
    </Page>
  )
}
