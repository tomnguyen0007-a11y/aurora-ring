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
}

/** Market news. Finnhub when a key exists; the Google News business wire when it doesn't. */
export async function fetchMarketNews(key: string): Promise<NewsItem[]> {
  if (key) {
    try {
      const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`)
      if (res.ok) {
        const data: NewsItem[] = await res.json()
        if (Array.isArray(data) && data.length) return data.slice(0, 12)
      }
    } catch {
      /* fall through to the keyless wire */
    }
  }
  const articles = await fetchWorldNews({ topic: 'business', limit: 12 })
  return articles.map((a) => ({
    headline: a.title,
    source: a.source,
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
