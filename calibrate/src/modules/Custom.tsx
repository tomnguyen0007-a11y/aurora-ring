import { useState } from 'react'
import { Icon, PICKABLE_GLYPHS, type GlyphName } from '../components/icons'
import {
  Bar,
  Chain,
  Chip,
  Cols,
  DangerBtn,
  Dot,
  Empty,
  Eyebrow,
  IconBtn,
  InlineArea,
  InlineText,
  NumCell,
  Page,
  Reorder,
  Section,
  Sheet,
} from '../components/ui'
import { lastNDates, todayISO } from '../lib/dates'
import { useStore } from '../store/store'
import type { CustomBlock, SectionDef } from '../store/types'

/* ════════════════════════════════════════════════════════════════════
   CUSTOM SECTIONS
   Pages you invent. Five block types cover nearly everything a tracker
   needs — a checklist, a running counter, a note, a table, a metric with
   history — and Jarvis can build them for you by name.
   ════════════════════════════════════════════════════════════════════ */

const KINDS: { id: CustomBlock['kind']; label: string; glyph: GlyphName }[] = [
  { id: 'checklist', label: 'Checklist', glyph: 'check' },
  { id: 'counter', label: 'Counter', glyph: 'plus' },
  { id: 'metric', label: 'Metric', glyph: 'markets' },
  { id: 'note', label: 'Note', glyph: 'notes' },
  { id: 'table', label: 'Table', glyph: 'layers' },
]

function Block({ sectionId, block, index, count }: { sectionId: string; block: CustomBlock; index: number; count: number }) {
  const s = useStore()
  const date = todayISO()
  const patch = (p: Partial<CustomBlock>) => s.updateCustomBlock(sectionId, block.id, p)

  return (
    <Section
      label={
        <span className="flex items-center gap-2">
          <Icon name={KINDS.find((k) => k.id === block.kind)?.glyph ?? 'box'} size={12} />
          <InlineText value={block.title} onChange={(v) => patch({ title: v })} ariaLabel="Block title" className="eyebrow w-40" />
        </span>
      }
      aside={
        <>
          <Reorder
            onUp={() => s.moveCustomBlock(sectionId, block.id, -1)}
            onDown={() => s.moveCustomBlock(sectionId, block.id, 1)}
            first={index === 0}
            last={index === count - 1}
          />
          <DangerBtn onConfirm={() => s.removeCustomBlock(sectionId, block.id)} label="Delete block" />
        </>
      }
    >
      {block.kind === 'checklist' && (
        <div>
          <ul>
            {(block.items ?? []).map((it) => (
              <li key={it.id} className="group/it flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <Dot
                  checked={it.done}
                  onToggle={() => patch({ items: (block.items ?? []).map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) })}
                  label={it.text}
                  size={16}
                />
                <span className="min-w-0 flex-1">
                  <InlineText
                    value={it.text}
                    onChange={(v) => patch({ items: (block.items ?? []).map((x) => (x.id === it.id ? { ...x, text: v } : x)) })}
                    ariaLabel="Item"
                    className={`text-body ${it.done ? 'text-faint line-through' : 'text-paper'}`}
                  />
                </span>
                <span className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover/it:opacity-100">
                  <IconBtn glyph="close" label="Remove item" size={12} onClick={() => patch({ items: (block.items ?? []).filter((x) => x.id !== it.id) })} />
                </span>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('it') as HTMLInputElement
              if (!input.value.trim()) return
              patch({ items: [...(block.items ?? []), { id: `it-${Date.now().toString(36)}`, text: input.value.trim(), done: false }] })
              input.value = ''
            }}
          >
            <input name="it" className="field min-w-0 flex-1" placeholder="Add an item…" aria-label="New item" />
            <button className="btn" type="submit">
              Add
            </button>
          </form>
        </div>
      )}

      {block.kind === 'counter' && (
        <div>
          <div className="flex items-end justify-between gap-6">
            <div className="flex items-baseline gap-2">
              <span className="readout text-[2.5rem]">{block.series?.[date] ?? 0}</span>
              {block.target ? <span className="num text-body text-faint">/ {block.target}</span> : null}
              <InlineText value={block.unit ?? ''} onChange={(v) => patch({ unit: v })} ariaLabel="Unit" placeholder="unit" className="w-12 text-micro text-faint" />
            </div>
            <div className="flex gap-2">
              <button
                className="btn"
                onClick={() => patch({ series: { ...(block.series ?? {}), [date]: Math.max(0, (block.series?.[date] ?? 0) - (block.step || 1)) } })}
              >
                −{block.step || 1}
              </button>
              <button className="btn btn-solid" onClick={() => patch({ series: { ...(block.series ?? {}), [date]: (block.series?.[date] ?? 0) + (block.step || 1) } })}>
                +{block.step || 1}
              </button>
            </div>
          </div>
          {block.target ? <Bar pct={Math.min(100, ((block.series?.[date] ?? 0) / block.target) * 100)} className="mt-4" /> : null}
          <div className="mt-5 flex items-center gap-6 border-t border-line pt-4">
            <label className="flex items-center gap-2">
              <Eyebrow>Step</Eyebrow>
              <NumCell value={block.step ?? 1} onChange={(v) => patch({ step: v ?? 1 })} ariaLabel="Step" width="w-10" />
            </label>
            <label className="flex items-center gap-2">
              <Eyebrow>Target</Eyebrow>
              <NumCell value={block.target ?? 0} onChange={(v) => patch({ target: v ?? 0 })} ariaLabel="Target" width="w-12" />
            </label>
          </div>
          <div className="mt-4">
            <Chain days={lastNDates(30).map((d) => (block.series?.[d] ?? 0) >= (block.target || 1))} />
          </div>
        </div>
      )}

      {block.kind === 'metric' && (
        <div>
          <div className="flex items-end justify-between gap-6">
            <span className="flex items-baseline gap-2">
              <NumCell
                value={block.series?.[date] ?? null}
                onChange={(v) => patch({ series: { ...(block.series ?? {}), [date]: v ?? 0 } })}
                ariaLabel="Today's value"
                width="w-20"
              />
              <InlineText value={block.unit ?? ''} onChange={(v) => patch({ unit: v })} ariaLabel="Unit" placeholder="unit" className="w-14 text-micro text-faint" />
            </span>
            <Eyebrow>Today</Eyebrow>
          </div>
          <div className="mt-6">
            <Cols data={lastNDates(14).map((d) => ({ label: d.slice(8), value: block.series?.[d] ?? 0 }))} unit={block.unit ?? ''} height={76} />
          </div>
        </div>
      )}

      {block.kind === 'note' && <InlineArea value={block.body ?? ''} onChange={(v) => patch({ body: v })} ariaLabel="Note body" placeholder="Write…" minRows={4} />}

      {block.kind === 'table' && (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[380px] border-collapse">
            <thead>
              <tr>
                {(block.columns ?? []).map((c, ci) => (
                  <th key={ci} className="border-b border-line-2 py-2 pr-4 text-left">
                    <input
                      className="field-line eyebrow w-full"
                      value={c}
                      aria-label={`Column ${ci + 1}`}
                      onChange={(e) => patch({ columns: (block.columns ?? []).map((x, i) => (i === ci ? e.target.value : x)) })}
                    />
                  </th>
                ))}
                <th className="w-8 border-b border-line-2">
                  <IconBtn
                    glyph="plus"
                    label="Add column"
                    size={12}
                    onClick={() =>
                      patch({
                        columns: [...(block.columns ?? []), `Column ${(block.columns?.length ?? 0) + 1}`],
                        rows: (block.rows ?? []).map((r) => [...r, '']),
                      })
                    }
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {(block.rows ?? []).map((row, ri) => (
                <tr key={ri} className="group/row border-b border-line">
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-1.5 pr-4">
                      <input
                        className="field-line w-full text-body text-paper"
                        value={cell}
                        aria-label={`Row ${ri + 1} column ${ci + 1}`}
                        onChange={(e) =>
                          patch({ rows: (block.rows ?? []).map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? e.target.value : c)) : r)) })
                        }
                      />
                    </td>
                  ))}
                  <td className="text-center">
                    <span className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover/row:opacity-100">
                      <IconBtn glyph="close" label="Delete row" size={12} onClick={() => patch({ rows: (block.rows ?? []).filter((_, i) => i !== ri) })} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-sm mt-3" onClick={() => patch({ rows: [...(block.rows ?? []), (block.columns ?? []).map(() => '')] })}>
            + Row
          </button>
        </div>
      )}
    </Section>
  )
}

