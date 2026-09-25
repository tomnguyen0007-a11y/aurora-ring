import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/icons'
import { Chain, DangerBtn, Empty, Eyebrow, InlineArea, InlineText, NumCell, Page, Sheet, Tools } from '../components/ui'
import { coverCandidates, coverChoices, findFreeCopy, matchCover, searchBooks, sharpCover, type BookMatch } from '../lib/bookSearch'
import { todayISO } from '../lib/dates'
import { habitChain, habitStreak } from '../lib/habits'
import { useStore } from '../store/store'
import type { Book, BookStatus } from '../store/types'

/* ════════════════════════════════════════════════════════════════════
   READING
   A proper reading tracker — the year's count and goal, a month strip,
   lifetime stats, what's on the nightstand, and a cover wall of
   everything read. The library lives on raised graphite panels
   (--color-card*) with soft corners: a cover wall on pure ink reads as
   a void. Everywhere else in Calibrate stays hairline-flat.
   ════════════════════════════════════════════════════════════════════ */

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Bumping this re-checks every auto-matched cover once with the current matcher. */
const COVER_REV = 2

const PANEL = 'rounded-2xl border border-white/[0.05] bg-card p-4 sm:p-6'
const PILL =
  'inline-flex items-center gap-1.5 rounded-full border border-line-2 px-3 py-1 text-label font-medium text-paper transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-paper'

// ── Covers ─────────────────────────────────────────────────────────

type CoverSize = 'sm' | 'row' | 'md' | 'lg' | 'fill'

const BOX: Record<CoverSize, string> = {
  sm: 'h-12 w-8 rounded-[3px]',
  row: 'h-[4.5rem] w-12 rounded-[3px]',
  md: 'h-[6.75rem] w-[4.5rem] rounded-[4px]',
  lg: 'h-40 w-[6.75rem] rounded-[4px]',
  fill: 'aspect-[2/3] w-full rounded-[4px]',
}

