import { useState } from 'react'
import { Icon } from '../components/icons'
import { Chip, DangerBtn, Empty, Eyebrow, InlineText, Page, Scroller, Section, Sheet, Tools } from '../components/ui'
import { toMinutes, WEEKDAY_NAMES, weekdayOf } from '../lib/dates'
import { DAY_CODENAMES } from '../store/seed'
import { useStore } from '../store/store'
import type { Weekday } from '../store/types'

export function Schedule({ label }: { label: string }) {
  const s = useStore()
  const [day, setDay] = useState<Weekday>(weekdayOf())
  const [tagsOpen, setTagsOpen] = useState(false)
  const blocks = s.schedule.filter((b) => b.weekday === day).sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  return (
    <Page
      title={label}
      lede="The operating week. Edit a block by typing straight into it, or tell Jarvis to move things around."
      actions={
        <button className="btn" onClick={() => setTagsOpen(true)}>
          Tags
        </button>
      }
    >
      <Section label="Week">
        <Scroller>
          {WEEKDAY_NAMES.map((name, i) => (
            <Chip key={name} active={day === i} onClick={() => setDay(i as Weekday)}>
              {name.slice(0, 3)}
              <span className={`ml-2 ${day === i ? 'text-black/50' : 'text-ghost'}`}>{s.schedule.filter((b) => b.weekday === i).length}</span>
            </Chip>
          ))}
        </Scroller>
      </Section>

      <Section
        label={`${WEEKDAY_NAMES[day]} — ${DAY_CODENAMES[day]}`}
        aside={
          <button
            className="btn btn-sm"
            onClick={() =>
              s.addBlock({ weekday: day, start: '09:00', end: '10:00', title: 'New block', detail: '', tag: s.blockTags[0]?.id ?? 'study' })
            }
          >
            <Icon name="plus" size={12} /> Block
          </button>
        }
      >
        {blocks.length ? (
          <ol>
            {blocks.map((b) => (
              <li key={b.id} className="group border-b border-line py-3 last:border-b-0">
                <div className="flex items-start gap-4">
                  <span className="mt-1 block h-9 w-px shrink-0 bg-line-2" />
                  {/* A native <input type="time"> has a browser-drawn minimum
                      width (the HH:MM segments plus a clock affordance) that
                      CSS width cannot shrink below — at w-16 (64px) the UA was
                      clipping the last character instead of shrinking. */}
                  <span className="flex w-24 shrink-0 flex-col gap-0.5">
                    <input
                      type="time"
                      className="field-line num w-full text-micro text-paper"
                      value={b.start}
                      aria-label="Start time"
                      onChange={(e) => s.updateBlock(b.id, { start: e.target.value })}
                    />
                    <input
                      type="time"
                      className="field-line num w-full text-micro text-faint"
                      value={b.end}
                      aria-label="End time"
                      onChange={(e) => s.updateBlock(b.id, { end: e.target.value })}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <InlineText value={b.title} onChange={(v) => s.updateBlock(b.id, { title: v })} ariaLabel="Block title" className="t-head" />
                    <InlineText
                      value={b.detail ?? ''}
                      onChange={(v) => s.updateBlock(b.id, { detail: v })}
                      ariaLabel="Block detail"
                      placeholder="Detail…"
                      className="mt-1 text-micro text-faint"
                    />
                  </span>
                  <select
                    className="field !py-1 hidden shrink-0 text-micro sm:block"
                    value={b.tag}
                    aria-label="Tag"
                    onChange={(e) => s.updateBlock(b.id, { tag: e.target.value })}
                  >
                    {s.blockTags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Tools>
                    <select
                      className="field !py-1 text-micro"
                      value=""
                      aria-label="Copy to day"
                      onChange={(e) => {
                        if (e.target.value !== '') s.duplicateBlockToDay(b.id, Number(e.target.value) as Weekday)
                        e.target.value = ''
                      }}
                    >
                      <option value="">Copy to…</option>
                      {WEEKDAY_NAMES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <DangerBtn onConfirm={() => s.removeBlock(b.id)} label={`Delete ${b.title}`} />
                  </Tools>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty>Nothing on {WEEKDAY_NAMES[day]}. Add a block, or copy one over from another day.</Empty>
        )}
      </Section>

      <Sheet open={tagsOpen} onClose={() => setTagsOpen(false)} title="Block tags">
        <p className="mb-5 text-body text-faint">Rename freely — historic blocks keep their tag, only the label changes.</p>
        <ul>
          {s.blockTags.map((t) => (
            <li key={t.id} className="group flex items-center gap-3 border-b border-line py-2.5">
              <span className="min-w-0 flex-1">
                <InlineText value={t.label} onChange={(v) => s.renameTaxon('blockTags', t.id, v)} ariaLabel="Tag name" className="text-body text-paper" />
              </span>
              <span className="num shrink-0 text-micro text-faint">{s.schedule.filter((b) => b.tag === t.id).length}</span>
              <Tools>
                <DangerBtn onConfirm={() => s.removeTaxon('blockTags', t.id)} label={`Delete ${t.label}`} />
              </Tools>
            </li>
          ))}
        </ul>
        <button className="btn mt-4 w-full" onClick={() => s.addTaxon('blockTags', 'New tag')}>
          Add tag
        </button>
        <Eyebrow className="mt-6">Note</Eyebrow>
        <p className="mt-2 text-micro leading-relaxed text-faint">
          Tags group blocks for Jarvis and for filtering. They carry no colour — the palette is monochrome by design.
        </p>
      </Sheet>
    </Page>
  )
}
