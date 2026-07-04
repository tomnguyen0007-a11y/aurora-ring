import { Pin, Plus, Table2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Empty, HudLabel, Panel } from '../components/ui'
import { useStore } from '../store/store'

function TableEditor({ id }: { id: string }) {
  const s = useStore()
  const t = s.tables.find((x) => x.id === id)
  if (!t) return null

  const setCell = (r: number, c: number, v: string) => {
    const rows = t.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row))
    s.updateTable(id, { rows })
  }
  const setCol = (c: number, v: string) => {
    s.updateTable(id, { columns: t.columns.map((col, ci) => (ci === c ? v : col)) })
  }
  const addRow = () => s.updateTable(id, { rows: [...t.rows, t.columns.map(() => '')] })
  const addCol = () =>
    s.updateTable(id, {
      columns: [...t.columns, `Column ${t.columns.length + 1}`],
      rows: t.rows.map((r) => [...r, '']),
    })
  const delRow = (r: number) => s.updateTable(id, { rows: t.rows.filter((_, i) => i !== r) })

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr>
            {t.columns.map((c, ci) => (
              <th key={ci} className="border-b border-edge-strong p-1">
                <input
                  className="w-full bg-transparent px-2 py-1 font-display font-semibold tracking-wide text-signal outline-none"
                  value={c}
                  aria-label={`Column ${ci + 1} name`}
                  onChange={(e) => setCol(ci, e.target.value)}
                />
              </th>
            ))}
            <th className="w-8 border-b border-edge-strong">
              <button className="btn btn-ghost !p-1" onClick={addCol} aria-label="Add column">
                <Plus size={14} />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => (
            <tr key={ri} className="group">
              {row.map((cell, ci) => (
                <td key={ci} className="border-b border-edge p-1">
                  <input
                    className="w-full bg-transparent px-2 py-1 text-ice outline-none focus:bg-white/[0.04] rounded"
                    value={cell}
                    aria-label={`Row ${ri + 1} ${t.columns[ci]}`}
                    onChange={(e) => setCell(ri, ci, e.target.value)}
                  />
                </td>
              ))}
              <td className="border-b border-edge text-center">
                <button
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => delRow(ri)}
                  aria-label={`Delete row ${ri + 1}`}
                >
                  <X size={13} className="text-alert/70" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn mt-2 !py-1.5 !text-xs" onClick={addRow}>
        <Plus size={13} /> Row
      </button>
    </div>
  )
}

export function Notes() {
  const s = useStore()
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [openTable, setOpenTable] = useState<string | null>(null)

  const note = s.notes.find((n) => n.id === openNote)
  const sorted = [...s.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated)

  if (note) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button className="btn btn-ghost" onClick={() => setOpenNote(null)}>
            ← Notes
          </button>
          <div className="flex gap-1">
            <button
              className={`btn btn-ghost !px-2.5 ${note.pinned ? '!text-signal' : ''}`}
              aria-label="Pin note"
              onClick={() => s.updateNote(note.id, { pinned: !note.pinned })}
            >
              <Pin size={16} />
            </button>
            <button
              className="btn btn-ghost !px-2.5"
              aria-label="Delete note"
              onClick={() => {
                s.removeNote(note.id)
                setOpenNote(null)
              }}
            >
              <Trash2 size={16} className="text-alert/80" />
            </button>
          </div>
        </div>
        <Panel>
          <input
            className="w-full bg-transparent h-lumen text-2xl font-bold tracking-wide outline-none"
            value={note.title}
            aria-label="Note title"
            onChange={(e) => s.updateNote(note.id, { title: e.target.value })}
          />
          <textarea
            className="mt-3 min-h-[50vh] w-full resize-y bg-transparent text-[0.95rem] leading-relaxed text-ice/90 outline-none placeholder:text-fog"
            placeholder="Write…"
            value={note.body}
            onChange={(e) => s.updateNote(note.id, { body: e.target.value })}
          />
        </Panel>
      </div>
    )
  }

  const table = s.tables.find((t) => t.id === openTable)
  if (table) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button className="btn btn-ghost" onClick={() => setOpenTable(null)}>
            ← Notes
          </button>
          <button
            className="btn btn-ghost !px-2.5"
            aria-label="Delete table"
            onClick={() => {
              s.removeTable(table.id)
              setOpenTable(null)
            }}
          >
            <Trash2 size={16} className="text-alert/80" />
          </button>
        </div>
        <Panel>
          <input
            className="mb-3 w-full bg-transparent h-lumen text-2xl font-bold tracking-wide outline-none"
            value={table.name}
            aria-label="Table name"
            onChange={(e) => s.updateTable(table.id, { name: e.target.value })}
          />
          <TableEditor id={table.id} />
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h1 className="h-lumen text-3xl font-bold tracking-wide">NOTES & TABLES</h1>
          <p className="mt-1 text-sm text-haze">Thinking space. Jarvis can create notes for you from chat.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setOpenTable(s.addTable('New table'))}>
            <Table2 size={15} /> New table
          </button>
          <button className="btn btn-signal" onClick={() => setOpenNote(s.addNote('Untitled'))}>
            <Plus size={15} /> New note
          </button>
        </div>
      </header>

      {!sorted.length && !s.tables.length && (
        <Empty>Nothing here yet. Capture drills, business ideas, swing thoughts…</Empty>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((n) => (
          <button key={n.id} onClick={() => setOpenNote(n.id)} className="text-left">
            <Panel className="h-full transition-colors hover:border-signal/30">
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-base font-bold tracking-wide text-ice">{n.title || 'Untitled'}</span>
                {n.pinned && <Pin size={13} className="shrink-0 text-signal" />}
              </div>
              <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-haze">{n.body || '—'}</p>
            </Panel>
          </button>
        ))}
        {s.tables.map((t) => (
          <button key={t.id} onClick={() => setOpenTable(t.id)} className="text-left">
            <Panel className="h-full transition-colors hover:border-steel/40">
              <div className="flex items-center gap-2">
                <Table2 size={14} className="text-steel" />
                <span className="font-display text-base font-bold tracking-wide text-ice">{t.name}</span>
              </div>
              <p className="num mt-2 text-xs text-fog">
                {t.columns.length} cols × {t.rows.length} rows
              </p>
            </Panel>
          </button>
        ))}
      </div>

      {sorted.length > 0 && <HudLabel className="px-1">Tap a card to open</HudLabel>}
    </div>
  )
}