export function Custom({ section }: { section: SectionDef }) {
  const s = useStore()
  const blocks = s.customBlocks[section.id] ?? []
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <Page
      title={<InlineText value={section.label} onChange={(v) => s.updateSection(section.id, { label: v })} ariaLabel="Section name" className="t-page" />}
      lede="A page you built. Add blocks, rename anything, or ask Jarvis to fill it in."
      actions={
        <>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            <Icon name="sliders" size={13} /> Section
          </button>
          <button className="btn btn-solid" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={13} /> Block
          </button>
        </>
      }
    >
      {blocks.length ? (
        blocks.map((b, i) => <Block key={b.id} sectionId={section.id} block={b} index={i} count={blocks.length} />)
      ) : (
        <Section>
          <Empty>Empty page. Add a block — or tell Jarvis “add a checklist called Pre-round routine to this section”.</Empty>
        </Section>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add a block">
        <div className="space-y-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className="flex w-full items-center gap-3 border-b border-line py-3.5 text-left"
              onClick={() => {
                s.addBlockTo(section.id, k.id)
                setAddOpen(false)
              }}
            >
              <Icon name={k.glyph} size={15} className="text-faint" />
              <span className="flex-1 text-body text-paper">{k.label}</span>
              <Icon name="arrowRight" size={13} className="text-ghost" />
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Section settings">
        <label className="mb-5 block">
          <Eyebrow className="mb-2">Name</Eyebrow>
          <input className="field w-full" value={section.label} onChange={(e) => s.updateSection(section.id, { label: e.target.value })} aria-label="Section name" />
        </label>
        <label className="mb-5 block">
          <Eyebrow className="mb-2">Group</Eyebrow>
          <select className="field w-full" value={section.group} onChange={(e) => s.updateSection(section.id, { group: e.target.value })} aria-label="Group">
            {s.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <Eyebrow className="mb-2">Icon</Eyebrow>
        <div className="mb-6 flex flex-wrap gap-1.5">
          {PICKABLE_GLYPHS.map((g) => (
            <button
              key={g}
              onClick={() => s.updateSection(section.id, { icon: g })}
              aria-label={`Use ${g} icon`}
              className={`border p-2 transition-colors ${section.icon === g ? 'border-paper text-paper' : 'border-line text-faint hover:text-paper'}`}
            >
              <Icon name={g} size={15} />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-line py-3">
          <span className="text-body text-mute">Pin to mobile bar</span>
          <Chip active={section.bar} onClick={() => s.updateSection(section.id, { bar: !section.bar })}>
            {section.bar ? 'Pinned' : 'Pin'}
          </Chip>
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <button
            className="btn w-full"
            onClick={() => {
              s.removeSection(section.id)
              setSettingsOpen(false)
            }}
          >
            Delete this section
          </button>
        </div>
      </Sheet>
    </Page>
  )
}
