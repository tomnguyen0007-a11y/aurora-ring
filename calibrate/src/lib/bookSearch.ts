/* ════════════════════════════════════════════════════════════════════
   BOOK SEARCH
   Open Library's search API — free, keyless, no signup, and (like the
   remote sources in foodSearch.ts) sends permissive CORS headers, so this
   works straight from the browser with no proxy. Turns a typed title into
   a real cover, author, and page count instead of a blank library card.
   Docs: https://openlibrary.org/dev/docs/api/search

   Two failure modes this guards against:
   · Wrong cover. A work's default cover is whichever edition someone
     uploaded first — often a translation (The Third Door's is Chinese).
     We ask for the best English edition and prefer its cover.
   · Wrong book. A loose query happily returns a different title. Auto-
     matching (the backfill) only accepts a hit whose title and author
     actually agree with the book; otherwise the typeset tile stays.
   ════════════════════════════════════════════════════════════════════ */

export interface BookMatch {
  title: string
  author: string
  /** Large cover JPEG, or null when Open Library has none on file. */
  coverUrl: string | null
  /** Best-guess page count (median across editions) — 0 when unknown. */
  totalPages: number
  year: number | null
}

interface OpenLibraryEdition {
  cover_i?: number
  language?: string[]
}

interface OpenLibraryDoc {
  title?: string
  author_name?: string[]
  cover_i?: number
  number_of_pages_median?: number
  first_publish_year?: number
  language?: string[]
  editions?: { docs?: OpenLibraryEdition[] }
}

const FIELDS = [
  'title',
  'author_name',
  'cover_i',
  'number_of_pages_median',
  'first_publish_year',
  'language',
  'editions',
  'editions.cover_i',
  'editions.language',
].join(',')

/** -L is ~500px tall: sharp on a retina cover wall. -M (180px) looked soft. */
export function coverFor(id: number, size: 'M' | 'L' = 'L'): string {
  return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`
}

/** Upgrade covers saved at medium size before the switch to -L. */
export function sharpCover(url: string | null): string | null {
  return url ? url.replace(/(covers\.openlibrary\.org\/b\/id\/\d+)-[SM]\.jpg/, '$1-L.jpg') : null
}

function pickCover(d: OpenLibraryDoc): number | null {
  const ed = d.editions?.docs?.[0]
  if (ed?.cover_i && (!ed.language || ed.language.includes('eng'))) return ed.cover_i
  return d.cover_i ?? ed?.cover_i ?? null
}

function toMatch(d: OpenLibraryDoc & { title: string }): BookMatch {
  const cover = pickCover(d)
  return {
    title: d.title,
    author: d.author_name?.[0] ?? '',
    coverUrl: cover ? coverFor(cover) : null,
    totalPages: d.number_of_pages_median ?? 0,
    year: d.first_publish_year ?? null,
  }
}

async function query(params: Record<string, string>, signal?: AbortSignal): Promise<BookMatch[]> {
  const qs = new URLSearchParams({ ...params, lang: 'en', limit: '10', fields: FIELDS })
  const res = await fetch(`https://openlibrary.org/search.json?${qs}`, { signal })
  // Throw, don't return []: a 429 or 503 is "don't know", and callers must not
  // read it as "this book has no cover" and wipe a good one.
  if (!res.ok) throw new Error(`Open Library ${res.status}`)
  const data = (await res.json()) as { docs?: OpenLibraryDoc[] }
  return (data.docs ?? []).filter((d): d is OpenLibraryDoc & { title: string } => !!d.title).map(toMatch)
}

export async function searchBooks(q: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const text = q.trim()
  if (!text) return []
  return query({ q: text }, signal)
}

// ── Matching ───────────────────────────────────────────────────────

/** Lowercase, strip accents and punctuation — "Psychologie peněz" ≈ "psychologie penez". */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for'])
const words = (s: string) => norm(s).split(' ').filter((w) => w && !STOP.has(w))

/** Share of the wanted title's words present in the candidate's main title (before any subtitle). */
export function titleScore(want: string, got: string): number {
  const w = words(want)
  if (!w.length) return 0
  const g = new Set(words(got.split(/[:(]/)[0]))
  const hit = w.filter((x) => g.has(x)).length
  // Penalise a candidate that is much longer — "Dune" should not match "Dune Messiah".
  const extra = Math.max(0, g.size - w.length)
  return hit / w.length - extra * 0.3
}

/** Surname agreement, forgiving initials and "R. Larry" vs "Larry". */
export function authorScore(want: string, got: string): number {
  const w = words(want)
  if (!w.length) return 0.5 // unknown author: neutral
  const g = new Set(words(got))
  return w.some((x) => x.length > 1 && g.has(x)) ? 1 : 0
}

/**
 * The best confident match with a cover, or null. Confident = the title
 * agrees and (when we know it) the author does too. Better no cover than
 * the wrong one.
 */
export function bestCoverMatch(title: string, author: string, hits: BookMatch[]): BookMatch | null {
  let best: { m: BookMatch; score: number } | null = null
  for (const m of hits) {
    if (!m.coverUrl) continue
    const t = titleScore(title, m.title)
    const a = authorScore(author, m.author)
    if (t < 0.75 || a === 0) continue
    const score = t + a
    if (!best || score > best.score) best = { m, score }
  }
  return best?.m ?? null
}

/** Auto-match a saved book to cover art. Fielded query first, loose one second. */
export async function matchCover(title: string, author: string, signal?: AbortSignal): Promise<BookMatch | null> {
  const tries: Record<string, string>[] = author.trim()
    ? [{ title, author }, { q: `${title} ${author}` }]
    : [{ title }]
  for (const p of tries) {
    const hits = await query(p, signal)
    const hit = bestCoverMatch(title, author, hits)
    if (hit) return hit
  }
  return null
}

/** Every distinct cover for a book — for the manual "change cover" picker. */
export async function coverChoices(title: string, author: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const hits = await query(author.trim() ? { title, author } : { title }, signal)
  const loose = hits.length < 3 ? await searchBooks(`${title} ${author}`, signal).catch(() => [] as BookMatch[]) : []
  const seen = new Set<string>()
  return [...hits, ...loose].filter((m) => {
    if (!m.coverUrl || seen.has(m.coverUrl)) return false
    seen.add(m.coverUrl)
    return true
  })
}