/** Cover art, or a typeset title tile when there is none (or it fails to load). */
function Cover({ book, size }: { book: Pick<Book, 'title' | 'author' | 'coverUrl'>; size: CoverSize }) {
  // Sharp render first, thumbnail next, typeset tile last.
  const candidates = coverCandidates(book.coverUrl, size === 'sm' || size === 'row')
  const [failed, setFailed] = useState<{ of: string | null; n: number }>({ of: null, n: 0 })
  const tries = failed.of === book.coverUrl ? failed.n : 0
  const url = candidates[tries]
  const box = BOX[size]
  const next = () => setFailed({ of: book.coverUrl, n: tries + 1 })
  if (url) {
    return (
      <img
        key={url}
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={next}
        // A 1×1 "no image" placeholder is a success to the browser, a failure to us.
        onLoad={(e) => e.currentTarget.naturalWidth < 20 && next()}
        className={`${box} shrink-0 bg-card-3 object-cover shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_6px_16px_-8px_rgba(0,0,0,0.8)]`}
      />
    )
  }
  if (size === 'sm' || size === 'row') {
    return (
      <span className={`${box} flex shrink-0 items-center justify-center bg-card-3 text-faint`}>
        <Icon name="books" size={13} />
      </span>
    )
  }
  // The typeset tile: a grey board with a darker spine, title set bold like a jacket.
  return (
    <span
      className={`${box} relative flex shrink-0 flex-col overflow-hidden bg-card-3 text-left ${size === 'fill' ? 'p-3 sm:p-4' : 'p-2.5'}`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-black/25" aria-hidden="true" />
      <span
        className={`line-clamp-6 hyphens-auto break-words font-semibold leading-[1.15] tracking-[-0.01em] text-paper ${
          size === 'fill' ? 'text-[0.8125rem] sm:text-[0.9375rem]' : 'text-micro'
        }`}
      >
        {book.title}
      </span>
      {book.author && (
        <span className={`mt-1.5 line-clamp-2 leading-tight text-mute ${size === 'fill' ? 'text-micro' : 'text-[0.625rem]'}`}>
          {book.author}
        </span>
      )}
    </span>
  )
}

// Match covers for books that have none, or whose auto-picked cover predates
// the current matcher (the old one grabbed translations and look-alike titles).
// Hand-picked covers are never touched. One attempt per book per session.
const coverTried = new Set<string>()
const needsCover = (b: Book) => !b.coverPinned && (b.coverRev ?? 0) < COVER_REV && !coverTried.has(b.id)

function useCoverBackfill(books: Book[]) {
  const missing = books
    .filter(needsCover)
    .map((b) => b.id)
    .join(',')
  useEffect(() => {
    if (!missing) return
    const controller = new AbortController()
    void (async () => {
      for (const b of useStore.getState().books.filter(needsCover)) {
        coverTried.add(b.id)
        let hit: BookMatch | null
        try {
          hit = await matchCover(b.title, b.author, controller.signal)
        } catch {
          // Offline or rate-limited — not a verdict on the cover. Keep it, retry next session.
          if (controller.signal.aborted) coverTried.delete(b.id)
          return
        }
        // Re-read: the user may have picked a cover while we were waiting.
        const cur = useStore.getState().books.find((x) => x.id === b.id)
        if (!cur || cur.coverPinned) continue
        useStore.getState().updateBook(b.id, {
          coverUrl: hit?.coverUrl ?? null,
          coverRev: COVER_REV,
          ...(cur.totalPages || !hit ? {} : { totalPages: hit.totalPages }),
        })
      }
    })()
    return () => controller.abort()
  }, [missing])
}

// Summaries for every book, written in the background one at a time. The
// module (and the AI client behind it) loads only when there is work to do.
const summaryTried = new Set<string>()
const needsSummary = (b: Book) => b.summary === undefined && !summaryTried.has(b.id)

function useSummaryBackfill(books: Book[]) {
  const missing = books
    .filter(needsSummary)
    .map((b) => b.id)
    .join(',')
  useEffect(() => {
    if (!missing) return
    const controller = new AbortController()
    void (async () => {
      const { summarizeBook } = await import('../lib/bookSummary')
      for (const b of useStore.getState().books.filter(needsSummary)) {
        if (controller.signal.aborted) return
        summaryTried.add(b.id)
        const r = await summarizeBook(b.title, b.author, controller.signal)
        if (controller.signal.aborted) {
          summaryTried.delete(b.id)
          return
        }
        const cur = useStore.getState().books.find((x) => x.id === b.id)
        if (!cur || cur.summary !== undefined) continue
        if (r.text) useStore.getState().updateBook(b.id, { summary: r.text })
        else if (r.definitive) useStore.getState().updateBook(b.id, { summary: '' })
        // Pace it: a shelf of 30 books shouldn't burn a minute's AI quota in a second.
        await new Promise((ok) => setTimeout(ok, 2500))
      }
    })()
    return () => controller.abort()
  }, [missing])
}

function FreeBadge() {
  return (
    <span className="shrink-0 rounded-full border border-line-2 px-1.5 py-px text-[0.5625rem] font-semibold uppercase tracking-[0.08em] text-mute">
      Free
    </span>
  )
}

const readLabel = (url: string) =>
  url.includes('gutenberg.org') ? 'Project Gutenberg' : url.includes('archive.org') ? 'Internet Archive' : 'Open Library'

/** "Read free" when a legal full text exists — looked up once per book, remembered. */
function FreeCopy({ book }: { book: Book }) {
  const s = useStore()
  useEffect(() => {
    if (book.readUrl !== undefined) return
    const controller = new AbortController()
    findFreeCopy(book.title, book.author, controller.signal)
      .then((url) => !controller.signal.aborted && s.updateBook(book.id, { readUrl: url ?? '' }))
      .catch(() => {}) // offline — look again next time the sheet opens
    return () => controller.abort()
  }, [book.id, book.title, book.author, book.readUrl, s])
  if (!book.readUrl) return null
  return (
    <a
      href={book.readUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${PILL} mt-4 w-fit`}
    >
      Read free · {readLabel(book.readUrl)} <Icon name="chevronRight" size={11} />
    </a>
  )
}

/** Summary block in the book sheet — auto-filled, editable, re-writable on demand. */
function SummaryBlock({ book }: { book: Book }) {
  const s = useStore()
  const [busy, setBusy] = useState(false)
  const [miss, setMiss] = useState(false)
  const write = async () => {
    setBusy(true)
    setMiss(false)
    try {
      const { summarizeBook } = await import('../lib/bookSummary')
      const r = await summarizeBook(book.title, book.author)
      if (r.text) s.updateBook(book.id, { summary: r.text })
      else setMiss(true)
    } finally {
      setBusy(false)
    }
  }
  const pending = book.summary === undefined
  return (
    <div className="mt-6 border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>Summary</Eyebrow>
        <button type="button" onClick={write} disabled={busy} className="text-micro text-faint transition-colors hover:text-paper disabled:opacity-50">
          {busy ? 'Writing…' : book.summary ? 'Rewrite' : 'Write summary'}
        </button>
      </div>
      {pending && !busy ? (
        <p className="text-micro text-faint">Writing a summary in the background…</p>
      ) : (
        <InlineArea
          value={book.summary ?? ''}
          onChange={(v) => s.updateBook(book.id, { summary: v })}
          ariaLabel="Summary"
          placeholder="No summary found for this title. Write your own, or try again."
          className="!text-label !leading-relaxed"
        />
      )}
      {miss && <p className="mt-1 text-micro text-faint">Nothing found — check the title and author, or add an AI key in Settings for better summaries.</p>}
    </div>
  )
}

// ── Pieces ─────────────────────────────────────────────────────────

function Stars({ book, size = 13 }: { book: Book; size?: number }) {
  const s = useStore()
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === book.rating}
          onClick={() => s.updateBook(book.id, { rating: v === book.rating ? null : v })}
          aria-label={`Rate ${v}`}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <Icon name="star" size={size} className={v <= (book.rating ?? 0) ? 'text-paper' : 'text-ghost'} />
        </button>
      ))}
    </div>
  )
}

function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

/** 4px rounded progress track — the library's one chart primitive. */
function Progress({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-white/[0.08] ${className}`}>
      <div
        className="h-full rounded-full bg-paper transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function ReadingNow({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const s = useStore()
  const pct = book.totalPages ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0
  const since = monthYear(book.startedAt)
  return (
    <li className="group flex gap-4 rounded-xl bg-card-2 p-3 sm:gap-5 sm:p-4">
      <button type="button" onClick={onOpen} aria-label={`Open ${book.title}`} className="shrink-0 self-start transition-opacity hover:opacity-85">
        <Cover book={book} size="md" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <InlineArea
              value={book.title}
              onChange={(v) => s.updateBook(book.id, { title: v })}
              ariaLabel="Book title"
              minRows={1}
              className="!text-[1.0625rem] font-semibold !leading-snug tracking-[-0.012em] !text-paper"
            />
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-label text-dim">
              <InlineText
                value={book.author}
                onChange={(v) => s.updateBook(book.id, { author: v })}
                ariaLabel="Author"
                placeholder="Author"
                className="!w-auto max-w-full text-label text-dim [field-sizing:content]"
              />
              {since && <span className="shrink-0 text-faint">· since {since}</span>}
            </div>
          </div>
          <Tools>
            <DangerBtn onConfirm={() => s.removeBook(book.id)} label={`Delete ${book.title}`} />
          </Tools>
        </div>

        <Progress pct={pct} className="mt-4" />
        <div className="mt-2 flex items-baseline gap-1 text-label text-dim">
          <span>p.</span>
          <NumCell
            value={book.currentPage || null}
            onChange={(v) => s.updateBook(book.id, { currentPage: v ?? 0 })}
            ariaLabel="Current page"
            width="w-[3.2ch] !text-left"
          />
          <span>of</span>
          <NumCell
            value={book.totalPages || null}
            onChange={(v) => s.updateBook(book.id, { totalPages: v ?? 0 })}
            ariaLabel="Total pages"
            width="w-[3.2ch] !text-left"
          />
          <span className="num">· {pct}%</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={`${PILL} bg-black/40`}
            onClick={() =>
              s.updateBook(book.id, {
                status: 'finished',
                currentPage: book.totalPages || book.currentPage,
              })
            }
          >
            Finished <Icon name="check" size={12} />
          </button>
          <button
            className="rounded-full px-3 py-1 text-label text-dim transition-colors hover:bg-white/[0.05] hover:text-paper"
            onClick={() => s.updateBook(book.id, { status: 'queued' })}
          >
            Back to queue
          </button>
        </div>
      </div>
    </li>
  )
}

/** Pick a different cover from Open Library, or drop to the typeset tile. */
function CoverPicker({ book, onDone }: { book: Book; onDone: () => void }) {
  const s = useStore()
  const [choices, setChoices] = useState<BookMatch[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    coverChoices(book.title, book.author, controller.signal)
      .then(setChoices)
      .catch(() => !controller.signal.aborted && setFailed(true))
    return () => controller.abort()
  }, [book.title, book.author])

  const pick = (coverUrl: string | null) => {
    s.updateBook(book.id, { coverUrl, coverPinned: true, coverRev: COVER_REV })
    onDone()
  }

  return (
    <div className="mt-5 rounded-xl bg-card-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>Choose a cover</Eyebrow>
        <button className="text-micro text-faint hover:text-paper" onClick={onDone}>
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => pick(null)}
          aria-label="Use title tile"
          className={`rounded-[4px] outline-offset-2 transition-opacity hover:opacity-85 ${!book.coverUrl ? 'outline outline-1 outline-paper' : ''}`}
        >
          <Cover book={{ ...book, coverUrl: null }} size="fill" />
        </button>
        {choices?.map((c) => (
          <button
            key={c.coverUrl}
            type="button"
            onClick={() => pick(c.coverUrl)}
            aria-label={`Use cover: ${c.title}${c.year ? `, ${c.year}` : ''}`}
            title={`${c.title}${c.author ? ` — ${c.author}` : ''}${c.year ? ` · ${c.year}` : ''}`}
            className={`rounded-[4px] outline-offset-2 transition-opacity hover:opacity-85 ${
              sharpCover(book.coverUrl) === c.coverUrl ? 'outline outline-1 outline-paper' : ''
            }`}
          >
            <Cover book={c} size="fill" />
          </button>
        ))}
      </div>
      {!choices && !failed && <p className="mt-3 text-micro text-faint">Searching Open Library…</p>}
      {failed && <p className="mt-3 text-micro text-faint">Couldn't reach Open Library. The title tile still works.</p>}
      {choices && !choices.length && <p className="mt-3 text-micro text-faint">No covers on file for this title — the tile is the honest option.</p>}
    </div>
  )
}

/** Everything about one book, editable in one place — opened from the cover wall. */
function BookSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const s = useStore()
  const [picking, setPicking] = useState(false)
  const book = s.books.find((b) => b.id === id)
  useEffect(() => setPicking(false), [id])
  if (!book) return null
  const moves: { id: BookStatus; label: string }[] = [
    { id: 'reading', label: 'Reading' },
    { id: 'queued', label: 'Want to read' },
    { id: 'finished', label: 'Finished' },
  ]
  return (
    <Sheet open onClose={onClose} title={book.status === 'finished' ? 'Read' : book.status === 'queued' ? 'Want to read' : 'Reading'} wide>
      <div className="flex gap-5">
        <div className="shrink-0">
          <button type="button" onClick={() => setPicking(true)} aria-label="Change cover" className="block transition-opacity hover:opacity-85">
            <Cover book={book} size="lg" />
          </button>
          <button type="button" onClick={() => setPicking((v) => !v)} className="mt-2 block w-full text-center text-micro text-faint hover:text-paper">
            Change cover
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <InlineText value={book.title} onChange={(v) => s.updateBook(book.id, { title: v })} ariaLabel="Book title" className="t-head" />
          <InlineText
            value={book.author}
            onChange={(v) => s.updateBook(book.id, { author: v })}
            ariaLabel="Author"
            placeholder="Author"
            className="mt-1 text-body text-mute"
          />
          <div className="mt-4 flex flex-wrap items-baseline gap-1 text-micro text-faint">
            <NumCell
              value={book.totalPages || null}
              onChange={(v) => s.updateBook(book.id, { totalPages: v ?? 0 })}
              ariaLabel="Total pages"
              width="w-10"
            />
            <span>pages</span>
            {book.publisher && <span className="ml-1.5">· {book.publisher}</span>}
            {book.status === 'finished' && (
              <>
                <span className="mx-1.5">·</span>
                <span>finished</span>
                <input
                  type="date"
                  className="field-line num text-micro text-mute"
                  value={book.finishedAt ?? ''}
                  aria-label="Finished on"
                  onChange={(e) =>
                    s.updateBook(book.id, {
                      finishedAt: e.target.value || null,
                    })
                  }
                />
              </>
            )}
          </div>
          {book.status === 'finished' && (
            <div className="mt-4">
              <Stars book={book} size={15} />
            </div>
          )}
          <FreeCopy book={book} />
        </div>
      </div>

      {picking && <CoverPicker book={book} onDone={() => setPicking(false)} />}

      <SummaryBlock book={book} />

      <div className="mt-6 border-t border-line pt-4">
        <Eyebrow className="mb-2">What stuck</Eyebrow>
        <InlineArea
          value={book.notes}
          onChange={(v) => s.updateBook(book.id, { notes: v })}
          ariaLabel="Notes"
          placeholder="Quotes, ideas, what to do about it…"
          className="!text-micro"
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {moves
          .filter((m) => m.id !== book.status)
          .map((m) => (
            <button key={m.id} className="btn btn-sm" onClick={() => s.updateBook(book.id, { status: m.id })}>
              → {m.label}
            </button>
          ))}
        <span className="ml-auto">
          <DangerBtn
            onConfirm={() => {
              s.removeBook(book.id)
              onClose()
            }}
            label={`Delete ${book.title}`}
          />
        </span>
      </div>
    </Sheet>
  )
}

