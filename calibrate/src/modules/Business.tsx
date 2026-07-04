import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Bars, CheckDot, Empty, HudLabel, Panel, StatTile } from '../components/ui'
import { fmtDateShort, todayISO } from '../lib/dates'
import { revenueSeries, revenueToday } from '../lib/stats'
import { useStore } from '../store/store'

const AREAS = ['Content', 'Store', 'Marketing', 'Suppliers', 'Ops']

export function Business() {
  const s = useStore()
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('Content')
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')

  const today = revenueToday(s)
  const series = revenueSeries(s, 30)
  const total30 = series.reduce((a, p) => a + p.value, 0)
  const best = Math.max(...series.map((p) => p.value), 0)
  const open = s.bizTasks.filter((t) => !t.done)
  const done = s.bizTasks.filter((t) => t.done)

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-bold tracking-wide text-ice">AURORA COMMAND</h1>
        <p className="mt-1 text-sm text-haze">Smart Ring operations. Target: $1,000/day. Protect the deep work windows.</p>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Today" value={`$${today.toFixed(0)}`} sub="of $1,000 target" accent={today >= 1000 ? 'text-affirm' : 'text-signal'} />
        <StatTile label="30 days" value={`$${total30.toFixed(0)}`} sub="total revenue" />
        <StatTile label="Best day" value={`$${best.toFixed(0)}`} sub="last 30 days" accent="text-affirm" />
        <StatTile label="Open tasks" value={open.length} sub={`${done.length} completed`} accent="text-steel" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <HudLabel>Revenue — last 30 days</HudLabel>
          <Bars
            data={series.filter((_, i) => i % 2 === 0).map((p) => ({ label: fmtDateShort(p.date).split(' ')[0], value: p.value }))}
            color="var(--color-signal)"
            unit="$"
          />
          <form
            className="mt-4 flex gap-2 border-t border-edge pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              const a = parseFloat(amount)
              if (!a) return
              s.addRevenue({ date: todayISO(), amount: a, source: source.trim() || 'store' })
              setAmount('')
              setSource('')
            }}
          >
            <input className="field num w-28" placeholder="$ amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input className="field flex-1" placeholder="Source (store, ad, wholesale…)" value={source} onChange={(e) => setSource(e.target.value)} />
            <button className="btn btn-signal !px-3" type="submit" aria-label="Log revenue">
              <Plus size={15} />
            </button>
          </form>
          {s.revenue.length > 0 && (
            <ul className="mt-3 space-y-1">
              {s.revenue.slice(0, 5).map((r) => (
                <li key={r.id} className="group flex items-center justify-between rounded-lg bg-black/25 px-3 py-1.5 text-sm">
                  <span className="num text-xs text-fog">{fmtDateShort(r.date)}</span>
                  <span className="text-haze">{r.source}</span>
                  <span className="num text-affirm">${r.amount.toFixed(0)}</span>
                  <button className="opacity-0 group-hover:opacity-100" aria-label="Delete entry" onClick={() => s.removeRevenue(r.id)}>
                    <Trash2 size={13} className="text-alert/70" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <HudLabel>Execution Queue</HudLabel>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!title.trim()) return
              s.addBizTask(title.trim(), area)
              setTitle('')
            }}
          >
            <input className="field min-w-0 flex-1" placeholder="High-leverage task…" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select className="field !py-2" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
              {AREAS.map((a) => (
                <option key={a} value={a} className="bg-panel">
                  {a}
                </option>
              ))}
            </select>
            <button className="btn btn-signal !px-3" type="submit" aria-label="Add task">
              <Plus size={15} />
            </button>
          </form>

          <ul className="mt-4 space-y-1.5">
            {open.map((t) => (
              <li key={t.id} className="group flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5">
                <CheckDot checked={false} onToggle={() => s.toggleBizTask(t.id)} label={t.title} />
                <span className="min-w-0 flex-1 truncate text-sm text-ice">{t.title}</span>
                <span className="hud-label !mb-0 shrink-0 !text-[8px] text-signal-dim">{t.area}</span>
                <button className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`Delete ${t.title}`} onClick={() => s.removeBizTask(t.id)}>
                  <Trash2 size={14} className="text-alert/70" />
                </button>
              </li>
            ))}
          </ul>
          {!open.length && <Empty>Queue clear. Next deep work block is on the schedule.</Empty>}

          {done.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-edge pt-3">
              {done.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-1 opacity-45">
                  <CheckDot checked onToggle={() => s.toggleBizTask(t.id)} label={t.title} />
                  <span className="truncate text-sm text-fog line-through">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
