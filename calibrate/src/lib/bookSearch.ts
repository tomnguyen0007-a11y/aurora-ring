/* ════════════════════════════════════════════════════════════════════
   BOOK SEARCH
   Three free, keyless catalogues, all CORS-open so this runs straight
   from the browser:

   · Google Books — the biggest catalogue there is (tens of millions of
     volumes), with real edition data: publisher, page count, a
     description, and publisher-supplied cover art. This is what finds
     "Meditations — Penguin Classics" instead of a random reprint.
     Docs: https://developers.google.com/books/docs/v1/using
   · Open Library — the fallback: open data, strong on older and
     non-English titles, and independent of Google's per-IP quota.
     Queried at edition level, so "meditations penguin" can land on the
     Penguin printing, and public-domain scans come with a read link.
     Docs: https://openlibrary.org/dev/docs/api/search
   · Project Gutenberg, via Gutendex — 75,000+ public-domain books with
     free full text. Its covers are plain, so it mostly contributes a
     "Read free" link to a match the other two already found.
     Docs: https://gutendex.com

   Search queries all three in parallel and merges (Google first — its
   relevance ranking is far better). Any of them failing is fine; only
   all of them failing is an error. Results stream in: whatever answers
   first is on screen while Gutendex (the slow one) is still thinking.

   Language: every catalogue leans English by default, which buries
   Czech and German editions. The query's language is guessed from its
   diacritics (ř ů ě → Czech, ä ö ü ß → German…); Google then also runs a
   language-restricted search and Open Library prefers that language's
   editions. A query with no accents still gets a Czech-restricted Google
   pass, because Czech titles are often typed without them.

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
  /** Free, legal full text — Project Gutenberg or an Open Library public scan. */
  readUrl?: string
  source: 'google' | 'openlibrary' | 'gutenberg'
}

// ── Language ───────────────────────────────────────────────────────

export type Lang = 'cs' | 'sk' | 'de' | 'pl' | 'en'

/** Open Library tags editions with MARC (ISO 639-2/B) codes. */
const MARC: Record<Lang, string> = { cs: 'cze', sk: 'slo', de: 'ger', pl: 'pol', en: 'eng' }

/** A confident guess from letters that only one of these languages uses, else null. */
export function guessLang(text: string): Lang | null {
  if (/[ěřů]/i.test(text)) return 'cs'
  if (/[ľĺŕô]/i.test(text)) return 'sk'
  if (/[ąęłńśźż]/i.test(text)) return 'pl'
  if (/[äöüß]/i.test(text)) return 'de'
  if (/[ščžýťďň]/i.test(text)) return 'cs'
  return null
}

/**
 * The reader's own non-English language — the browser's, if it names one
 * we handle, else Czech: Calibrate lives in Prague, and a Czech title typed
 * without its accents gives guessLang nothing to go on.
 */
