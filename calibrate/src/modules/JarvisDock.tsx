import { Bot, ImagePlus, SendHorizonal, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useStore } from '../store/store'
import { jarvisSourceColor, jarvisSourceLabel, useJarvis } from './Jarvis'

/** Desktop-only command bar: talk to Jarvis from any screen — text, screenshots, paste. */
export function JarvisDock() {
  const setView = useStore((s) => s.setView)
  const lastJarvis = useStore((s) => [...s.chat].reverse().find((m) => m.role === 'jarvis'))
  const lastJarvisSource = useStore((s) => s.lastJarvisSource)
  const { send, busy } = useJarvis()
  const [input, setInput] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const attachPhoto = async (file: File) => {
    try {
      const { fileToDataURL } = await import('../lib/image')
      setImage(await fileToDataURL(file))
    } catch {
      /* ignore bad files */
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (file) {
      e.preventDefault()
      void attachPhoto(file)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !image) return
    send(input, image ?? undefined)
    setInput('')
    setImage(null)
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
        {image && (
          <div className="glass-strong mb-2 flex items-center gap-2 rounded-xl p-2 animate-rise">
            <img src={image} alt="attachment preview" className="h-10 w-10 rounded-lg object-cover" />
            <span className="flex-1 text-xs text-haze">Screenshot attached — ask Jarvis about it.</span>
            <button type="button" className="btn btn-ghost !px-1.5" aria-label="Remove image" onClick={() => setImage(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        <form onSubmit={submit} className="glass-strong flex items-center gap-2 rounded-full py-1.5 pl-2 pr-1.5">
          <button
            type="button"
            onClick={() => setView('jarvis')}
            aria-label="Open Jarvis"
            title={jarvisSourceLabel(lastJarvisSource)}
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
              busy ? 'border-signal text-signal shadow-[0_0_14px_rgba(233,237,242,0.4)]' : 'border-edge-strong text-haze hover:text-signal hover:border-signal/50'
            }`}
          >
            <Bot size={17} />
            {!busy && <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-[#0a0b0d] ${jarvisSourceColor(lastJarvisSource).dot}`} />}
          </button>
          {!busy && (
            <span className={`hidden shrink-0 items-center gap-1 pl-0.5 text-[9px] font-medium uppercase tracking-wider sm:flex ${jarvisSourceColor(lastJarvisSource).text}`}>
              {jarvisSourceLabel(lastJarvisSource)}
            </span>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a screenshot"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
              image ? 'border-ice/40 text-ice' : 'border-edge-strong text-haze hover:border-ice/40 hover:text-ice'
            }`}
          >
            <ImagePlus size={15} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && attachPhoto(e.target.files[0])}
          />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-ice outline-none placeholder:text-fog"
            placeholder={busy ? 'Jarvis is thinking…' : 'Jarvis — log, ask, plan… paste a screenshot (⌘V)'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            aria-label="Message Jarvis"
          />
          <button
            type="submit"
            aria-label="Send to Jarvis"
            disabled={(!input.trim() && !image) || busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b border border-white/15 from-[#2a2f38] to-[#08090d] text-ice transition-transform active:scale-95 disabled:opacity-35"
          >
            <SendHorizonal size={15} />
          </button>
        </form>
      </div>
    </div>
  )
}
