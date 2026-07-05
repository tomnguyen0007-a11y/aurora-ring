import { Globe, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Empty, Panel } from '../components/ui'
import { fetchWorldNews, NEWS_CATEGORIES, type Article, type NewsCategory } from '../lib/market'
import { useStore } from '../store/store'

const CAT_LABEL: Record<NewsCategory, string> = {
  general: 'Top',
  world: 'World',
  nation: 'Local',
  business: 'Business',
  technology: 'Tech',
  science: 'Science',
  health: 'Health',
  sports: 'Sport',
}

const COUNTRIES = [
  ['us', 'US'],
  ['gb', 'UK'],
  ['at', 'Austria'],
  ['de', 'Germany'],
  ['cz', 'Czechia'],
  ['au', 'Australia'],
]

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso)
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60000))}m ago`
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function News() {
  const s = useStore()
  const [cat, setCat] = useState<NewsCategory>('general')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!s.settings.gnewsKey) return
    setLoading(true)
    setErr('')
    try {
      setArticles(await fetchWorldNews(s.settings.gnewsKey, cat, s.settings.newsCountry, submitted))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load news')
    } finally {
      setLoading(false)
    }
  }, [s.settings.gnewsKey, s.settings.newsCountry, cat, submitted])

  useEffect(() => {
    load()
  }, [load])

  const lead = articles[0]
  const rest = articles.slice(1)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="h-lumen text-3xl font-bold tracking-wide">INTELLIGENCE FEED</h1>
          <p className="mt-1 text-sm text-haze">World, politics, business and local — live headlines. Ask Jarvis to brief you on any of it.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="field !py-2"
            value={s.settings.newsCountry}
            onChange={(e) => s.setSettings({ newsCountry: e.target.value })}
            aria-label="Country"
          >
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code} className="bg-panel">
                {name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {!s.settings.gnewsKey ? (
        <Panel>
          <Empty>
            Add a free GNews API key in{' '}
            <button className="text-signal underline-offset-2 hover:underline" onClick={() => s.setView('settings')}>
              Settings
            </button>{' '}
            to unlock the live intelligence feed. Grab one free at gnews.io — 100 requests/day, no card.
          </Empty>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {NEWS_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setCat(c)
                    setQuery('')
                    setSubmitted('')
                  }}
                  className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold tracking-wide transition-all ${
                    cat === c && !submitted ? 'border-signal/50 bg-signal/10 text-signal' : 'border-edge text-haze hover:text-ice'
                  }`}
                >
                  {CAT_LABEL[c]}
                </button>
              ))}
            </div>
            <form
              className="ml-auto flex min-w-[180px] flex-1 gap-2 sm:max-w-xs"
              onSubmit={(e) => {
                e.preventDefault()
                setSubmitted(query)
              }}
            >
              <div className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
                <input
                  className="field w-full !pl-8"
                  placeholder="Search headlines…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </form>
          </div>

          {err && <div className="rounded-xl border border-alert/40 bg-alert/10 px-4 py-2.5 text-sm text-alert">{err}</div>}

          {lead && (
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="block">
              <Panel className="lit overflow-hidden transition-colors hover:border-signal/40">
                <div className="flex flex-col gap-4 sm:flex-row">
                  {lead.image && (
                    <img
                      src={lead.image}
                      alt=""
                      loading="lazy"
                      className="h-44 w-full rounded-xl object-cover sm:h-40 sm:w-64"
                      onError={(e) => ((e.currentTarget.style.display = 'none'))}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="hud-label !mb-1.5 flex items-center gap-2">
                      <Globe size={11} className="text-signal" /> {lead.source} · {timeAgo(lead.publishedAt)}
                    </div>
                    <h2 className="font-display text-xl font-bold leading-tight text-ice">{lead.title}</h2>
                    {lead.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-haze">{lead.description}</p>}
                  </div>
                </div>
              </Panel>
            </a>
          )}

          {rest.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rest.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                  <Panel className="h-full transition-colors hover:border-steel/40">
                    {a.image && (
                      <img
                        src={a.image}
                        alt=""
                        loading="lazy"
                        className="mb-3 h-32 w-full rounded-lg object-cover"
                        onError={(e) => ((e.currentTarget.style.display = 'none'))}
                      />
                    )}
                    <div className="hud-label !mb-1.5 !text-[8px]">
                      {a.source} · {timeAgo(a.publishedAt)}
                    </div>
                    <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-ice">{a.title}</h3>
                  </Panel>
                </a>
              ))}
            </div>
          )}

          {!loading && !articles.length && !err && <Empty>No headlines right now — try another category or refresh.</Empty>}
        </>
      )}
    </div>
  )
}
