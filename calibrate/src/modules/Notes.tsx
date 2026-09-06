import { useState } from 'react'
import { Icon } from '../components/icons'
import { DangerBtn, Empty, IconBtn, Page, Section } from '../components/ui'
import { useStore } from '../store/store'

function TableEditor({ id }: { id: string }) {
  const s = useStore()
  const t = s.tables.find((x) => x.id === id)
  if (!t) return null

  const setCell = (r: number, c: number, v: string) =>
    s.updateTable(id, { rows: t.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? v : cell)) : row)) })
  const setCol = (c: number, v: string) => s.updateTable(id, { columns: t.columns.map((col, ci) => (ci === c ? v : col)) })

  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr>
            {t.columns.map((c, ci) => (
              <th key={ci} className="border-b border-line-2 py-2 pr-4 text-left">
                <input className="field-line eyebrow w-full" value={c} aria-label={`Column ${ci + 1} name`} onChange={(e) => setCol(ci, e.target.value)} />
              </th>
            ))}
            <th className="w-8 border-b border-line-2">
              <IconBtn
                glyph="plus"
                label="Add column"
                size={12}
                onClick={() => s.updateTable(id, { columns: [...t.columns, `Column ${t.columns.length + 1}`], rows: t.rows.map((r) => [...r, '']) })}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, ri) => (
            <tr key={ri} className="group border-b border-line">
              {row.map((cell, ci) => (
                <td key={ci} className="py-1.5 pr-4">
                  <input
                    className="field-line w-full text-body text-paper"
                    value={cell}
                    aria-label={`Row ${ri + 1} ${t.columns[ci]}`}
                    onChange={(e) => setCell(ri, ci, e.target.value)}
                  />
                </td>
              ))}
              <td className="text-center">
                <span className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                  <IconBtn glyph="close" label={`Delete row ${ri + 1}`} size={12} onClick={() => s.updateTable(id, { rows: t.rows.filter((_, i) => i !== ri) })} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn btn-sm mt-3" onClick={() => s.updateTable(id, { rows: [...t.rows, t.columns.map(() => '')] })}>
        + Row
      </button>
    </div>
  )
}

export function Notes({ label }: { label: string }) {
  const s = useStore()
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [openTable, setOpenTable] = useState<string | null>(null)

  const note = s.notes.find((n) => n.id === openNote)
  const table = s.tables.find((t) => t.id === openTable)
  const sorted = [...s.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated)

  if (note) {
    return (
      <div className="animate-fade mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <button className="btn btn-quiet" onClick={() => setOpenNote(null)}>
            <Icon name="arrowLeft" size={13} /> {label}
          </button>
          <div className="flex items-center gap-1">
            <IconBtn glyph="pin" label="Pin note" active={note.pinned} onClick={() => s.updateNote(note.id, { pinned: !note.pinned })} />
            <DangerBtn
              onConfirm={() => {
                s.removeNote(note.id)
                setOpenNote(null)
              }}
              label="Delete note"
            />
          </div>
        </div>
        <input className="field-line t-page w-full" value={note.title} aria-label="Note title" onChange={(e) => s.updateNote(note.id, { title: e.target.value })} />
        <textarea
          className="mt-6 min-h-[55vh] w-full resize-y bg-transparent text-lede leading-relaxed text-mute outline-none placeholder:text-faint focus:text-paper"
          placeholder="Write…"
          value={note.body}
          onChange={(e) => s.updateNote(note.id, { body: e.target.value })}
        />
      </div>
    )
  }

  if (table) {
    return (
      <div className="animate-fade mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <button className="btn btn-quiet" onClick={() => setOpenTable(null)}>
            <Icon name="arrowLeft" size={13} /> {label}
          </button>
          <DangerBtn
            onConfirm={() => {
              s.removeTable(table.id)
              setOpenTable(null)
            }}
            label="Delete table"
          />
        </div>
        <input className="field-line t-page mb-6 w-full" value={table.name} aria-label="Table name" onChange={(e) => s.updateTable(table.id, { name: e.target.value })} />
        <TableEditor id={table.id} />
      </div>
    )
  }

  return (
    <Page
      title={label}
      lede="Thinking space. Jarvis writes here too — ask it to capture something and it lands as a note."
      actions={
        <>
          <button className="btn" onClick={() => setOpenTable(s.addTable('New table'))}>
            Table
          </button>
          <button className="btn btn-solid" onClick={() => setOpenNote(s.addNote('Untitled'))}>
            Note
          </button>
        </>
      }
    >
      {!sorted.length && !s.tables.length && (
        <Section>
          <Empty>Nothing captured yet. Drills, swing thoughts, business ideas.</Empty>
        </Section>
      )}

      {sorted.length > 0 && (
        <Section label={`Notes · ${sorted.length}`}>
          <ul>
            {sorted.map((n) => (
              <li key={n.id} className="group flex items-baseline gap-4 border-b border-line py-3 last:border-b-0">
                <button onClick={() => setOpenNote(n.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-baseline gap-2">
                    {n.pinned && <Icon name="pin" size={11} className="text-faint" />}
                    <span className="truncate text-body text-paper">{n.title || 'Untitled'}</span>
                  </span>
                  <span className="mt-1 block truncate text-micro text-faint">{n.body.split('\n')[0] || '—'}</span>
                </button>
                <span className="num shrink-0 text-micro text-faint">
                  {new Date(n.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.tables.length > 0 && (
        <Section label={`Tables · ${s.tables.length}`}>
          <ul>
            {s.tables.map((t) => (
              <li key={t.id} className="border-b border-line py-3 last:border-b-0">
                <button onClick={() => setOpenTable(t.id)} className="flex w-full items-baseline gap-4 text-left">
                  <span className="min-w-0 flex-1 truncate text-body text-paper">{t.name}</span>
                  <span className="num shrink-0 text-micro text-faint">
                    {t.columns.length} × {t.rows.length}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  )
}
