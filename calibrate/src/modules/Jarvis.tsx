import { Bot, ImagePlus, KeyRound, Mic, MicOff, SendHorizonal, Trash2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createRecognizer, createSpeechStream, speak, speechSupported, stopSpeaking, type SpeechProviders } from '../lib/speech'
import { runLocalEngine } from '../lib/jarvis/engine'
import { llmConfigured, runLlm, runLlmStream } from '../lib/jarvis/llm'
import { buildJarvisContext } from '../lib/jarvis/context'
import { useStore } from '../store/store'

const SUGGESTIONS = [
  'log 30 min putting',
  "what's next?",
  'fix my 37% fairways',
  'macros for a lift day?',
  'plan my golf week',
  'remember I prefer morning runs',
]

function speechProviders(): SpeechProviders | null {
  const { speakReplies, voiceURI, elevenKey, elevenVoiceId, openaiKey } = useStore.getState().settings
  if (!speakReplies) return null
  return {
    voiceURI,
    eleven: elevenKey ? { key: elevenKey, voiceId: elevenVoiceId } : undefined,
    openaiKey,
  }
}

export function useJarvis() {
  const pushChat = useStore((s) => s.pushChat)
  const [busy, setBusy] = useState(false)
  // Live streaming reply — rendered as a growing bubble before it's committed to the store
  const [draft, setDraft] = useState<string | null>(null)

  const say = (text: string) => {
    const p = speechProviders()
    if (p) void speak(text, p.voiceURI, p.eleven, p.openaiKey)
  }

  /**
   * UNIFIED JARVIS PIPELINE
   *
   * 1. Build unified context (once, shared across all paths)
   * 2. Local engine first — instant, grounded, free
   * 3. Otherwise stream from the LLM: text renders token-by-token and is
   *    SPOKEN sentence-by-sentence while the model is still thinking.
   * 4. Actions execute after the stream completes; receipts attach to the reply.
   */
  const send = async (text: string, image?: string) => {
    const t = text.trim()
    if ((!t && !image) || busy) return

    stopSpeaking() // barge-in: a new query silences the previous reply

    pushChat({ role: 'user', text: t || '(photo)', image })

    const ctx = buildJarvisContext(t)

    if (!image) {
      const localResult = runLocalEngine(t, ctx.userName)
      if (localResult) {
        pushChat({ role: 'jarvis', text: localResult.reply, acted: localResult.receipts })
        say(localResult.reply)
        return
      }
    }

    if (!llmConfigured()) {
      const fallback = image
        ? `I need my full brain to see photos, sir. Add a free Gemini key or an Anthropic key in Settings and I can read images for you.`
        : `That one needs my full brain, sir. The built-in engine handles logging, lists and stats — for strategy, planning and open conversation, add a free Gemini key or an Anthropic key in Settings.`
      pushChat({ role: 'jarvis', text: fallback })
      say(fallback)
      return
    }

    setBusy(true)
    const providers = speechProviders()
    const voice = providers ? createSpeechStream(providers) : null

    try {
      const res = await runLlmStream(t || 'What do you make of this?', ctx, image, {
        onDelta: (delta, full) => {
          setDraft(full)
          voice?.push(delta)
        },
      })
      pushChat({ role: 'jarvis', text: res.reply, acted: res.receipts })
      void voice?.end()
    } catch {
      voice?.cancel()
      // Streaming failed (proxy/CORS/transient) — retry once via the non-streaming path
      try {
        const res = await runLlm(t || 'What do you make of this?', ctx, image)
        pushChat({ role: 'jarvis', text: res.reply, acted: res.receipts })
        say(res.reply)
      } catch (e) {
        pushChat({
          role: 'jarvis',
          text: `Connection issue with the advanced brain: ${e instanceof Error ? e.message : 'unknown error'}. Check the API key in Settings.`,
        })
      }
    } finally {
      setDraft(null)
      setBusy(false)
    }
  }

  return { send, busy, draft }
}

