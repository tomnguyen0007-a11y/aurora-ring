import type { Quote, WatchItem } from '../store/types'
import { fetchFeed, googleNewsUrl } from './search'

// ── Crypto: CoinGecko public API — free, no key, CORS-enabled. ──
export async function fetchCrypto(items: WatchItem[]): Promise<Record<string, Quote>> {
  const ids = items.filter((w) => w.kind === 'crypto' && w.cgId).map((w) => w.cgId!)
  if (!ids.length) return {}
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`,
  )
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const data: Record<string, { usd: number; usd_24h_change?: number }> = await res.json()
  const out: Record<string, Quote> = {}
  for (const w of items) {
    if (w.kind === 'crypto' && w.cgId && data[w.cgId]) {
      out[w.id] = { price: data[w.cgId].usd, change24h: data[w.cgId].usd_24h_change ?? 0, ts: Date.now() }
    }
  }
  return out
}

// ── Stocks: Finnhub — free tier, needs the user's key. ──
export async function fetchStocks(items: WatchItem[], key: string): Promise<Record<string, Quote>> {
  const stocks = items.filter((w) => w.kind === 'stock')
  if (!stocks.length || !key) return {}
  const out: Record<string, Quote> = {}
  await Promise.all(
    stocks.map(async (w) => {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(w.symbol)}&token=${key}`)
        if (!res.ok) return
        const q: { c: number; dp: number } = await res.json()
        if (q.c) out[w.id] = { price: q.c, change24h: q.dp ?? 0, ts: Date.now() }
      } catch {
        /* one bad symbol shouldn't sink the batch */
      }
    }),
  )
  return out
}

export interface NewsItem {
  headline: string
  source: string
  url: string
  datetime: number
  image: string | null
}

