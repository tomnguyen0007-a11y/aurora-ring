import { useCallback, useEffect, useState } from 'react'
import { Chip, Empty, Eyebrow, Page, Scroller, Section } from '../components/ui'
import { fetchWorldNews, NEWS_REGIONS, NEWS_TOPICS, type Article, type NewsTopic } from '../lib/market'
import { useStore } from '../store/store'

function timeAgo(iso: string): string {
  const ts = Date.parse(iso)
  if (isNaN(ts)) return ''
  const diff = Date.now() - ts
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60000))}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/**
 * The wire. Keyless by default: Google News RSS through a CORS-enabled
 * converter, so it works on a static host with nothing configured.
 */
export function News({ label }: { label: string }) {
  const s = useStore()
  const [topic, setTopic] = useState<NewsTopic>('top')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const region = NEWS_REGIONS.find((r) => r.code.toLowerCase() === (s.settings.newsCountry || 'us').toLowerCase()) ?? NEWS_REGIONS[0]

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      setArticles(
        await fetchWorldNews({
          topic,
          query: submitted || undefined,
          country: region.code,
          lang: region.lang,
          gnewsKey: s.settings.gnewsKey || undefined,
        }),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not reach the wire.')
    } finally {
      setLoading(false)
    }
  }, [topic, submitted, region.code, region.lang, s.settings.gnewsKey])

  useEffect(() => {
    load()
  }, [load])

  const lead = articles[0]
  const rest = articles.slice(1)

  return (
    <Page
      title={label}
      lede="World, business and local wire. Ask Jarvis to brief you on anything here."
      actions={
        <>
          <select className="field" value={region.code} onChange={(e) => s.setSettings({ newsCountry: e.target.value })} aria-label="Region">
            {NEWS_REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </>
      }
    >
      <Section>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Scroller className="min-w-0 flex-1">
            {NEWS_TOPICS.map((c) => (
              <Chip
                key={c.id}
                active={topic === c.id && !submitted}
                onClick={() => {
                  setTopic(c.id)
                  setQuery('')
                  setSubmitted('')
                }}
              >
                {c.label}
              </Chip>
            ))}
          </Scroller>
          <form
            className="flex min-w-[200px] gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setSubmitted(query)
            }}
          >
            <input className="field min-w-0 flex-1" placeholder="Search the wire…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search headlines" />
            {submitted && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setQuery('')
                  setSubmitted('')
                }}
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </Section>

      {err && (
        <Section>
          <p className="text-body text-mute">{err}</p>
        </Section>
      )}

      {lead && (
        <Section label={submitted ? `Results for “${submitted}”` : 'Lead'}>
          <a href={lead.url} target="_blank" rel="noopener noreferrer" className="group block max-w-3xl">
            <h2 className="text-[1.75rem] leading-[1.15] tracking-[-0.022em] text-paper">{lead.title}</h2>
            {lead.description && <p className="mt-3 text-body leading-relaxed text-mute">{lead.description}</p>}
            <span className="mt-4 flex items-baseline gap-3">
              <Eyebrow>{lead.source}</Eyebrow>
              <span className="num text-micro text-ghost">{timeAgo(lead.publishedAt)}</span>
            </span>
          </a>
        </Section>
      )}

      {rest.length > 0 && (
        <Section label="Wire">
          <ul className="grid gap-x-14 lg:grid-cols-2">
            {rest.map((a, i) => (
              <li key={i} className="border-b border-line py-3.5">
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="group block">
                  <span className="block text-body leading-snug text-mute transition-colors group-hover:text-paper">{a.title}</span>
                  <span className="mt-2 flex items-baseline gap-3">
                    <Eyebrow>{a.source}</Eyebrow>
                    <span className="num text-micro text-ghost">{timeAgo(a.publishedAt)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!loading && !articles.length && !err && (
        <Section>
          <Empty>Nothing on the wire right now — try another topic or refresh.</Empty>
        </Section>
      )}
    </Page>
  )
}
