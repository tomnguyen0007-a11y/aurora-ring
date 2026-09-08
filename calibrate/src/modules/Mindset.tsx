import { useMemo, useState } from 'react'
import { Chip, DangerBtn, Empty, InlineArea, InlineText, Page, Scroller, Section, Tools } from '../components/ui'
import { quoteOfDay } from '../lib/quote'
import { useStore } from '../store/store'

export function Mindset({ label }: { label: string }) {
  const s = useStore()
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const daily = useMemo(() => quoteOfDay(s.mantras), [s.mantras])

  const tags = Array.from(new Set(s.mantras.map((m) => m.tag)))
  const shown = filter === 'all' ? s.mantras : s.mantras.filter((m) => m.tag === filter)

  return (
    <Page title={label} lede="The operating philosophy. Jarvis reads these to understand how you think.">
      {daily && (
        <Section label="Signal of the day">
          <blockquote>
            <p className="max-w-2xl text-[1.375rem] leading-[1.35] tracking-[-0.018em] text-paper">{daily.text}</p>
            {daily.author && <footer className="mt-3 text-body text-faint">{daily.author}</footer>}
          </blockquote>
        </Section>
      )}

      <Section label="Capture a principle">
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
          <input className="field min-w-0 flex-1" placeholder="A quote, mantra, or rule…" value={text} onChange={(e) => setText(e.target.value)} />
          <input className="field sm:w-44" placeholder="Attribution" value={author} onChange={(e) => setAuthor(e.target.value)} />
          <button className="btn btn-solid" type="submit">
            Add
          </button>
        </form>
      </Section>

      <Section label={`Library · ${s.mantras.length}`}>
        <Scroller className="mb-5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          {tags.map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
              {t}
            </Chip>
          ))}
        </Scroller>

        {shown.length ? (
          <ul className="grid gap-x-12 sm:grid-cols-2">
            {shown.map((m) => (
              <li key={m.id} className="group border-b border-line py-4">
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    {/* A principle is a sentence, not a label — InlineText is a
                        single-line <input> and physically cannot wrap, which was
                        clipping every long quote mid-word. */}
                    <InlineArea
                      value={m.text}
                      onChange={(v) => s.updateMantra(m.id, { text: v })}
                      ariaLabel="Principle"
                      minRows={1}
                      className="text-body leading-relaxed !text-paper"
                    />
                    <InlineText
                      value={m.author}
                      onChange={(v) => s.updateMantra(m.id, { author: v })}
                      ariaLabel="Attribution"
                      placeholder="—"
                      className="mt-1.5 text-micro text-faint"
                    />
                  </span>
                  <Tools>
                    <DangerBtn onConfirm={() => s.removeMantra(m.id)} label="Delete principle" />
                  </Tools>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing under that filter.</Empty>
        )}
      </Section>
    </Page>
  )
}
