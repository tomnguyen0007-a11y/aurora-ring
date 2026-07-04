import type { Quote, WatchItem } from '../store/types'

// Crypto: CoinGecko public API — free, no key, CORS-enabled.
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

// Stocks: Finnhub — free tier, needs user's key (Settings).
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
        // ignore individual symbol failures
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

// Market news via Finnhub (free key) — general category.
export async function fetchNews(key: string): Promise<NewsItem[]> {
  if (!key) return []
  const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)
  const data: NewsItem[] = await res.json()
  return data.slice(0, 12)
}

// Trending coins — CoinGecko, free, no key.
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

/** Find a CoinGecko id for a symbol/name so users can add any coin. */
export async function searchCoin(query: string): Promise<{ id: string; symbol: string; name: string } | null> {
  const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
  if (!res.ok) return null
  const data: { coins: { id: string; symbol: string; name: string }[] } = await res.json()
  return data.coins[0] ?? null
}
