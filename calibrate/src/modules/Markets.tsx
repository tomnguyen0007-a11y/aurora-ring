import { useCallback, useEffect, useState } from 'react'
import { DangerBtn, Empty, Eyebrow, Page, Section, Tools } from '../components/ui'
import { fetchCrypto, fetchMarketNews, fetchStocks, fetchTrending, type NewsItem, type Trending } from '../lib/market'
import { useStore } from '../store/store'
import type { Quote } from '../store/types'

export function Markets({ label }: { label: string }) {
  const s = useStore()
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [news, setNews] = useState<NewsItem[]>([])
  const [trending, setTrending] = useState<Trending[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [addKind, setAddKind] = useState<'crypto' | 'stock'>('crypto')
  const [addSym, setAddSym] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [c, st, tr, nw] = await Promise.all([
        fetchCrypto(s.watchlist).catch(() => ({})),
        fetchStocks(s.watchlist, s.settings.finnhubKey).catch(() => ({})),
        fetchTrending().catch(() => []),
        fetchMarketNews(s.settings.finnhubKey).catch(() => []),
      ])
      setQuotes({ ...c, ...st })
      setTrending(tr)
      setNews(nw)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.watchlist, s.settings.finnhubKey])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 90_000)
    return () => clearInterval(t)
  }, [refresh])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = addSym.trim()
    if (!q) return
    if (addKind === 'crypto') {
      const { searchCoin } = await import('../lib/market')
      const coin = await searchCoin(q)
      if (coin) s.addWatch({ kind: 'crypto', symbol: coin.symbol.toUpperCase(), cgId: coin.id, name: coin.name })
      else setErr(`No coin found for "${q}"`)
    } else {
      s.addWatch({ kind: 'stock', symbol: q.toUpperCase(), name: q.toUpperCase() })
    }
    setAddSym('')
  }

  return (
    <Page
      title={label}
      lede="Crypto is live and keyless. Stocks need a free Finnhub key in Settings."
      actions={
        <button className="btn" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {err && <p className="text-body text-mute">{err}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
        <Section label="Watchlist">
          <ul>
            {s.watchlist.map((w) => {
              const q = quotes[w.id]
              const up = (q?.change24h ?? 0) >= 0
              return (
                <li key={w.id} className="group flex items-center gap-4 border-b border-line py-3 last:border-b-0">
                  <span className="eyebrow w-12 shrink-0">{w.kind === 'crypto' ? 'Coin' : 'Stock'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="num text-body text-paper">{w.symbol}</span>
                    <span className="ml-2.5 hidden text-micro text-faint sm:inline">{w.name}</span>
                  </span>
                  {q ? (
                    <>
                      <span className="num shrink-0 text-body text-paper">
                        $
                        {q.price >= 100
                          ? q.price.toLocaleString('en-US', { maximumFractionDigits: 0 })
                          : q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </span>
                      <span className={`num w-20 shrink-0 text-right text-body ${up ? 'text-paper' : 'text-dim'}`}>
                        {up ? '+' : '−'}
                        {Math.abs(q.change24h).toFixed(2)}%
                      </span>
                    </>
                  ) : w.kind === 'stock' && !s.settings.finnhubKey ? (
                    <button
                      type="button"
                      onClick={() => s.setView('settings')}
                      className="shrink-0 text-micro text-faint underline underline-offset-2 transition-colors hover:text-paper"
                      title="Stock quotes need a free Finnhub key — opens Settings"
                    >
                      Add key
                    </button>
                  ) : (
                    <span className="text-micro text-faint">…</span>
                  )}
                  <Tools>
                    <DangerBtn onConfirm={() => s.removeWatch(w.id)} label={`Remove ${w.symbol}`} />
                  </Tools>
                </li>
              )
            })}
          </ul>

          <form className="mt-5 flex gap-2 border-t border-line pt-5" onSubmit={add}>
            <select className="field" value={addKind} onChange={(e) => setAddKind(e.target.value as 'crypto' | 'stock')} aria-label="Asset type">
              <option value="crypto">Crypto</option>
              <option value="stock">Stock</option>
            </select>
            <input
              className="field min-w-0 flex-1"
              placeholder={addKind === 'crypto' ? 'bitcoin, sol, link…' : 'TSLA, MSFT…'}
              value={addSym}
              onChange={(e) => setAddSym(e.target.value)}
              aria-label="Symbol"
            />
            <button className="btn btn-solid" type="submit">
              Watch
            </button>
          </form>
        </Section>

        <Section label="Trending">
          {trending.length ? (
            <ol>
              {trending.map((t, i) => (
                <li key={t.symbol + i} className="flex items-baseline gap-3 border-b border-line py-2.5 last:border-b-0">
                  <span className="num w-4 shrink-0 text-micro text-ghost">{i + 1}</span>
                  <span className="num shrink-0 text-body text-paper">{t.symbol.toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-micro text-faint">{t.name}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>
      </div>

      <Section label="Market wire">
        {news.length ? (
          <ul>
            {news.map((n, i) => (
              <li key={i} className="border-b border-line py-3 last:border-b-0">
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-4">
                  <span className="min-w-0 flex-1"><span className="block text-body leading-snug text-mute transition-colors group-hover:text-paper">{n.headline}</span>
                  <span className="mt-1.5 flex items-baseline gap-2">
                    <Eyebrow>{n.source}</Eyebrow>
                    <span className="num text-micro text-ghost">
                      {new Date(n.datetime * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  </span>
                  {n.image && (
                    <img
                      src={n.image}
                      alt=""
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      className="h-14 w-14 shrink-0 border border-line object-cover"
                    />
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Wire is quiet — hit refresh.</Empty>
        )}
      </Section>
    </Page>
  )
}