function homeLang(): Lang {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [] : []
  for (const l of langs) {
    const code = l.slice(0, 2).toLowerCase() as Lang
    if (code in MARC && code !== 'en') return code
  }
  return 'cs'
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

async function google(q: string, signal?: AbortSignal, lang?: Lang): Promise<BookMatch[]> {
  const qs = new URLSearchParams({ q, maxResults: '20', printType: 'books', orderBy: 'relevance', fields: GOOGLE_FIELDS })
  if (lang) qs.set('langRestrict', lang)
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
  key?: string
  title?: string
  cover_i?: number
  language?: string[]
  publisher?: string[]
  publish_date?: string[]
  number_of_pages_median?: number
  ebook_access?: string
  ia?: string[]
}

interface OpenLibraryDoc {
  title?: string
  author_name?: string[]
  cover_i?: number
  number_of_pages_median?: number
  first_publish_year?: number
  key?: string
  ebook_access?: string
  editions?: { docs?: OpenLibraryEdition[] }
}

const OL_FIELDS = [
  'title',
  'author_name',
  'cover_i',
  'number_of_pages_median',
  'first_publish_year',
  'key',
  'ebook_access',
  'editions',
  'editions.key',
  'editions.cover_i',
  'editions.language',
  'editions.publisher',
  'editions.ebook_access',
  'editions.ia',
].join(',')

function pickCover(d: OpenLibraryDoc, lang: Lang): number | null {
  const ed = d.editions?.docs?.[0]
  if (ed?.cover_i && (!ed.language || ed.language.includes(MARC[lang]) || ed.language.includes('eng'))) return ed.cover_i
  return d.cover_i ?? ed?.cover_i ?? null
}

export function fromOpenLibrary(d: OpenLibraryDoc & { title: string }, lang: Lang = 'en'): BookMatch {
  const cover = pickCover(d, lang)
  // `editions.docs[0]` is the edition that best matches the query — its
  // publisher is what the user typed "penguin" to find.
  const ed = d.editions?.docs?.[0]
  const publicScan = ed?.ebook_access === 'public' && ed.ia?.[0]
  return {
    title: d.title,
    author: d.author_name?.[0] ?? '',
    coverUrl: cover ? coverFor(cover) : null,
    totalPages: d.number_of_pages_median ?? 0,
    year: d.first_publish_year ?? null,
    publisher: ed?.publisher?.[0],
    readUrl: publicScan
      ? `https://archive.org/details/${encodeURIComponent(publicScan)}`
      : d.ebook_access === 'public' && d.key
        ? `https://openlibrary.org${d.key}`
        : undefined,
    source: 'openlibrary',
  }
}

async function openLibrary(params: Record<string, string>, signal?: AbortSignal, lang: Lang = 'en'): Promise<BookMatch[]> {
  // `lang` makes Open Library pick that language's edition as editions.docs[0].
  const qs = new URLSearchParams({ ...params, lang, limit: '10', fields: OL_FIELDS })
  const res = await fetch(`https://openlibrary.org/search.json?${qs}`, { signal })
  if (!res.ok) throw new Error(`Open Library ${res.status}`)
  const data = (await res.json()) as { docs?: OpenLibraryDoc[] }
  return (data.docs ?? []).filter((d): d is OpenLibraryDoc & { title: string } => !!d.title).map((d) => fromOpenLibrary(d, lang))
}

// ── Project Gutenberg (Gutendex) ──────────────────────────────────

export interface GutendexBook {
  id: number
  title?: string
  authors?: { name: string }[]
  formats?: Record<string, string>
}

/** "Austen, Jane" → "Jane Austen"; "Marcus Aurelius, Emperor of Rome, 121-180" → "Marcus Aurelius". */
export function gutenbergAuthor(name: string): string {
  const parts = name.split(', ').filter((p) => !/\d/.test(p))
  if (parts.length >= 2 && /^[A-Z][\w.'-]*(\s[A-Z][\w.'-]*){0,2}$/.test(parts[1]) && !/\s/.test(parts[0].trim())) {
    return `${parts[1]} ${parts[0]}`
  }
  return parts[0] ?? name
}

export function fromGutenberg(b: GutendexBook): BookMatch | null {
  if (!b.title) return null
  return {
    // Gutenberg titles carry the subtitle after a semicolon or newline.
    title: b.title.split(/[;\n\r]/)[0].trim(),
    author: b.authors?.[0] ? gutenbergAuthor(b.authors[0].name) : '',
    coverUrl: b.formats?.['image/jpeg'] ?? null,
    totalPages: 0,
    year: null,
    publisher: 'Project Gutenberg',
    readUrl: `https://www.gutenberg.org/ebooks/${b.id}`,
    source: 'gutenberg',
  }
}