export function Jarvis() {
  const s = useStore()
  const { send, busy, draft } = useJarvis()
  const [input, setInput] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null)

  const attachPhoto = async (file: File) => {
    try {
      const { fileToDataURL } = await import('../lib/image')
      setImage(await fileToDataURL(file))
    } catch {
      /* ignore bad files */
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [s.chat.length, busy, draft])

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }

    stopSpeaking()

    const rec = createRecognizer(
      (text) => send(text),
      () => setListening(false),
    )

    if (!rec) return

    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    send(input, image ?? undefined)
    setInput('')
    setImage(null)
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-3xl flex-col lg:h-[calc(100dvh-5rem)]">
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div
            className={`relative flex h-11 w-11 items-center justify-center rounded-full border ${
              busy || listening ? 'border-ice/50 shadow-[0_0_20px_rgba(234,244,255,0.45)]' : 'border-edge-strong'
            }`}
          >
            <Bot size={20} className={busy || listening ? 'text-ice' : 'text-haze'} />
            {(busy || listening) && <span className="absolute inset-0 animate-ping rounded-full border border-ice/40" />}
          </div>
          <div>
            <h1 className="h-lumen text-2xl font-bold leading-none tracking-wide">JARVIS</h1>
            <p className="hud-label !mb-0 mt-1 !text-[8px]">
              {listening ? 'LISTENING…' : busy ? 'THINKING…' : llmConfigured() ? 'UNIFIED BRAIN' : 'LOCAL ENGINE · FREE'}
            </p>
          </div>
        </div>

        <div className="flex gap-1">
          {!llmConfigured() && (
            <button className="btn !py-1.5 !text-xs" onClick={() => s.setView('settings')}>
              <KeyRound size={13} /> Unlock brain
            </button>
          )}
          <button className="btn btn-ghost !px-2.5" aria-label="Stop speaking" onClick={stopSpeaking}>
            <VolumeX size={16} />
          </button>
          {s.chat.length > 0 && (
            <button className="btn btn-ghost !px-2.5" aria-label="Clear conversation" onClick={s.clearChat}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="glass flex-1 space-y-3 overflow-y-auto rounded-2xl p-4">
        {!s.chat.length && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="max-w-sm text-sm leading-relaxed text-haze">
              At your service, {s.settings.userName}. I know your plan, your philosophy and your numbers — golf,
              training, fuel, AURORA. I can log, edit, strategise and remember. Speak or type.
            </p>
            <div className="flex max-w-md flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((sg) => (
                <button key={sg} className="btn !py-1.5 !text-xs" onClick={() => send(sg)}>
                  {sg}
                </button>
              ))}
            </div>
          </div>
        )}

        {s.chat.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.925rem] leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-md bg-white/[0.08] text-ice ring-1 ring-white/15'
                  : 'rounded-bl-md bg-black/35 text-ice/95 ring-1 ring-edge'
              }`}
            >
              {m.image && <img src={m.image} alt="attached reference" className="mb-2 max-h-56 w-full rounded-lg object-cover" />}
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.acted && m.acted.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-edge pt-2">
                  {m.acted.map((a, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs text-affirm">
                      <span className="inline-block h-1 w-1 rounded-full bg-affirm" /> {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        {busy && draft && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-black/35 px-4 py-2.5 text-[0.925rem] leading-relaxed text-ice/95 ring-1 ring-edge">
              <div className="whitespace-pre-wrap">
                {draft}
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse-soft rounded-full bg-ice/80 align-middle" />
              </div>
            </div>
          </div>
        )}

        {busy && !draft && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-black/35 px-4 py-3 ring-1 ring-edge">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ice"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {image && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-arc/30 bg-arc/[0.05] p-2">
          <img src={image} alt="attachment preview" className="h-14 w-14 rounded-lg object-cover" />
          <span className="flex-1 text-xs text-haze">Photo attached — ask Jarvis about it.</span>
          <button type="button" className="btn btn-ghost !px-2" aria-label="Remove photo" onClick={() => setImage(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        {speechSupported() && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? 'Stop listening' : 'Speak to Jarvis'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all ${
              listening
                ? 'border-ice/50 bg-white/10 text-ice shadow-[0_0_18px_rgba(234,244,255,0.5)]'
                : 'border-edge-strong bg-black/30 text-haze hover:border-ice/40 hover:text-ice'
            }`}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a photo"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all ${
            image ? 'border-arc bg-arc/20 text-arc' : 'border-edge-strong bg-black/30 text-haze hover:border-arc/50 hover:text-ice'
          }`}
        >
          <ImagePlus size={18} />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && attachPhoto(e.target.files[0])}
        />

        <input
          className="field h-11 flex-1 !rounded-full !px-4"
          placeholder={listening ? 'Listening…' : image ? 'Ask about the photo…' : 'Speak or type to Jarvis…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message Jarvis"
        />

        <button
          type="submit"
          aria-label="Send"
          disabled={(!input.trim() && !image) || busy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-b from-[#2a2f38] to-[#08090d] text-ice shadow-[0_0_18px_rgba(234,244,255,0.3),0_6px_20px_-6px_rgba(0,0,0,0.8)] transition-all disabled:opacity-50"
        >
          <SendHorizonal size={18} />
        </button>
      </form>
    </div>
  )
}
