import { useState } from 'react'
import { Bar, Chip, Cols, DangerBtn, Dot, Empty, Eyebrow, InlineText, NumCell, Page, Scroller, Section, Tools } from '../components/ui'
import { fmtDateShort, todayISO } from '../lib/dates'
import { revenueMonthlySeries, revenueSeries, revenueToday } from '../lib/stats'
import { useStore } from '../store/store'

export function Business({ label }: { label: string }) {
  const s = useStore()
  const [title, setTitle] = useState('')
  const [area, setArea] = useState(s.bizAreas[0]?.id ?? 'ops')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [filter, setFilter] = useState('all')
  const [editAreas, setEditAreas] = useState(false)

  const today = revenueToday(s)
  const series = revenueSeries(s, 30)
  const total30 = series.reduce((a, p) => a + p.value, 0)
  const best = Math.max(...series.map((p) => p.value), 0)
  // Run-rate is the honest number: a $1k day means nothing if it was the only one.
  const last7 = series.slice(-7)
  const avg7 = last7.reduce((a, p) => a + p.value, 0) / Math.max(1, last7.length)
  const avg30 = total30 / Math.max(1, series.length)
  const revenueDays = series.filter((p) => p.value > 0).length
  const openTasks = s.bizTasks.filter((t) => !t.done && (filter === 'all' || t.area === filter))
  const doneTasks = s.bizTasks.filter((t) => t.done)

  return (
    <Page title={label} lede={`Smart-ring operations. Target $${s.revenueTarget}/day. Protect the deep-work windows.`}>
      <Section label="Revenue">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <div className="flex items-baseline gap-3">
              <span className="readout text-[2.75rem]">${today.toFixed(0)}</span>
              <span className="flex items-baseline text-body text-faint">
                / $
                <NumCell value={s.revenueTarget} onChange={(v) => s.setRevenueTarget(v ?? 1000)} ariaLabel="Daily revenue target" width="w-14" />
              </span>
            </div>
            <Eyebrow className="mt-2">Today</Eyebrow>
          </div>
          <div className="flex gap-10">
            <div>
              <div className="readout text-[1.375rem]">${total30.toFixed(0)}</div>
              <Eyebrow className="mt-1.5">30 days</Eyebrow>
            </div>
            <div>
              <div className="readout text-[1.375rem]">${best.toFixed(0)}</div>
              <Eyebrow className="mt-1.5">Best day</Eyebrow>
            </div>
          </div>
        </div>
        <Bar pct={Math.min(100, (today / s.revenueTarget) * 100)} className="mt-6" />

        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-micro text-faint">
          <span>
            7-day run rate <span className="num text-mute">${avg7.toFixed(0)}/day</span>
          </span>
          <span>
            30-day run rate <span className="num text-mute">${avg30.toFixed(0)}/day</span>
          </span>
          <span>
            Days with revenue <span className="num text-mute">{revenueDays}/{series.length}</span>
          </span>
        </div>

        <div className="mt-8">
          <Cols
            data={series.filter((_, i) => i % 2 === 0).map((p) => ({ label: fmtDateShort(p.date).split(' ')[0], value: p.value }))}
            unit="$"
            height={80}
          />
        </div>

        <form
          className="mt-7 flex flex-wrap gap-2 border-t border-line pt-5"
          onSubmit={(e) => {
            e.preventDefault()
            const a = parseFloat(amount.replace(',', '.'))
            if (!a) return
            s.addRevenue({ date: todayISO(), amount: a, source: source.trim() || 'store' })
            setAmount('')
            setSource('')
          }}
        >
          <input className="field num w-28" placeholder="$ amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          <input className="field min-w-0 flex-1" placeholder="Source — store, ad, wholesale…" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source" />
          <button className="btn btn-solid" type="submit">
            Log
          </button>
        </form>

        {s.revenue.length > 0 && (
          <ul className="mt-5">
            {s.revenue.slice(0, 6).map((r) => (
              <li key={r.id} className="group flex items-center gap-4 border-b border-line py-2 last:border-b-0">
                <span className="num w-16 shrink-0 text-micro text-faint">{fmtDateShort(r.date)}</span>
                <span className="min-w-0 flex-1 truncate text-body text-mute">
                  <InlineText value={r.source} onChange={(v) => s.updateRevenue(r.id, { source: v })} ariaLabel="Revenue source" />
                </span>
                <span className="num flex shrink-0 items-baseline text-body text-paper">
                  $
                  <NumCell
                    value={r.amount}
                    onChange={(v) => s.updateRevenue(r.id, { amount: v ?? 0 })}
                    ariaLabel="Revenue amount"
                    width="w-16"
                  />
                </span>
                <Tools>
                  <DangerBtn onConfirm={() => s.removeRevenue(r.id)} label="Delete entry" />
                </Tools>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        label={`Execution queue · ${openTasks.length}`}
        aside={
          <button className="btn btn-sm" onClick={() => setEditAreas(!editAreas)}>
            {editAreas ? 'Done' : 'Edit areas'}
          </button>
        }
      >
        {editAreas ? (
          <div className="mb-6">
            <ul>
              {s.bizAreas.map((a) => (
                <li key={a.id} className="group flex items-center gap-3 border-b border-line py-2.5">
                  <span className="min-w-0 flex-1">
                    <InlineText value={a.label} onChange={(v) => s.renameTaxon('bizAreas', a.id, v)} ariaLabel="Area name" className="text-body text-paper" />
                  </span>
                  <span className="num shrink-0 text-micro text-faint">{s.bizTasks.filter((t) => t.area === a.id).length}</span>
                  <Tools>
                    <DangerBtn onConfirm={() => s.removeTaxon('bizAreas', a.id)} label={`Delete ${a.label}`} />
                  </Tools>
                </li>
              ))}
            </ul>
            <button className="btn btn-sm mt-3" onClick={() => s.addTaxon('bizAreas', 'New area')}>
              + Area
            </button>
          </div>
        ) : (
          <Scroller className="mb-5">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </Chip>
            {s.bizAreas.map((a) => (
              <Chip key={a.id} active={filter === a.id} onClick={() => setFilter(a.id)}>
                {a.label}
              </Chip>
            ))}
          </Scroller>
        )}

        <form
          className="mb-5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            s.addBizTask(title.trim(), area)
            setTitle('')
          }}
        >
          <input className="field min-w-0 flex-1" placeholder="High-leverage task…" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task" />
          <select className="field" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
            {s.bizAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button className="btn btn-solid" type="submit">
            Queue
          </button>
        </form>

        {openTasks.length ? (
          <ul>
            {openTasks.map((t) => (
              <li key={t.id} className="group flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <Dot checked={false} onToggle={() => s.toggleBizTask(t.id)} label={t.title} size={16} />
                <span className="min-w-0 flex-1">
                  <InlineText value={t.title} onChange={(v) => s.updateBizTask(t.id, { title: v })} ariaLabel="Task title" className="text-body text-paper" />
                </span>
                <span className="eyebrow shrink-0">{s.bizAreas.find((a) => a.id === t.area)?.label ?? t.area}</span>
                <Tools>
                  <DangerBtn onConfirm={() => s.removeBizTask(t.id)} label={`Delete ${t.title}`} />
                </Tools>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Queue clear. The next deep-work block is on the blueprint.</Empty>
        )}

        {doneTasks.length > 0 && (
          <ul className="mt-5 border-t border-line pt-4">
            {doneTasks.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-1.5 opacity-45">
                <Dot checked onToggle={() => s.toggleBizTask(t.id)} label={t.title} size={16} />
                <span className="truncate text-body line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {s.revenue.length > 0 && (
        <Section label="History — revenue per month">
          <Cols data={revenueMonthlySeries(s)} unit="$" height={100} />
        </Section>
      )}
    </Page>
  )
}
