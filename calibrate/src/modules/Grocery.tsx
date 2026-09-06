import { useState } from 'react'
import { DangerBtn, Dot, Empty, InlineText, Page, Section, Tools } from '../components/ui'
import { useStore } from '../store/store'

export function Grocery({ label }: { label: string }) {
  const s = useStore()
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const open = s.grocery.filter((g) => !g.done)
  const done = s.grocery.filter((g) => g.done)

  return (
    <Page title={label} lede="Everything the week needs. Add here, or tell Jarvis.">
      <Section label={`Open · ${open.length}`}>
        <form
          className="mb-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            s.addGrocery(name.trim(), qty.trim())
            setName('')
            setQty('')
          }}
        >
          <input className="field min-w-0 flex-1" placeholder="Item" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field w-20" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button className="btn btn-solid" type="submit">
            Add
          </button>
        </form>

        {open.length ? (
          <ul>
            {open.map((g) => (
              <li key={g.id} className="group flex items-center gap-3 border-b border-line py-2.5">
                <Dot checked={false} onToggle={() => s.toggleGrocery(g.id)} label={g.name} size={16} />
                <span className="min-w-0 flex-1">
                  <InlineText value={g.name} onChange={(v) => s.updateGrocery(g.id, { name: v })} ariaLabel="Item name" className="text-body text-paper" />
                </span>
                <span className="w-16 shrink-0">
                  <InlineText
                    value={g.qty}
                    onChange={(v) => s.updateGrocery(g.id, { qty: v })}
                    ariaLabel="Quantity"
                    placeholder="qty"
                    mono
                    className="text-right text-micro text-faint"
                  />
                </span>
                <Tools>
                  <DangerBtn onConfirm={() => s.removeGrocery(g.id)} label={`Delete ${g.name}`} />
                </Tools>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>List is clear.</Empty>
        )}
      </Section>

      {done.length > 0 && (
        <Section
          label={`In the basket · ${done.length}`}
          aside={
            <button className="btn btn-sm" onClick={s.clearDoneGrocery}>
              Clear
            </button>
          }
        >
          <ul>
            {done.map((g) => (
              <li key={g.id} className="flex items-center gap-3 border-b border-line py-2 opacity-45 last:border-b-0">
                <Dot checked onToggle={() => s.toggleGrocery(g.id)} label={g.name} size={16} />
                <span className="flex-1 truncate text-body line-through">{g.name}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Page>
  )
}
