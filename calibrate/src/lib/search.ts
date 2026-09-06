// ════════════════════════════════════════════════════════════════════
// WEB SEARCH — works from a static origin, with no API key and no backend.
//
// Anthropic and Gemini ship server-side search tools; Groq and OpenRouter
// don't. This module is the equaliser: every provider gets the same
// `web_search` tool, backed by sources that actually send CORS headers.
//
//   · Google News RSS  → current events, prices, launches, anything dated
//   · Wikipedia REST   → stable facts, entities, definitions
//   · DuckDuckGo IA    → instant answers where they exist
//
// Everything returns a uniform result shape so the agent can cite it.
// ════════════════════════════════════════════════════════════════════

export interface SearchResult {
  title: string
  snippet: string
  url: string
  source: string
  date?: string
}

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url='

/** Strip the HTML that RSS descriptions are full of. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Rss2JsonItem {
  title?: string
  link?: string
  pubDate?: string
  description?: string
  content?: string
  author?: string
  thumbnail?: string
  enclosure?: { link?: string }
}

interface Rss2JsonResponse {
  status?: string
  message?: string
  feed?: { title?: string }
  items?: Rss2JsonItem[]
}

/** Fetch any RSS/Atom feed as JSON through a CORS-enabled converter. */
export async function fetchFeed(feedUrl: string, signal?: AbortSignal): Promise<Rss2JsonResponse> {
  const res = await fetch(`${RSS2JSON}${encodeURIComponent(feedUrl)}`, { signal })
  if (!res.ok) throw new Error(`Feed relay ${res.status}`)
  const data = (await res.json()) as Rss2JsonResponse
  if (data.status && data.status !== 'ok') throw new Error(data.message || 'Feed unavailable')
  return data
}

/** Build a Google News RSS URL for a locale. */
export function googleNewsUrl(opts: { topic?: string; query?: string; lang?: string; country?: string }): string {
  const lang = opts.lang || 'en'
  const country = (opts.country || 'US').toUpperCase()
  const ceid = `${country}:${lang}`
  const locale = `hl=${lang}-${country}&gl=${country}&ceid=${encodeURIComponent(ceid)}`
  if (opts.query) return `https://news.google.com/rss/search?q=${encodeURIComponent(opts.query)}&${locale}`
  if (opts.topic && opts.topic !== 'top')
    return `https://news.google.com/rss/headlines/section/topic/${opts.topic.toUpperCase()}?${locale}`
  return `https://news.google.com/rss?${locale}`
}

/** Google News titles arrive as "Headline - Publisher". Split them. */
function splitHeadline(raw: string): { title: string; source: string } {
  const idx = raw.lastIndexOf(' - ')
  if (idx > 20 && raw.length - idx < 48) return { title: raw.slice(0, idx).trim(), source: raw.slice(idx + 3).trim() }
  return { title: raw.trim(), source: '' }
}

export async function searchNews(query: string, limit = 6, signal?: AbortSignal): Promise<SearchResult[]> {
  const data = await fetchFeed(googleNewsUrl({ query }), signal)
  return (data.items ?? []).slice(0, limit).map((it) => {
    const { title, source } = splitHeadline(it.title ?? '')
    return {
      title,
      snippet: stripHtml(it.description ?? it.content ?? '').slice(0, 260),
      url: it.link ?? '',
      source: source || 'Google News',
      date: it.pubDate,
    }
  })
}

interface WikiSearchResponse {
  query?: { search?: { title: string; snippet: string }[] }
}
interface WikiSummary {
  title?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
}

export async function searchWikipedia(query: string, limit = 2, signal?: AbortSignal): Promise<SearchResult[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&srlimit=${limit}&format=json&origin=*`
  const res = await fetch(url, { signal })
  if (!res.ok) return []
  const data = (await res.json()) as WikiSearchResponse
  const titles = (data.query?.search ?? []).map((s) => s.title)

  const summaries = await Promise.all(
    titles.map(async (t) => {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`, { signal })
        if (!r.ok) return null
        const s = (await r.json()) as WikiSummary
        if (!s.extract) return null
        return {
          title: s.title ?? t,
          snippet: s.extract.slice(0, 420),
          url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(t)}`,
          source: 'Wikipedia',
        } satisfies SearchResult
      } catch {
        return null
      }
    }),
  )
  return summaries.filter((x): x is SearchResult => x !== null)
}

interface DdgResponse {
  AbstractText?: string
  AbstractURL?: string
  Heading?: string
  AbstractSource?: string
  Answer?: string
  AnswerType?: string
}

export async function searchInstant(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal },
    )
    if (!res.ok) return []
    const d = (await res.json()) as DdgResponse
    const out: SearchResult[] = []
    if (d.Answer) out.push({ title: d.AnswerType || 'Instant answer', snippet: String(d.Answer), url: '', source: 'DuckDuckGo' })
    if (d.AbstractText)
      out.push({
        title: d.Heading || query,
        snippet: d.AbstractText,
        url: d.AbstractURL ?? '',
        source: d.AbstractSource || 'DuckDuckGo',
      })
    return out
  } catch {
    return []
  }
}

/** Does this query smell like it needs today's world rather than an encyclopedia? */
function isTimely(q: string): boolean {
  return /\b(today|now|latest|current|news|price|stock|score|202\d|this week|right now|update|release[ds]?|announce)/i.test(q)
}

/**
 * The tool the agent actually calls. Runs the right sources in parallel,
 * merges, dedupes and truncates. Never throws — an empty array is a valid
 * answer and the model is told to say so rather than invent one.
 */
export async function webSearch(query: string, limit = 6): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  const signal = controller.signal

  try {
    const timely = isTimely(q)
    const jobs: Promise<SearchResult[]>[] = [
      searchNews(q, timely ? limit : 3, signal).catch(() => []),
      searchInstant(q, signal).catch(() => []),
    ]
    if (!timely) jobs.push(searchWikipedia(q, 2, signal).catch(() => []))

    const settled = await Promise.all(jobs)
    const seen = new Set<string>()
    const merged: SearchResult[] = []
    // Instant answers first when they exist, then news, then reference.
    for (const list of [settled[1], settled[0], settled[2] ?? []]) {
      for (const r of list) {
        const key = (r.url || r.title).toLowerCase()
        if (seen.has(key) || !r.title) continue
        seen.add(key)
        merged.push(r)
      }
    }
    return merged.slice(0, limit)
  } finally {
    clearTimeout(timeout)
  }
}

/** Compact plain-text rendering for injection into a model's tool result. */
export function formatResults(results: SearchResult[]): string {
  if (!results.length) return 'No results found. Say so plainly rather than guessing.'
  return results
    .map((r, i) => {
      const when = r.date ? ` (${new Date(r.date).toISOString().slice(0, 10)})` : ''
      return `[${i + 1}] ${r.title} — ${r.source}${when}\n${r.snippet}${r.url ? `\n${r.url}` : ''}`
    })
    .join('\n\n')
}
