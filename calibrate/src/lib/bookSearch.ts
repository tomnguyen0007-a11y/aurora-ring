/* ════════════════════════════════════════════════════════════════════
   BOOK SEARCH
   Two free, keyless catalogues, both CORS-open so this runs straight
   from the browser:

   · Google Books — the biggest catalogue there is (tens of millions of
     volumes), with real edition data: publisher, page count, a
     description, and publisher-supplied cover art. This is what finds
     "Meditations — Penguin Classics" instead of a random reprint.
     Docs: https://developers.google.com/books/docs/v1/using
   · Open Library — the fallback: open data, strong on older and
     non-English titles, and independent of Google's per-IP quota.
     Docs: https://openlibrary.org/dev/docs/api/search

   Search queries both in parallel and merges (Google first — its
   relevance ranking is far better). Either one failing is fine; only
   both failing is an error.

   Two failure modes the matcher guards against:
   · Wrong cover — a work's default cover is often a translation, so
     Open Library is asked for the English edition's art.
   · Wrong book — auto-matching (the backfill) only accepts a hit whose
     title and author actually agree; otherwise the typeset tile stays.
   ════════════════════════════════════════════════════════════════════ */

export interface BookMatch {
  title: string
  author: string
  /** Best available cover, or null when the catalogue has none. */
  coverUrl: string | null
  /** 0 when unknown. */
  totalPages: number
  year: number | null
  publisher?: string
  /** Catalogue description, plain text. Seeds the auto-summary. */
  description?: string
  source: 'google' | 'openlibrary'
}

// ── Covers ─────────────────────────────────────────────────────────

/** Open Library -L is ~500px tall: sharp on a retina cover wall. -M (180px) looked soft. */
export function coverFor(id: number, size: 'M' | 'L' = 'L'): string {
  return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`
}

/** Google's full-resolution cover for a volume. `fife` asks its image server for an 800px-wide render. */
export function googleCover(volumeId: string): string {
  return `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=1&fife=w800`
}

/**
 * URLs to try for a saved cover, best first. The <img> walks the list on
 * error, so a sharp render that isn't available degrades to the thumbnail
 * instead of to nothing.
 */
export function coverCandidates(url: string | null, small = false): string[] {
  if (!url) return []
  const ol = url.match(/^(https:\/\/covers\.openlibrary\.org\/b\/id\/\d+)-[SML]\.jpg/)
  if (ol) return [`${ol[1]}-${small ? 'M' : 'L'}.jpg`]
  if (url.includes('books.google.com/books/content')) {
    const base = url.replace(/&fife=[^&]*/, '')
    return small ? [base] : [`${base}&fife=w800`, base]
  }
  return [url]
}

/** Upgrade covers saved at medium size before the switch to large. */
export function sharpCover(url: string | null): string | null {
  return coverCandidates(url)[0] ?? null
}

// ── Google Books ───────────────────────────────────────────────────

export interface GoogleVolume {
  id: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    pageCount?: number
    description?: string
    language?: string
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
  }
}

/** Google descriptions are HTML fragments. */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function fromGoogle(v: GoogleVolume): BookMatch | null {
  const i = v.volumeInfo
  if (!i?.title) return null
  const year = i.publishedDate ? parseInt(i.publishedDate.slice(0, 4), 10) : NaN
  return {
    title: i.title,
    author: i.authors?.join(', ') ?? '',
    coverUrl: i.imageLinks?.thumbnail || i.imageLinks?.smallThumbnail ? googleCover(v.id) : null,
    totalPages: i.pageCount ?? 0,
    year: isNaN(year) ? null : year,
    publisher: i.publisher,
    description: i.description ? plainText(i.description) : undefined,
    source: 'google',
  }
}

const GOOGLE_FIELDS =
  'items(id,volumeInfo(title,subtitle,authors,publisher,publishedDate,pageCount,description,language,imageLinks))'

async function google(q: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const qs = new URLSearchParams({ q, maxResults: '20', printType: 'books', orderBy: 'relevance', fields: GOOGLE_FIELDS })
  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${qs}`, { signal })
  // Throw, don't return []: a 429 or 503 is "don't know", and callers must not
  // read it as "this book has no cover" and wipe a good one.
  if (!res.ok) throw new Error(`Google Books ${res.status}`)
  const data = (await res.json()) as { items?: GoogleVolume[] }
  return (data.items ?? []).map(fromGoogle).filter((m): m is BookMatch => !!m)
}

const quoted = (s: string) => `"${s.replace(/"/g, '')}"`
const googleFielded = (title: string, author: string) =>
  `intitle:${quoted(title)}${author.trim() ? ` inauthor:${quoted(author.split(',')[0].trim())}` : ''}`

// ── Open Library ───────────────────────────────────────────────────

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
  publisher?: string[]
  editions?: { docs?: OpenLibraryEdition[] }
}

const OL_FIELDS = [
  'title',
  'author_name',
  'cover_i',
  'number_of_pages_median',
  'first_publish_year',
  'editions',
  'editions.cover_i',
  'editions.language',
].join(',')