/** Market news. Finnhub when a key exists; the Google News business wire when it doesn't. */
export async function fetchMarketNews(key: string): Promise<NewsItem[]> {
  if (key) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`)
      if (res.ok) {
        const data: (NewsItem & { image?: string })[] = await res.json()
        if (Array.isArray(data) && data.length)
          return data.slice(0, 12).map((n) => ({ ...n, image: n.image || null }))
      }
    } catch {
      /* fall through to the keyless wire */
    }
  }
  const articles = await fetchWorldNews({ topic: 'business', limit: 12 })
  return articles.map((a) => ({
    headline: a.title,
    source: a.source,
    image: a.image,
    url: a.url,
    datetime: Math.floor(Date.parse(a.publishedAt || '') / 1000) || Math.floor(Date.now() / 1000),
  }))
}

// ════════════════════════════════════════════════════════════════════
// WORLD NEWS
//
// The old path went GNews → corsproxy.io. That proxy now answers 401 to
// anonymous traffic, which is why the feed died silently. This one needs
// no key at all: Google News RSS through a CORS-enabled JSON converter,
// with GNews kept only as an optional upgrade when a key is present.
// ════════════════════════════════════════════════════════════════════

export interface Article {
  title: string
  description: string
  url: string
  image: string | null
  source: string
  publishedAt: string
}

export const NEWS_TOPICS = [
  { id: 'top', label: 'Top' },
  { id: 'world', label: 'World' },
  { id: 'nation', label: 'National' },
  { id: 'business', label: 'Business' },
  { id: 'technology', label: 'Tech' },
  { id: 'science', label: 'Science' },
  { id: 'health', label: 'Health' },
  { id: 'sports', label: 'Sport' },
] as const

export type NewsTopic = (typeof NEWS_TOPICS)[number]['id']

/** Country → the language Google News expects for that edition. */
export const NEWS_REGIONS: { code: string; lang: string; label: string }[] = [
  { code: 'US', lang: 'en', label: 'United States' },
  { code: 'GB', lang: 'en', label: 'United Kingdom' },
  { code: 'AT', lang: 'de', label: 'Austria' },
  { code: 'DE', lang: 'de', label: 'Germany' },
  { code: 'CZ', lang: 'cs', label: 'Czechia' },
  { code: 'AU', lang: 'en', label: 'Australia' },
  { code: 'IE', lang: 'en', label: 'Ireland' },
  { code: 'CA', lang: 'en', label: 'Canada' },
]

/**
 * Publisher feeds carry <media:thumbnail> and a real summary; Google News
 * carries neither — its <description> is a list of related links and it never
 * ships an image. So a topic wire is built from publishers where a good one
 * exists, and falls back to Google News for national editions, non-English
 * regions and free-text search, which publishers cannot serve.
 *
 * Every feed below was checked for image coverage before being listed
 * (Al Jazeera, CNBC and The Verge all return 0/10 through the converter and
 * are deliberately absent).
 */
const TOPIC_FEEDS: Partial<Record<NewsTopic, string[]>> = {
  top: ['https://feeds.bbci.co.uk/news/rss.xml', 'https://feeds.skynews.com/feeds/rss/world.xml'],
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.theguardian.com/world/rss',
    'https://feeds.skynews.com/feeds/rss/world.xml',
  ],
  business: ['https://feeds.bbci.co.uk/news/business/rss.xml', 'https://feeds.skynews.com/feeds/rss/business.xml'],
  technology: ['https://feeds.bbci.co.uk/news/technology/rss.xml', 'https://feeds.arstechnica.com/arstechnica/index'],
  science: ['https://feeds.bbci.co.uk/news/science_and_environment/rss.xml'],
  health: ['https://feeds.bbci.co.uk/news/health/rss.xml'],
  sports: ['https://feeds.bbci.co.uk/sport/rss.xml'],
}

/** BBC serves the size in the path; the feed hands out 240px, the page wants more. */
function upscale(url: string): string {
  return url.replace(/\/standard\/\d+\//, '/standard/976/')
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Round-robin the publishers so one outlet cannot own the whole page. */
function interleave(lists: Article[][], limit: number): Article[] {
  const out: Article[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < limit; i++) {
    let advanced = false
    for (const list of lists) {
      const a = list[i]
      if (!a) continue
      advanced = true
      const key = a.title.toLowerCase().slice(0, 60)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(a)
      if (out.length >= limit) break
    }
    if (!advanced) break
  }
  return out
}

async function fetchPublisher(feed: string, limit: number): Promise<Article[]> {
  const data = await fetchFeed(feed)
  return (data.items ?? []).slice(0, limit).map((it) => {
    const raw = it.thumbnail || it.enclosure?.link || null
    return {
      title: (it.title ?? '').trim(),
      description: stripTags(it.description ?? '').slice(0, 240),
      url: it.link ?? '',
      image: raw ? upscale(raw) : null,
      source: data.feed?.title ?? it.author ?? '',
      publishedAt: it.pubDate ?? '',
    }
  })
}

/** Google News titles come through as "Headline - Publisher". */
function splitHeadline(raw: string): { title: string; source: string } {
  const idx = raw.lastIndexOf(' - ')
  if (idx > 20 && raw.length - idx < 48) return { title: raw.slice(0, idx).trim(), source: raw.slice(idx + 3).trim() }
  return { title: raw.trim(), source: '' }
}

export async function fetchWorldNews(opts: {
  topic?: NewsTopic
  query?: string
  country?: string
  lang?: string
  gnewsKey?: string
  limit?: number
}): Promise<Article[]> {
  const limit = opts.limit ?? 14

  // Publisher wire first: it is the only path that returns pictures and a real
  // summary. But it is a fixed set of English/UK outlets, so it only stands in
  // for the *default* edition — free-text search, and any region other than
  // the default US/English one (Czechia, Germany, Austria...), fall through to
  // Google News below, which is the only path that actually respects country
  // and language. Regression note: this used to ignore `country` entirely and
  // silently served the same global English wire to every region, which is
  // why "National" for Czechia stopped showing Czech news.
  const isDefaultRegion = !opts.country || opts.country.toUpperCase() === 'US'
  const feeds = opts.query?.trim() || !isDefaultRegion ? undefined : TOPIC_FEEDS[opts.topic ?? 'top']
  if (feeds?.length) {
    try {
      const lists = await Promise.all(
        feeds.map((f) => fetchPublisher(f, limit).catch(() => [] as Article[])),
      )
      const merged = interleave(lists, limit)
      if (merged.length) return merged
    } catch {
      /* fall through to the keyless Google wire */
    }
  }

  // Optional upgrade path: a GNews key buys images and descriptions.
  if (opts.gnewsKey) {
    try {
      const base = opts.query?.trim()
        ? `https://gnews.io/api/v4/search?q=${encodeURIComponent(opts.query.trim())}&lang=${opts.lang ?? 'en'}&max=${limit}&sortby=publishedAt`
        : `https://gnews.io/api/v4/top-headlines?category=${opts.topic === 'top' ? 'general' : (opts.topic ?? 'general')}&lang=${
            opts.lang ?? 'en'
          }&country=${(opts.country ?? 'us').toLowerCase()}&max=${limit}`
      const res = await fetch(`${base}&apikey=${opts.gnewsKey}`)
      if (res.ok) {
        const data: {
          articles?: { title: string; description: string; url: string; image: string; publishedAt: string; source: { name: string } }[]
        } = await res.json()
        if (data.articles?.length) {
          return data.articles.map((a) => ({
            title: a.title,
            description: a.description ?? '',
            url: a.url,
            image: a.image || null,
            source: a.source?.name ?? '',
            publishedAt: a.publishedAt,
          }))
        }
      }
    } catch {
      /* the keyless wire below always works — use it */
    }
  }

  const feed = googleNewsUrl({
    topic: opts.query ? undefined : (opts.topic ?? 'top'),
    query: opts.query,
    lang: opts.lang ?? 'en',
    country: opts.country ?? 'US',
  })
  const data = await fetchFeed(feed)
  return (data.items ?? []).slice(0, limit).map((it) => {
    const { title, source } = splitHeadline(it.title ?? '')
    return {
      title,
      // Google News puts an <ol> of *related* headlines in <description>, so the
      // text is link-soup that reads as a garbled repeat of the title. Only the
      // keyed GNews path above returns a real summary.
      description: '',
      url: it.link ?? '',
      image: it.thumbnail || it.enclosure?.link || null,
      source: source || it.author || 'Google News',
      publishedAt: it.pubDate ?? '',
    }
  })
}

// ── Trending coins — CoinGecko, free, no key. ──
export interface Trending {
  name: string
  symbol: string
  rank: number
}

export async function fetchTrending(): Promise<Trending[]> {
  const res = await fetch('https://api.coingecko.com/api/v3/search/trending')
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  const data: { coins: { item: { name: string; symbol: string; market_cap_rank: number } }[] } = await res.json()
  return data.coins.slice(0, 7).map((c) => ({ name: c.item.name, symbol: c.item.symbol, rank: c.item.market_cap_rank }))
}

export async function searchCoin(query: string): Promise<{ id: string; symbol: string; name: string } | null> {
  const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
  if (!res.ok) return null
  const data: { coins: { id: string; symbol: string; name: string }[] } = await res.json()
  return data.coins[0] ?? null
}
