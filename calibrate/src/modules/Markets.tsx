import { Flame, Newspaper, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Empty, HudLabel, Panel } from '../components/ui'
import { fetchCrypto, fetchNews, fetchStocks, fetchTrending, searchCoin, type NewsItem, type Trending } from '../lib/market'
import { useStore } from '../store/store'
import type { Quote } from '../store/types'

export function Markets() {
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
        fetchNews(s.settings.finnhubKey).catch(() => []),
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
      const coin = await searchCoin(q)
      if (coin) s.addWatch({ kind: 'crypto', symbol: coin.symbol.toUpperCase(), cgId: coin.id, name: coin.name })
      else setErr(`No coin found for "${q}"`)
    } else {
      s.addWatch({ kind: 'stock', symbol: q.toUpperCase(), name: q.toUpperCase() })
    }
    setAddSym('')
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ice">MARKET INTELLIGENCE</h1>
          <p className="mt-1 text-sm text-haze">
            Crypto is live and free. Stocks + news need a free Finnhub key —{' '}
            <button className="text-signal underline-offset-2 hover:underline" onClick={() => s.setView('settings')}>
              add it in Settings
            </button>
            .
          </p>
        </div>
        <button className="btn" onClick={refresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {err && <div className="rounded-xl border border-alert/40 bg-alert/10 px-4 py-2.5 text-sm text-alert">{err}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <HudLabel>Watchlist</HudLabel>
          <div className="space-y-1.5">
            {s.watchlist.map((w) => {
              const q = quotes[w.id]
              const up = (q?.change24h ?? 0) >= 0
              return (
                <div key={w.id} className="group flex items-center gap-3 rounded-xl bg-black/25 px-3.5 py-2.5">
                  <span
                    className={`hud-label !mb-0 w-14 shrink-0 !text-[9px] ${w.kind === 'crypto' ? 'text-signal-dim' : 'text-steel'}`}
                  >
                    {w.kind === 'crypto' ? 'COIN' : 'STOCK'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="num font-semibold text-ice">{w.symbol}</span>
                    <span className="ml-2 hidden text-xs text-fog sm:inline">{w.name}</span>
                  </div>
                  {q ? (
                    <>
                      <span className="num text-sm text-ice">
                        ${q.price >= 100 ? q.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : q.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </span>
                      <span className={`num flex w-20 items-center justify-end gap-1 text-xs ${up ? 'text-affirm' : 'text-alert'}`}>
                        {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {Math.abs(q.change24h).toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-fog">{w.kind === 'stock' && !s.settings.finnhubKey ? 'needs key' : '…'}</span>
                  )}
                  <button className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Remove ${w.symbol}`} onClick={() => s.removeWatch(w.id)}>
                    <Trash2 size={14} className="text-alert/70" />
                  </button>
                </div>
              )
            })}
          </div>

          <form className="mt-4 flex gap-2 border-t border-edge pt-4" onSubmit={add}>
            <select className="field !py-2" value={addKind} onChange={(e) => setAddKind(e.target.value as 'crypto' | 'stock')} aria-label="Asset type">
              <option value="crypto" className="bg-panel">Crypto</option>
              <option value="stock" className="bg-panel">Stock</option>
            </select>
            <input
              className="field flex-1"
              placeholder={addKind === 'crypto' ? 'bitcoin, sol, link…' : 'Ticker: TSLA, MSFT…'}
              value={addSym}
              onChange={(e) => setAddSym(e.target.value)}
            />
            <button className="btn btn-signal !px-3" type="submit" aria-label="Add to watchlist">
              <Plus size={15} />
            </button>
          </form>
        </Panel>

        <Panel>
          <HudLabel>
            <Flame size={11} className="text-signal" /> Trending Coins
          </HudLabel>
          {trending.length ? (
            <ol className="space-y-1.5">
              {trending.map((t, i) => (
                <li key={t.symbol + i} className="flex items-center gap-3 rounded-lg bg-black/25 px-3 py-2 text-sm">
                  <span className="num w-4 text-xs text-fog">{i + 1}</span>
                  <span className="num font-semibold text-ice">{t.symbol.toUpperCase()}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-haze">{t.name}</span>
                  {t.rank > 0 && <span className="num text-[10px] text-fog">#{t.rank}</span>}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Loading trend data…</Empty>
          )}
        </Panel>

        <Panel className="lg:col-span-3">
          <HudLabel>
            <Newspaper size={11} className="text-steel" /> Market News
          </HudLabel>
          {news.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {news.map((nItem, i) => (
                <a
                  key={i}
                  href={nItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-edge bg-black/25 px-3.5 py-3 transition-colors hover:border-steel/40"
                >
                  <div className="line-clamp-2 text-sm font-medium leading-snug text-ice">{nItem.headline}</div>
                  <div className="mt-1.5 flex justify-between text-[11px] text-fog">
                    <span>{nItem.source}</span>
                    <span className="num">{new Date(nItem.datetime * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <Empty>
              {s.settings.finnhubKey
                ? 'No news loaded — hit refresh.'
                : 'Add a free Finnhub API key in Settings to unlock stock quotes + market news (finnhub.io, free tier).'}
            </Empty>
          )}
        </Panel>
      </div>
    </div>
  )
}