function pickCover(d: OpenLibraryDoc): number | null {
  const ed = d.editions?.docs?.[0]
  if (ed?.cover_i && (!ed.language || ed.language.includes('eng'))) return ed.cover_i
  return d.cover_i ?? ed?.cover_i ?? null
}

function fromOpenLibrary(d: OpenLibraryDoc & { title: string }): BookMatch {
  const cover = pickCover(d)
  return {
    title: d.title,
    author: d.author_name?.[0] ?? '',
    coverUrl: cover ? coverFor(cover) : null,
    totalPages: d.number_of_pages_median ?? 0,
    year: d.first_publish_year ?? null,
    source: 'openlibrary',
  }
}

async function openLibrary(params: Record<string, string>, signal?: AbortSignal): Promise<BookMatch[]> {
  const qs = new URLSearchParams({ ...params, lang: 'en', limit: '10', fields: OL_FIELDS })
  const res = await fetch(`https://openlibrary.org/search.json?${qs}`, { signal })
  if (!res.ok) throw new Error(`Open Library ${res.status}`)
  const data = (await res.json()) as { docs?: OpenLibraryDoc[] }
  return (data.docs ?? []).filter((d): d is OpenLibraryDoc & { title: string } => !!d.title).map(fromOpenLibrary)
}

// ── Merge ──────────────────────────────────────────────────────────

/** Run both catalogues; keep whatever answered. Throws only if both failed. */
async function both(g: Promise<BookMatch[]>, o: Promise<BookMatch[]>): Promise<BookMatch[]> {
  const [gr, or] = await Promise.allSettled([g, o])
  if (gr.status === 'rejected' && or.status === 'rejected') throw gr.reason
  return mergeResults(gr.status === 'fulfilled' ? gr.value : [], or.status === 'fulfilled' ? or.value : [])
}

/**
 * Google first (better relevance, real editions). Open Library adds only
 * works Google didn't return. Google's own editions all stay — picking the
 * Penguin Classics printing over another is the point.
 */
export function mergeResults(googleHits: BookMatch[], olHits: BookMatch[]): BookMatch[] {
  const key = (m: BookMatch) => `${norm(m.title.split(/[:(]/)[0])}|${norm(m.author).split(' ').pop() ?? ''}`
  const seenCover = new Set<string>()
  const seenWork = new Set(googleHits.map(key))
  const out: BookMatch[] = []
  for (const m of [...googleHits, ...olHits.filter((m) => !seenWork.has(key(m)))]) {
    if (m.coverUrl && seenCover.has(m.coverUrl)) continue
    if (m.coverUrl) seenCover.add(m.coverUrl)
    out.push(m)
  }
  return out
}

export async function searchBooks(q: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const text = q.trim()
  if (!text) return []
  return both(google(text, signal), openLibrary({ q: text }, signal))
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

/** Hits that are confidently this book, best first. */
export function confidentMatches(title: string, author: string, hits: BookMatch[]): BookMatch[] {
  return hits
    .map((m) => ({ m, t: titleScore(title, m.title), a: authorScore(author, m.author) }))
    .filter((x) => x.t >= 0.75 && x.a > 0)
    .sort((x, y) => y.t + y.a - (x.t + x.a))
    .map((x) => x.m)
}

/**
 * The best confident match with a cover, or null. Better no cover than
 * the wrong one.
 */
export function bestCoverMatch(title: string, author: string, hits: BookMatch[]): BookMatch | null {
  return confidentMatches(title, author, hits).find((m) => m.coverUrl) ?? null
}

function fieldedBoth(title: string, author: string, signal?: AbortSignal) {
  return both(
    google(googleFielded(title, author), signal),
    openLibrary(author.trim() ? { title, author } : { title }, signal),
  )
}

/** Auto-match a saved book to cover art. Fielded query first, loose one second. */
export async function matchCover(title: string, author: string, signal?: AbortSignal): Promise<BookMatch | null> {
  const hit = bestCoverMatch(title, author, await fieldedBoth(title, author, signal))
  if (hit) return hit
  return bestCoverMatch(title, author, await searchBooks(`${title} ${author}`, signal))
}

/** Every distinct cover for a book — for the manual "change cover" picker. */
export async function coverChoices(title: string, author: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const hits = await fieldedBoth(title, author, signal)
  const loose = hits.filter((m) => m.coverUrl).length < 4 ? await searchBooks(`${title} ${author}`, signal).catch(() => []) : []
  return mergeResults(hits, loose).filter((m) => m.coverUrl)
}

/** The longest catalogue description for this exact book, or null. */
export async function describeBook(title: string, author: string, signal?: AbortSignal): Promise<string | null> {
  const hits = await google(googleFielded(title, author), signal)
  const texts = confidentMatches(title, author, hits)
    .map((m) => m.description ?? '')
    .filter((d) => d.length > 80)
    .sort((a, b) => b.length - a.length)
  return texts[0] ?? null
}