const editionKey = (m: BookMatch) => `${m.title}|${m.author}|${m.publisher ?? ''}|${m.year ?? ''}|${m.coverUrl ?? ''}`

/** Search Google Books + Open Library + Project Gutenberg; add straight to Reading or Want to read. Manual entry behind a toggle. */
function AddBooks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookMatch[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [offline, setOffline] = useState(false)
  const [added, setAdded] = useState<string[]>([])
  const [manual, setManual] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setOffline(false)
    try {
      setResults(await searchBooks(query, controller.signal))
    } catch {
      if (controller.signal.aborted) return
      setResults(null)
      setOffline(true)
    } finally {
      setSearching(false)
    }
  }

  const add = (m: BookMatch, status: BookStatus) => {
    s.addBook({
      title: m.title,
      author: m.author,
      totalPages: m.totalPages,
      coverUrl: m.coverUrl,
      // Chosen from a list showing this exact cover — that's a pick, not a guess.
      coverPinned: !!m.coverUrl,
      coverRev: COVER_REV,
      publisher: m.publisher,
      // Undefined, not '': a miss here is one search, not a verdict — the sheet looks again.
      ...(m.readUrl ? { readUrl: m.readUrl } : {}),
      status,
    })
    setAdded((a) => [...a, editionKey(m)])
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add books" wide>
      <form className="flex gap-2" onSubmit={run}>
        <input
          className="field min-w-0 flex-1"
          placeholder="Title, author, ISBN — or add a publisher: “meditations penguin”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <button className="btn btn-solid shrink-0" type="submit" disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {results && results.length > 0 && (
        <ul className="mt-4">
          {results.map((m, i) => {
            const done = added.includes(editionKey(m))
            return (
              <li key={i} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <Cover
                  book={{
                    title: m.title,
                    author: m.author,
                    coverUrl: m.coverUrl,
                  }}
                  size="row"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-body text-paper">{m.title}</span>
                    {m.readUrl && <FreeBadge />}
                  </span>
                  <span className="block truncate text-micro text-mute">{m.author || 'Unknown author'}</span>
                  <span className="block truncate text-micro text-faint">
                    {[m.publisher, m.year, m.totalPages ? `${m.totalPages} pp` : null].filter(Boolean).join(' · ') || '\u00a0'}
                  </span>
                </span>
                {done ? (
                  <span className="shrink-0 text-micro text-faint">Added</span>
                ) : (
                  <span className="flex shrink-0 gap-1.5">
                    <button className="btn btn-sm" onClick={() => add(m, 'reading')}>
                      Reading
                    </button>
                    <button className="btn btn-sm" onClick={() => add(m, 'queued')}>
                      Want
                    </button>
                    <button className="btn btn-sm" onClick={() => add(m, 'finished')}>
                      Read
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {offline && <Empty>Couldn't reach any book catalogue. Check the connection and search again.</Empty>}
      {results && results.length === 0 && <Empty>No match in Google Books, Open Library or Project Gutenberg. Try the author's surname, or add it by hand below.</Empty>}

      <button type="button" className="mt-5 block text-micro text-faint hover:text-paper" onClick={() => setManual((v) => !v)}>
        {manual ? 'Hide manual entry' : "Can't find it? Add manually"}
      </button>
      {manual && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            s.addBook({
              title: title.trim(),
              author: author.trim(),
              status: 'queued',
            })
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
      )}
    </Sheet>
  )
}

// ── Page ───────────────────────────────────────────────────────────

type Tab = 'read' | 'want'
type Sort = 'recent' | 'title' | 'rating'

export function Books({ label }: { label: string }) {
  const s = useStore()
  useCoverBackfill(s.books)
  useSummaryBackfill(s.books)

  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('read')
  const [sort, setSort] = useState<Sort>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [filter, setFilter] = useState('')

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const todayMin = s.readingLog[todayISO()] ?? 0
  const habit = s.habits.find((h) => h.id === 'h-read')

  const finished = s.books.filter((b) => b.status === 'finished')
  const reading = s.books.filter((b) => b.status === 'reading')
  const queued = s.books.filter((b) => b.status === 'queued')
  const thisYear = finished.filter((b) => b.finishedAt?.startsWith(String(year)))
  const perMonth = MONTHS.map((_, m) => thisYear.filter((b) => Number(b.finishedAt!.slice(5, 7)) === m + 1).length)
  const peak = Math.max(2, ...perMonth)
  const pages = finished.reduce((sum, b) => sum + (b.totalPages || 0), 0)
  const rated = finished.filter((b) => b.rating)
  const avg = rated.length ? (rated.reduce((sum, b) => sum + (b.rating ?? 0), 0) / rated.length).toFixed(1) : '—'
  const monthsLeft = 11 - month

  const shelf = useMemo(() => {
    const pool = tab === 'read' ? finished : queued
    const q = filter.trim().toLowerCase()
    const hits = q ? pool.filter((b) => `${b.title} ${b.author} ${b.notes}`.toLowerCase().includes(q)) : pool
    const sorted = [...hits].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      return (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')
    })
    // Group by year only where it means something: the read shelf, newest first
    if (tab !== 'read' || sort !== 'recent') return [{ key: 'all', label: null as string | null, books: sorted }]
    const groups = new Map<string, Book[]>()
    for (const b of sorted) {
      const k = b.finishedAt?.slice(0, 4) ?? 'Undated'
      groups.set(k, [...(groups.get(k) ?? []), b])
    }
    return [...groups.entries()].map(([k, books]) => ({
      key: k,
      label: k,
      books,
    }))
  }, [tab, finished, queued, filter, sort])

  return (
    <Page
      title={label}
      actions={
        <button
          className="inline-flex items-center gap-1.5 rounded-full bg-paper px-4 py-2 text-label font-semibold text-black transition-opacity hover:opacity-90 active:opacity-80"
          onClick={() => setAdding(true)}
        >
          <Icon name="plus" size={13} /> Add books
        </button>
      }
    >
      {/* Year count left, month strip right; stats underneath. One block. */}
      <div>
        <header className="flex flex-col gap-8 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="num text-[3.25rem] font-semibold leading-[0.95] tracking-[-0.045em] text-paper sm:text-[4rem]">
              {thisYear.length}
            </div>
            <p className="mt-2 text-body text-mute">books finished in {year}</p>
            <div className="mt-3 inline-flex items-baseline gap-1 rounded-full border border-line-2 px-3 py-1 text-micro text-mute">
              <span>Read goal</span>
              <span className="num font-semibold text-paper">{thisYear.length}/</span>
              <NumCell value={s.bookGoal} onChange={(v) => s.setBookGoal(v ?? s.bookGoal)} ariaLabel="Yearly reading goal" width="w-[2.2ch] !text-left" />
              <span className="text-faint">· {monthsLeft ? `${monthsLeft} mo left` : 'final month'}</span>
            </div>
          </div>

          <div className="grid w-full grid-cols-12 gap-1.5 sm:w-[20rem]" aria-label={`Books finished per month, ${year}`} role="img">
            {MONTHS.map((m, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className={`num h-3.5 text-[0.625rem] font-medium ${perMonth[i] ? 'text-mute' : 'text-transparent'}`}>
                  {perMonth[i] || 0}
                </span>
                <div
                  className="relative h-14 w-full overflow-hidden rounded-[5px] bg-card-2"
                  title={`${perMonth[i]} in ${new Date(year, i).toLocaleDateString('en-GB', { month: 'long' })}`}
                >
                  <div
                    className={`absolute inset-x-0 bottom-0 rounded-[5px] transition-[height] duration-500 ${
                      i === month ? 'bg-paper' : 'bg-[#8e8e93]'
                    }`}
                    style={{ height: `${(perMonth[i] / peak) * 100}%` }}
                  />
                </div>
                <span
                  className={`text-[0.625rem] ${i === month ? 'font-semibold text-paper' : i > month ? 'text-ghost' : 'text-faint'}`}
                >
                  {m}
                </span>
              </div>
            ))}
          </div>
        </header>

        <div className="flex divide-x divide-line pt-5">
          {[
            { label: 'All time', value: finished.length },
            { label: 'Pages', value: pages.toLocaleString('en-US') },
            { label: 'Avg rating', value: avg === '—' ? avg : `${avg}★` },
          ].map((st) => (
            <div key={st.label} className="pr-6 [&:not(:first-child)]:pl-6">
              <Eyebrow>{st.label}</Eyebrow>
              <div className="num mt-1.5 text-[1.0625rem] font-semibold text-paper">{st.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {/* Nightstand + the fifteen-minute habit, one panel. */}
        <section className={PANEL} aria-labelledby="reading-now">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div>
              <h2 id="reading-now" className="mb-4 flex items-baseline gap-2 text-[0.9375rem] font-semibold text-paper">
                Reading now <span className="num text-micro font-normal text-faint">{reading.length}</span>
              </h2>
              {reading.length ? (
                <ul className="space-y-3">
                  {reading.map((b) => (
                    <ReadingNow key={b.id} book={b} onOpen={() => setDetail(b.id)} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-card-2 px-4 py-6 text-body text-dim">Nothing on the nightstand. Pull one from Want to read.</p>
              )}
            </div>

            <div className="border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <Eyebrow className="mb-4">Today</Eyebrow>
              <div className="flex items-baseline gap-1">
                <span className="num text-[2rem] font-semibold leading-none tracking-[-0.03em]">{todayMin}</span>
                <span className="text-label text-faint">/15 min</span>
              </div>
              {habit && <div className="mt-2 text-micro text-dim">{habitStreak(s, habit)} day streak</div>}
              <Progress pct={(todayMin / 15) * 100} className="mt-4" />
              <div className="mt-4 flex flex-wrap gap-1.5">
                {todayMin > 0 && (
                  <button className={PILL} onClick={() => s.logReading(todayISO(), -15)} aria-label="Subtract 15 minutes">
                    −15
                  </button>
                )}
                {[15, 30, 45].map((m) => (
                  <button key={m} className={PILL} onClick={() => s.logReading(todayISO(), m)} aria-label={`Log ${m} minutes`}>
                    +{m}
                  </button>
                ))}
              </div>
              {habit && (
                <div className="mt-5">
                  <div className="eyebrow mb-2">Last 30 days</div>
                  <Chain days={habitChain(s, habit, 30)} size={6} />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className={PANEL} aria-label="Library">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-card-2 p-1" role="tablist" aria-label="Shelf">
              {(
                [
                  { id: 'read', label: 'Read', n: finished.length },
                  { id: 'want', label: 'Want to read', n: queued.length },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3.5 py-1.5 text-label font-medium transition-colors ${
                    tab === t.id ? 'bg-paper text-black' : 'text-dim hover:text-paper'
                  }`}
                >
                  {t.label} <span className={`num ml-1 ${tab === t.id ? 'text-black/55' : 'text-faint'}`}>{t.n}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="relative">
                <select
                  className="cursor-pointer appearance-none rounded-full border border-line-2 bg-transparent py-1.5 pl-3 pr-7 text-label font-medium text-paper outline-none transition-colors hover:bg-white/[0.05] focus-visible:border-line-3"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  aria-label="Sort"
                >
                  <option value="recent">Recent</option>
                  <option value="title">Title</option>
                  <option value="rating">Rating</option>
                </select>
                <Icon name="chevronDown" size={11} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-mute" />
              </span>
              <span className="inline-flex rounded-full border border-line-2 p-0.5" role="radiogroup" aria-label="View">
                {(
                  [
                    { id: 'grid', glyph: 'grid', label: 'Cover wall' },
                    { id: 'list', glyph: 'list', label: 'List' },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={view === v.id}
                    aria-label={v.label}
                    title={v.label}
                    onClick={() => setView(v.id)}
                    className={`rounded-full px-2 py-1 transition-colors ${view === v.id ? 'bg-white/[0.12] text-paper' : 'text-faint hover:text-paper'}`}
                  >
                    <Icon name={v.glyph} size={13} />
                  </button>
                ))}
              </span>
            </div>
          </div>

          <input
            className="mt-5 w-full border-b border-line bg-transparent pb-2.5 text-body text-paper outline-none transition-colors placeholder:text-faint focus:border-line-3"
            placeholder="Filter by title, author or note"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter books"
          />

          {shelf.every((g) => !g.books.length) ? (
            <Empty>
              {filter
                ? 'Nothing matches.'
                : tab === 'read'
                  ? 'Nothing finished yet — the wall fills itself.'
                  : 'Queue is empty. Add books to line up what’s next.'}
            </Empty>
          ) : (
            shelf.map((g) => (
              <div key={g.key} className="mt-6">
                {g.label && (
                  <div className="mb-3 flex items-baseline justify-between">
                    <span className="num text-body font-semibold text-paper">{g.label}</span>
                    <span className="eyebrow">
                      {g.books.length} {g.books.length === 1 ? 'book' : 'books'}
                    </span>
                  </div>
                )}
                {view === 'grid' ? (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                    {g.books.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setDetail(b.id)}
                        className="group self-start rounded-[4px] text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-paper"
                        aria-label={`Open ${b.title}`}
                      >
                        <div className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-active:translate-y-0">
                          <Cover book={b} size="fill" />
                        </div>
                        {b.rating ? (
                          <div className="mt-1.5 flex gap-0.5 text-paper" aria-label={`${b.rating} stars`}>
                            {Array.from({ length: b.rating }, (_, i) => (
                              <Icon key={i} name="star" size={10} />
                            ))}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <ul className="overflow-hidden rounded-xl bg-card-2">
                    {g.books.map((b) => (
                      <li key={b.id} className="flex items-center gap-4 border-b border-line px-3 py-2.5 last:border-b-0">
                        <button onClick={() => setDetail(b.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                          <Cover book={b} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-body font-medium text-paper">{b.title}</span>
                              {b.readUrl && <FreeBadge />}
                            </span>
                            <span className="block truncate text-micro text-faint">
                              {b.author || 'Unknown author'}
                              {b.totalPages ? ` · ${b.totalPages} pp` : ''}
                            </span>
                          </span>
                        </button>
                        {tab === 'read' ? (
                          <Stars book={b} />
                        ) : (
                          <button className={`${PILL} shrink-0`} onClick={() => s.updateBook(b.id, { status: 'reading' })}>
                            Start
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </section>
      </div>

      <AddBooks open={adding} onClose={() => setAdding(false)} />
      <BookSheet id={detail} onClose={() => setDetail(null)} />
    </Page>
  )
}
