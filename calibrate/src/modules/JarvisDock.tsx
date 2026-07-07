import { Bot, SendHorizonal } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store/store'
import { useJarvis } from './Jarvis'

/** Desktop-only command bar: talk to Jarvis from any screen. */
export function JarvisDock() {
  const setView = useStore((s) => s.setView)
  const lastJarvis = useStore((s) => [...s.chat].reverse().find((m) => m.role === 'jarvis'))
  const { send, busy } = useJarvis()
  const [input, setInput] = useState('')
  const [flash, setFlash] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input)
    setInput('')
    setFlash(true)
    setTimeout(() => setFlash(false), 2600)
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-56 right-0 z-30 hidden justify-center px-6 lg:flex">
      <div className="pointer-events-auto w-full max-w-xl">
        {flash && lastJarvis && (
          <button
            className="glass-strong mb-2 block w-full rounded-xl px-4 py-2.5 text-left text-sm text-ice/90 animate-rise"
            onClick={() => setView('jarvis')}
          >
            <span className="hud-label !mb-1 block !text-[8px] text-signal-dim">JARVIS</span>
            <span className="line-clamp-2">{lastJarvis.text}</span>
          </button>
        )}
        <form onSubmit={submit} className="glass-strong flex items-center gap-2 rounded-full py-1.5 pl-2 pr-1.5">
          <button
            type="button"
            onClick={() => setView('jarvis')}
            aria-label="Open Jarvis"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
              busy ? 'border-signal text-signal shadow-[0_0_14px_rgba(233,237,242,0.4)]' : 'border-edge-strong text-haze hover:text-signal hover:border-signal/50'
            }`}
          >
            <Bot size={17} />
          </button>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-ice outline-none placeholder:text-fog"
            placeholder={busy ? 'Jarvis is thinking…' : 'Jarvis — log, ask, plan… (from any screen)'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Message Jarvis"
          />
          <button
            type="submit"
            aria-label="Send to Jarvis"
            disabled={!input.trim() || busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b border border-white/15 from-[#2a2f38] to-[#08090d] text-ice transition-transform active:scale-95 disabled:opacity-35"
          >
            <SendHorizonal size={15} />
          </button>
        </form>
      </div>
    </div>
  )
}
