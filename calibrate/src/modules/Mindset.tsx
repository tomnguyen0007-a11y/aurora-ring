import { Plus, Quote as QuoteIcon, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { HudLabel, Panel } from '../components/ui'
import { quoteOfDay } from '../lib/quote'
import { useStore } from '../store/store'
import type { Mantra } from '../store/types'

const TAG_LABEL: Record<Mantra['tag'], string> = {
  mindset: 'Mindset',
  wealth: 'Wealth',
  discipline: 'Discipline',
  stoic: 'Stoic',
  love: 'Love',
  custom: 'Yours',
}
const TAG_COLOR: Record<Mantra['tag'], string> = {
  mindset: '#58c7f0',
  wealth: '#ff7e47',
  discipline: '#ef6a54',
  stoic: '#8fc4e6',
  love: '#c9a3d4',
  custom: '#55e0a3',
}

export function Mindset() {
  const s = useStore()
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [filter, setFilter] = useState<Mantra['tag'] | 'all'>('all')
  const daily = useMemo(() => quoteOfDay(s.mantras), [s.mantras])

  const tags = Array.from(new Set(s.mantras.map((m) => m.tag)))
  const shown = filter === 'all' ? s.mantras : s.mantras.filter((m) => m.tag === filter)

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="h-lumen text-3xl font-bold tracking-wide">MINDSET</h1>
        <p className="mt-1 text-sm text-haze">Your operating philosophy. The words you return to. Jarvis reads these to understand you.</p>
      </header>

      {/* Quote of the day — hero */}
      {daily && (
        <Panel className="lit relative overflow-hidden">
          <div className="absolute -right-4 -top-6 opacity-[0.06]">
            <QuoteIcon size={140} strokeWidth={1} />
          </div>
          <HudLabel>
            <span className="text-arc">◆</span> Signal of the Day
          </HudLabel>
          <blockquote className="relative">
            <p className="h-lumen text-xl font-semibold leading-snug sm:text-2xl">{daily.text}</p>
            {daily.author && <footer className="mt-3 text-sm text-signal">— {daily.author}</footer>}
          </blockquote>
        </Panel>
      )}

      {/* Add */}
      <Panel>
        <HudLabel>Capture a Principle</HudLabel>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            s.addMantra(text.trim(), author.trim())
            setText('')
            setAuthor('')
          }}
        >
          <input className="field flex-1" placeholder="A quote, mantra, or principle…" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="field sm:w-40" placeholder="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <button className="btn btn-signal" type="submit">
            <Plus size={15} /> Add
          </button>
        </form>
      </Panel>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold tracking-wide transition-all ${
            filter === 'all' ? 'border-lumen/40 bg-white/10 text-lumen' : 'border-edge text-haze hover:text-ice'
          }`}
        >
          All ({s.mantras.length})
        </button>
        {tags.map((tg) => (
          <button
            key={tg}
            onClick={() => setFilter(tg)}
            className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold tracking-wide transition-all ${
              filter === tg ? 'border-transparent text-black' : 'border-edge text-haze hover:text-ice'
            }`}
            style={filter === tg ? { background: TAG_COLOR[tg] } : {}}
          >
            {TAG_LABEL[tg]}
          </button>
        ))}
      </div>

      {/* Library */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shown.map((m) => (
          <div key={m.id} className="group glass animate-rise rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <span
                className="hud-label !mb-0 shrink-0 !text-[8px]"
                style={{ color: TAG_COLOR[m.tag] }}
              >
                {TAG_LABEL[m.tag]}
              </span>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Delete principle"
                onClick={() => s.removeMantra(m.id)}
              >
                <Trash2 size={13} className="text-alert/70" />
              </button>
            </div>
            <p className="mt-2 text-[0.95rem] font-medium leading-relaxed text-ice">{m.text}</p>
            {m.author && <p className="mt-2 text-xs text-fog">— {m.author}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
