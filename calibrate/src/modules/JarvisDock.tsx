import { useRef, useState } from 'react'
import { Icon } from '../components/icons'
import { Eyebrow } from '../components/ui'
import { useStore } from '../store/store'
import { jarvisSourceColor, jarvisSourceLabel, useJarvis } from './Jarvis'

/**
 * Desktop command bar: talk to Jarvis from any screen — text, screenshots,
 * paste. Pinned flush to the bottom of the main column with a hairline top;
 * a floating rounded pill would read as a widget sitting on the page.
 */
export function JarvisDock() {
  const setView = useStore((s) => s.setView)
  const lastJarvis = useStore((s) => [...s.chat].reverse().find((m) => m.role === 'jarvis'))
  const lastJarvisSource = useStore((s) => s.lastJarvisSource)
  const { send, busy } = useJarvis()
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [flash, setFlash] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const attachPhotos = async (files: FileList | File[]) => {
    try {
      const { fileToDataURL } = await import('../lib/image')
      const urls = await Promise.all(Array.from(files).map((f) => fileToDataURL(f)))
      setImages((prev) => [...prev, ...urls].slice(0, 4))
    } catch {
      /* ignore bad files */
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.items)
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f)
    if (files.length) {
      e.preventDefault()
      void attachPhotos(files)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !images.length) return
    send(input, images.length ? images : undefined)
    setInput('')
    setImages([])
    setFlash(true)
    setTimeout(() => setFlash(false), 2600)
  }

  return (
    <div className="hidden shrink-0 border-t border-line px-10 py-3 lg:block">
      <div>
        <div>
          {flash && lastJarvis && (
            <button className="animate-lift mb-3 block w-full border border-line px-4 py-3 text-left" onClick={() => setView('jarvis')}>
              <Eyebrow className="mb-1.5">Jarvis</Eyebrow>
              <span className="line-clamp-2 text-body text-mute">{lastJarvis.text}</span>
            </button>
          )}

          {images.length > 0 && (
            <div className="animate-lift mb-3 flex items-center gap-3 border border-line p-2">
              {images.map((img, i) => (
                <img key={i} src={img} alt={`attachment ${i + 1} preview`} className="h-10 w-10 border border-line object-cover" />
              ))}
              <span className="flex-1 text-micro text-faint">
                {images.length > 1 ? `${images.length} screenshots` : 'Screenshot'} attached — ask Jarvis.
              </span>
              <button type="button" className="p-1 text-faint hover:text-paper" aria-label="Remove images" onClick={() => setImages([])}>
                <Icon name="close" size={13} />
              </button>
            </div>
          )}

          <form onSubmit={submit} className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setView('jarvis')}
              aria-label="Open Jarvis"
              title={jarvisSourceLabel(lastJarvisSource)}
              className={`relative p-1 transition-colors ${busy ? 'animate-breathe text-paper' : 'text-faint hover:text-paper'}`}
            >
              <Icon name="jarvis" size={16} />
              {!busy && (
                <span className={`absolute right-0 top-0 h-1 w-1 ${jarvisSourceColor(lastJarvisSource).dot}`} aria-hidden="true" />
              )}
            </button>

            {!busy && (
              <span className={`eyebrow hidden shrink-0 sm:block ${jarvisSourceColor(lastJarvisSource).text}`}>
                {jarvisSourceLabel(lastJarvisSource)}
              </span>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a screenshot"
              className={`p-1 transition-colors ${images.length ? 'text-paper' : 'text-faint hover:text-paper'}`}
            >
              <Icon name="image" size={15} />
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files?.length && void attachPhotos(e.target.files)}
            />

            <input
              className="min-w-0 flex-1 bg-transparent text-body text-paper outline-none placeholder:text-faint"
              placeholder={busy ? 'Thinking…' : 'Log, ask, or restructure — paste a screenshot, ⌘K for the palette'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              aria-label="Message Jarvis"
            />

            <button
              type="submit"
              aria-label="Send to Jarvis"
              disabled={(!input.trim() && !images.length) || busy}
              className="p-1 text-faint transition-colors hover:text-paper disabled:opacity-30"
            >
              <Icon name="send" size={15} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