async function gutenberg(q: string, signal?: AbortSignal): Promise<BookMatch[]> {
  // Gutendex can be slow; never let it hold the other two hostage.
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), 8000)
  const relay = () => timeout.abort()
  signal?.addEventListener('abort', relay)
  try {
    const res = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`, { signal: timeout.signal })
    if (!res.ok) throw new Error(`Gutendex ${res.status}`)
    const data = (await res.json()) as { results?: GutendexBook[] }
    return (data.results ?? []).slice(0, 8).map(fromGutenberg).filter((m): m is BookMatch => !!m)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', relay)
  }
}

// ── Merge ──────────────────────────────────────────────────────────

/** Google editions from several passes, first pass wins; the same volume twice is dropped. */
export function concatGoogle(...passes: BookMatch[][]): BookMatch[] {
  const seen = new Set<string>()
  return passes.flat().filter((m) => {
    const k = m.coverUrl ?? `${norm(m.title)}|${norm(m.author)}|${m.publisher ?? ''}|${m.year ?? ''}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

interface Sources {
  /** Google passes in priority order. */
  google: Promise<BookMatch[]>[]
  openLibrary: Promise<BookMatch[]>
  gutenberg?: Promise<BookMatch[]>
}

/**
 * Merge sources as each one lands, calling onUpdate with the best list so
 * far. Resolves with the final list; throws only if every source failed.
 */
async function stream(src: Sources, onUpdate?: (results: BookMatch[], done: boolean) => void): Promise<BookMatch[]> {
  const g: (BookMatch[] | null)[] = src.google.map(() => null)
  let o: BookMatch[] = []
  let pg: BookMatch[] = []
  let failures = 0
  const total = src.google.length + 1 + (src.gutenberg ? 1 : 0)
  let settled = 0
  const merged = () => mergeResults(concatGoogle(...g.map((x) => x ?? [])), o, pg)
  const land = (fn: () => void) => () => {
    fn()
    settled++
    onUpdate?.(merged(), settled === total)
  }
  const miss = () => {
    failures++
    settled++
    if (settled === total) onUpdate?.(merged(), true)
  }
  await Promise.all([
    ...src.google.map((p, i) => p.then((v) => land(() => (g[i] = v))(), miss)),
    src.openLibrary.then((v) => land(() => (o = v))(), miss),
    ...(src.gutenberg ? [src.gutenberg.then((v) => land(() => (pg = v))(), miss)] : []),
  ])
  if (failures === total) throw new Error('No book catalogue reachable')
  return merged()
}

const workKey = (m: BookMatch) => `${norm(m.title.split(/[:(]/)[0])}|${norm(m.author).split(' ').pop() ?? ''}`

/**
 * Google first (better relevance, real editions). Open Library adds only
 * works Google didn't return. Google's own editions all stay — picking the
 * Penguin Classics printing over another is the point. A free full text
 * (Gutenberg, or an Open Library public scan) is attached to every row of
 * the same work, so the nice edition still says "Read free"; Gutenberg
 * only gets a row of its own for works nobody else found.
 */
export function mergeResults(googleHits: BookMatch[], olHits: BookMatch[], pgHits: BookMatch[] = []): BookMatch[] {
  const seenCover = new Set<string>()
  const seenWork = new Set(googleHits.map(workKey))
  const out: BookMatch[] = []
  for (const m of [...googleHits, ...olHits.filter((m) => !seenWork.has(workKey(m)))]) {
    if (m.coverUrl && seenCover.has(m.coverUrl)) continue
    if (m.coverUrl) seenCover.add(m.coverUrl)
    out.push({ ...m })
  }
  const free = new Map<string, string>()
  for (const m of [...olHits, ...pgHits]) if (m.readUrl && !free.has(workKey(m))) free.set(workKey(m), m.readUrl)
  for (const m of out) m.readUrl ??= free.get(workKey(m))
  const found = new Set(out.map(workKey))
  for (const m of pgHits) {
    if (found.has(workKey(m))) continue
    found.add(workKey(m))
    out.push(m)
  }
  return out
}

function querySources(text: string, signal?: AbortSignal, withGutenberg = true): Sources {
  const lang = guessLang(text)
  // Background cover lookups skip the speculative home-language pass: an
  // unaccented English title doesn't need a Czech-only Google query.
  const local = lang ?? (withGutenberg ? homeLang() : 'en')
  const open = google(text, signal)
  const restricted = local === 'en' ? null : google(text, signal, local)
  return {
    // A query that is visibly Czech/German ranks that language's editions first.
    google: restricted ? (lang ? [restricted, open] : [open, restricted]) : [open],
    openLibrary: openLibrary({ q: text }, signal, lang ?? 'en'),
    gutenberg: withGutenberg ? gutenberg(text, signal) : undefined,
  }
}

// Same query twice in a session (typing, backspacing, reopening the sheet) is instant.
const cache = new Map<string, BookMatch[]>()

/**
 * Search everything, streaming: onUpdate fires as each catalogue answers,
 * so the first results show in about a second instead of waiting on the
 * slowest source. Resolves with the final merged list.
 */
export async function searchBooks(
  q: string,
  signal?: AbortSignal,
  onUpdate?: (results: BookMatch[], done: boolean) => void,
): Promise<BookMatch[]> {
  const text = q.trim()
  if (!text) return []
  const key = norm(text)
  const hit = cache.get(key)
  if (hit) {
    onUpdate?.(hit, true)
    return hit
  }
  const results = await stream(querySources(text, signal), onUpdate)
  if (!signal?.aborted) {
    cache.set(key, results)
    if (cache.size > 40) cache.delete(cache.keys().next().value!)
  }
  return results
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
  const lang = guessLang(`${title} ${author}`)
  const q = googleFielded(title, author)
  return stream({
    google: lang ? [google(q, signal, lang), google(q, signal)] : [google(q, signal)],
    openLibrary: openLibrary(author.trim() ? { title, author } : { title }, signal, lang ?? 'en'),
  })
}

/** Auto-match a saved book to cover art. Fielded query first, loose one second. */
export async function matchCover(title: string, author: string, signal?: AbortSignal): Promise<BookMatch | null> {
  const hit = bestCoverMatch(title, author, await fieldedBoth(title, author, signal))
  if (hit) return hit
  // Covers only — skip Gutenberg (plain covers, slowest source).
  return bestCoverMatch(title, author, await stream(querySources(`${title} ${author}`, signal, false)))
}

/** Every distinct cover for a book — for the manual "change cover" picker. */
export async function coverChoices(title: string, author: string, signal?: AbortSignal): Promise<BookMatch[]> {
  const hits = await fieldedBoth(title, author, signal)
  const loose = hits.filter((m) => m.coverUrl).length < 4 ? await stream(querySources(`${title} ${author}`, signal, false)).catch(() => []) : []
  return mergeResults(hits, loose).filter((m) => m.coverUrl)
}

/** The longest catalogue description for this exact book, or null. */
export async function describeBook(title: string, author: string, signal?: AbortSignal): Promise<string | null> {
  const lang = guessLang(`${title} ${author}`)
  const q = googleFielded(title, author)
  const passes = await Promise.allSettled(lang ? [google(q, signal, lang), google(q, signal)] : [google(q, signal)])
  if (passes.every((r) => r.status === 'rejected')) throw new Error('Google Books unreachable')
  const hits = concatGoogle(...passes.map((r) => (r.status === 'fulfilled' ? r.value : [])))
  const texts = confidentMatches(title, author, hits)
    .map((m) => m.description ?? '')
    .filter((d) => d.length > 80)
    .sort((a, b) => b.length - a.length)
  return texts[0] ?? null
}

/**
 * A free, legal full text of this exact book, or null. Throws when every
 * source failed (offline) so callers don't record "none" by mistake.
 */
export async function findFreeCopy(title: string, author: string, signal?: AbortSignal): Promise<string | null> {
  const settled = await Promise.allSettled([
    gutenberg(`${title} ${author.split(',')[0]}`.trim(), signal),
    openLibrary(author.trim() ? { title, author } : { title }, signal, guessLang(`${title} ${author}`) ?? 'en'),
  ])
  if (settled.every((r) => r.status === 'rejected')) throw new Error('No catalogue reachable')
  const hits = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  // Gutenberg first: a clean, complete text beats a page scan.
  const sorted = [...hits.filter((m) => m.source === 'gutenberg'), ...hits.filter((m) => m.source !== 'gutenberg')]
  return confidentMatches(title, author, sorted).find((m) => m.readUrl)?.readUrl ?? null
}
