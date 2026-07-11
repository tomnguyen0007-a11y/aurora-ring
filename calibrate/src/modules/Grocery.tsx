import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CheckDot, Empty, HudLabel, Panel } from '../components/ui'
import { useStore } from '../store/store'

export function Grocery() {
  const s = useStore()
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const open = s.grocery.filter((g) => !g.done)
  const done = s.grocery.filter((g) => g.done)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="px-1">
        <h1 className="h-lumen text-3xl font-bold tracking-wide">SUPPLY RUN</h1>
        <p className="mt-1 text-sm text-haze">
          Grocery list. Add here or tell Jarvis — “add 2kg chicken breast and jasmine rice to the list”.
        </p>
      </header>

      <Panel>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            s.addGrocery(name.trim(), qty.trim())
            setName('')
            setQty('')
          }}
        >
          <input className="field flex-1" placeholder="Item…" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field w-24" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button className="btn btn-signal !px-3" type="submit" aria-label="Add item">
            <Plus size={16} />
          </button>
        </form>

        <ul className="mt-4 space-y-1.5">
          {open.map((g) => (
            <li key={g.id} className="group flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5">
              <CheckDot checked={false} onToggle={() => s.toggleGrocery(g.id)} label={g.name} />
              <span className="flex-1 text-sm text-ice">{g.name}</span>
              {g.qty && <span className="num text-xs text-fog">{g.qty}</span>}
              <button className="transition-opacity focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100" aria-label={`Delete ${g.name}`} onClick={() => s.removeGrocery(g.id)}>
                <Trash2 size={14} className="text-alert/70" />
              </button>
            </li>
          ))}
        </ul>
        {!open.length && !done.length && <Empty>List is clear. Sunday 16:30 is meal-prep supply time.</Empty>}

        {done.length > 0 && (
          <>
            <div className="mt-5 flex items-center justify-between">
              <HudLabel className="!mb-0">In the basket ({done.length})</HudLabel>
              <button className="btn btn-ghost !py-1 !text-xs" onClick={s.clearDoneGrocery}>
                Clear
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {done.map((g) => (
                <li key={g.id} className="flex items-center gap-3 rounded-xl px-3 py-1.5 opacity-50">
                  <CheckDot checked onToggle={() => s.toggleGrocery(g.id)} label={g.name} />
                  <span className="flex-1 text-sm text-fog line-through">{g.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  )
}
