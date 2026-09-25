import { useRef, useState } from 'react'
import { Icon } from '../components/icons'
import { Bar, Chain, DangerBtn, Empty, InlineText, NumCell, Page, Section, Tools } from '../components/ui'
import { todayISO } from '../lib/dates'
import { habitChain, habitStreak } from '../lib/habits'
import { searchBooks, type BookMatch } from '../lib/bookSearch'
import { useStore } from '../store/store'
import type { BookStatus } from '../store/types'

/** Cover art, or a plain bordered placeholder — never a broken-image icon. */
function Cover({ url, size = 'sm' }: { url: string | null; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-11 w-8' : 'h-14 w-10'
  if (url) return <img src={url} alt="" className={`${cls} shrink-0 border border-line object-cover`} />
  return (
    <span className={`${cls} flex shrink-0 items-center justify-center border border-line bg-ink-2 text-faint`}>
      <Icon name="books" size={14} />
    </span>
  )
}

const STATUS: { id: BookStatus; label: string }[] = [
  { id: 'reading', label: 'Reading' },
  { id: 'queued', label: 'Queue' },
  { id: 'finished', label: 'Finished' },
]

export function Books({ label }: { label: string }) {
  const s = useStore()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [manual, setManual] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const todayMin = s.readingLog[todayISO()] ?? 0
  const habit = s.habits.find((h) => h.id === 'h-read')

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    try {
      setResults(await searchBooks(query, controller.signal))
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const addMatch = (m: BookMatch) => {
    s.addBook({ title: m.title, author: m.author, totalPages: m.totalPages, coverUrl: m.coverUrl })
    setQuery('')
    setResults(null)
  }

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
        <form className="flex gap-2" onSubmit={runSearch}>
          <input
            className="field min-w-0 flex-1"
            placeholder="Search by title or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-solid shrink-0" type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {results && results.length > 0 && (
          <ul className="mt-4">
            {results.map((m, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <Cover url={m.coverUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-paper">{m.title}</span>
                  <span className="block truncate text-micro text-faint">
                    {m.author || 'Unknown author'}
                    {m.year ? ` · ${m.year}` : ''}
                  </span>
                </span>
                <button className="btn btn-sm shrink-0" onClick={() => addMatch(m)}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
        {results && results.length === 0 && <Empty>No match on Open Library. Add it by hand below.</Empty>}

        <button type="button" className="mt-4 block text-micro text-faint hover:text-paper" onClick={() => setManual((v) => !v)}>
          {manual ? 'Hide manual entry' : "Can't find it? Add manually"}
        </button>

        {manual && (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!title.trim()) return
              s.addBook({ title: title.trim(), author: author.trim() })
              setTitle('')
              setAuthor('')
              setManual(false)
            }}
          >
            <input className="field min-w-0 flex-1" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="field min-w-0 flex-1" placeholder="Author" value={author} onChange={(e) => setAuthor(e.target.value)} />
            <button className="btn btn-solid" type="submit">
              Add
            </button>
          </form>
        )}
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
                        <Cover url={b.coverUrl} size="md" />
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
