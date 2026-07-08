import { Eye, Hash, Link2, Pencil, Pin, Plus, Search, Table2, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Markdown } from '../components/Markdown'
import { Empty, HudLabel, Panel } from '../components/ui'
import { allVaultTags, backlinksFor, extractTags, findNoteByTitle, searchNotes } from '../lib/vault'
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
                  className="lg:opacity-0 transition-opacity lg:group-hover:opacity-100"
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

function NoteEditor({ id, onClose, onOpenNote }: { id: string; onClose: () => void; onOpenNote: (id: string) => void }) {
  const s = useStore()
  // Empty notes open straight into edit mode; notes with content open in preview.
  const [editing, setEditing] = useState(() => !useStore.getState().notes.find((n) => n.id === id)?.body.trim())
  const note = s.notes.find((n) => n.id === id)
  if (!note) return null

  const backlinks = backlinksFor(s.notes, note)
  const tags = extractTags(note.body)

  const followWikiLink = (title: string) => {
    const hit = findNoteByTitle(s.notes, title)
    if (hit) onOpenNote(hit.id)
    else onOpenNote(s.addNote(title, ''))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-ghost" onClick={onClose}>
          ← Vault
        </button>
        <div className="flex gap-1">
          <button
            className="btn btn-ghost !px-2.5"
            aria-label={editing ? 'Preview note' : 'Edit note'}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Eye size={16} /> : <Pencil size={16} />}
          </button>
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
              onClose()
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
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full border border-signal/25 bg-signal/10 px-2 py-0.5 text-[0.65rem] tracking-wide text-signal">
                #{t}
              </span>
            ))}
          </div>
        )}
        {editing ? (
          <textarea
            className="mt-3 min-h-[50vh] w-full resize-y bg-transparent font-mono text-[0.85rem] leading-relaxed text-ice/90 outline-none placeholder:text-fog"
            placeholder={'Write in markdown…\n\n# Heading\n- [ ] task\n[[Link another note]]\n#tag'}
            value={note.body}
            autoFocus={editing}
            onChange={(e) => s.updateNote(note.id, { body: e.target.value })}
          />
        ) : (
          <div className="mt-4 min-h-[40vh]" onDoubleClick={() => setEditing(true)}>
            {note.body.trim() ? (
              <Markdown text={note.body} onWikiLink={followWikiLink} />
            ) : (
              <p className="text-sm text-fog">Empty. Tap the pencil to write.</p>
            )}
          </div>
        )}
      </Panel>
      {backlinks.length > 0 && (
        <Panel>
          <HudLabel className="flex items-center gap-1.5">
            <Link2 size={12} /> Linked from
          </HudLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {backlinks.map((b) => (
              <button
                key={b.id}
                className="rounded-lg border border-edge bg-white/[0.03] px-2.5 py-1 text-xs text-ice/80 transition-colors hover:border-signal/30"
                onClick={() => onOpenNote(b.id)}
              >
                {b.title || 'Untitled'}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

export function Notes() {
  const s = useStore()
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [openTable, setOpenTable] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const tags = useMemo(() => allVaultTags(s.notes), [s.notes])

  const visible = useMemo(() => {
    let list = searchNotes(s.notes, query)
    if (tagFilter) list = list.filter((n) => extractTags(n.body).includes(tagFilter))
    if (!query) list = [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated)
    return list
  }, [s.notes, query, tagFilter])

  if (openNote) {
    return <NoteEditor key={openNote} id={openNote} onClose={() => setOpenNote(null)} onOpenNote={setOpenNote} />
  }

  const table = s.tables.find((t) => t.id === openTable)
  if (table) {
    return (
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button className="btn btn-ghost" onClick={() => setOpenTable(null)}>
            ← Vault
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
          <h1 className="h-lumen text-3xl font-bold tracking-wide">VAULT</h1>
          <p className="mt-1 text-sm text-haze">
            Your second brain. Markdown, [[links]], #tags — Jarvis reads and writes here too.
          </p>
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

      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-edge bg-white/[0.03] px-3 py-2 focus-within:border-signal/40 sm:max-w-sm">
          <Search size={14} className="shrink-0 text-fog" />
          <input
            className="w-full bg-transparent text-sm text-ice outline-none placeholder:text-fog"
            placeholder="Search the vault…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} className="text-fog" />
            </button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 8).map((t) => (
              <button
                key={t}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] tracking-wide transition-colors ${
                  tagFilter === t
                    ? 'border-signal/50 bg-signal/15 text-signal'
                    : 'border-edge bg-white/[0.02] text-haze hover:border-signal/30'
                }`}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                <Hash size={10} />
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {!visible.length && !s.tables.length && (
        <Empty>
          {query || tagFilter ? 'No notes match.' : 'Nothing here yet. Capture drills, business ideas, swing thoughts…'}
        </Empty>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((n) => {
          const nTags = extractTags(n.body)
          return (
            <button key={n.id} onClick={() => setOpenNote(n.id)} className="text-left">
              <Panel className="h-full transition-colors hover:border-signal/30">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-base font-bold tracking-wide text-ice">{n.title || 'Untitled'}</span>
                  {n.pinned && <Pin size={13} className="shrink-0 text-signal" />}
                </div>
                <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-haze">
                  {n.body.replace(/[#>*`[\]]/g, '').trim() || '—'}
                </p>
                {nTags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {nTags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-full bg-signal/10 px-1.5 py-0.5 text-[0.6rem] text-signal/80">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>
            </button>
          )
        })}
        {(!query && !tagFilter ? s.tables : []).map((t) => (
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

      {visible.length > 0 && <HudLabel className="px-1">Tap a card to open</HudLabel>}
    </div>
  )
}
