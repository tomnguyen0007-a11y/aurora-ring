import { Bot, ImagePlus, KeyRound, Mic, MicOff, SendHorizonal, Trash2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createDictation, createSpeechStream, speak, stopSpeaking, type Dictation, type SpeechProviders } from '../lib/speech'
import { runLocalEngine } from '../lib/jarvis/engine'
import { tryLocalFoodLog } from '../lib/jarvis/nutrition'
import { AllProvidersRateLimitedError, getProviderChain, llmConfigured, providerLabel, runLlm, runLlmStream } from '../lib/jarvis/llm'
import { buildJarvisContext } from '../lib/jarvis/context'
import { useStore } from '../store/store'
import type { CalibrateState } from '../store/store'

/** Short human label for the brain that handled the last exchange — used by both the full Jarvis view and the desktop dock. */
export function jarvisSourceLabel(source: CalibrateState['lastJarvisSource']): string {
  if (source === 'local') return 'LOCAL · FREE'
  if (source === 'rate-limited') return 'RATE-LIMITED'
  if (source) return providerLabel(source).toUpperCase()
  return llmConfigured() ? 'UNIFIED BRAIN' : 'LOCAL ENGINE · FREE'
}

/** Semantic dot/text color pair for the same source — literal class names so Tailwind's scanner picks them up. */
export function jarvisSourceColor(source: CalibrateState['lastJarvisSource']): { dot: string; text: string } {
  if (source === 'local') return { dot: 'bg-affirm', text: 'text-affirm' }
  if (source === 'rate-limited') return { dot: 'bg-alert', text: 'text-alert' }
  if (source) return { dot: 'bg-arc', text: 'text-arc' }
  return { dot: 'bg-signal-dim', text: 'text-signal-dim' }
}

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
  const setLastJarvisSource = useStore((s) => s.setLastJarvisSource)
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
  const send = async (text: string, images?: string[]) => {
    const t = text.trim()
    const imgs = images?.length ? images : undefined
    if ((!t && !imgs) || busy) return

    stopSpeaking() // barge-in: a new query silences the previous reply

    pushChat({ role: 'user', text: t || (imgs && imgs.length > 1 ? `(${imgs.length} photos)` : '(photo)'), images: imgs })

    const ctx = buildJarvisContext(t)

    if (!imgs) {
      const localResult = runLocalEngine(t, ctx.userName)
      if (localResult) {
        pushChat({ role: 'jarvis', text: localResult.reply, acted: localResult.receipts })
        say(localResult.reply)
        setLastJarvisSource('local')
        return
      }

      // Multi-item / portioned food messages resolve from REAL nutrition data
      // (food DB + Open Food Facts) with no language model at all — instant,
      // free, and identical quality regardless of which brain is configured.
      const foodResult = await tryLocalFoodLog(t)
      if (foodResult) {
        pushChat({ role: 'jarvis', text: foodResult.reply, acted: foodResult.receipts })
        say(foodResult.reply)
        setLastJarvisSource('local')
        return
      }
    }

    // Check the chain for THIS request — a photo needs a vision-capable provider,
    // which may exclude the chosen primary (Groq has none) but still succeed via
    // another configured provider automatically.
    if (getProviderChain({ needsVision: !!imgs }).length === 0) {
      const fallback = imgs
        ? llmConfigured()
          ? `None of your configured brains read photos, sir — Groq doesn't support vision. Add a Gemini, Anthropic or OpenRouter key in Settings for this one, or describe what's in the photo and I'll work from that.`
          : `I need a brain to see photos, sir. Add a free Gemini, Anthropic or OpenRouter key in Settings and I can read images for you.`
        : `That one needs my full brain, sir. The built-in engine handles logging, lists and stats — for strategy, planning and open conversation, add a free Gemini or Groq key in Settings.`
      pushChat({ role: 'jarvis', text: fallback })
      say(fallback)
      return
    }

    setBusy(true)
    const providers = speechProviders()
    const voice = providers ? createSpeechStream(providers) : null

    try {
      const res = await runLlmStream(t || (imgs && imgs.length > 1 ? 'What do you make of these photos?' : 'What do you make of this?'), ctx, imgs, {
        onDelta: (delta, full) => {
          setDraft(full)
          voice?.push(delta)
        },
      })
      pushChat({ role: 'jarvis', text: res.reply, acted: res.receipts })
      setLastJarvisSource(res.provider ?? null)
      void voice?.end()
    } catch (streamErr) {
      voice?.cancel()
      if (streamErr instanceof AllProvidersRateLimitedError) {
        setLastJarvisSource('rate-limited')
        const msg = `Every configured brain has hit its free-tier rate limit, sir — retry in about ${streamErr.retryInSec}s, or the local engine still handles logging and lookups instantly.`
        pushChat({ role: 'jarvis', text: msg })
        say(msg)
        setDraft(null)
        setBusy(false)
        return
      }
      // Streaming failed (proxy/CORS/transient) — retry once via the non-streaming path
      try {
        const res = await runLlm(t || (imgs && imgs.length > 1 ? 'What do you make of these photos?' : 'What do you make of this?'), ctx, imgs)
        pushChat({ role: 'jarvis', text: res.reply, acted: res.receipts })
        setLastJarvisSource(res.provider ?? null)
        say(res.reply)
      } catch (e) {
        if (e instanceof AllProvidersRateLimitedError) {
          setLastJarvisSource('rate-limited')
          const msg = `Every configured brain has hit its free-tier rate limit, sir — retry in about ${e.retryInSec}s, or the local engine still handles logging and lookups instantly.`
          pushChat({ role: 'jarvis', text: msg })
          say(msg)
        } else {
          pushChat({
            role: 'jarvis',
            text: `Connection issue with the advanced brain: ${e instanceof Error ? e.message : 'unknown error'}. Check the API key in Settings.`,
          })
        }
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
  const [images, setImages] = useState<string[]>([])
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<Dictation | null>(null)

  const MAX_PHOTOS = 4
  const attachPhotos = async (files: FileList | File[]) => {
    try {
      const { fileToDataURL } = await import('../lib/image')
      const urls = await Promise.all(Array.from(files).map((f) => fileToDataURL(f)))
      setImages((prev) => [...prev, ...urls].slice(0, MAX_PHOTOS))
    } catch {
      /* ignore bad files */
    }
  }

  // Paste a screenshot straight into the conversation (desktop: Cmd/Ctrl+V)
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

    const { openaiKey, elevenKey, geminiKey } = useStore.getState().settings
    const rec = createDictation(
      { openaiKey, elevenKey, geminiKey },
      (text) => send(text),
      () => setListening(false),
      (message) => s.pushChat({ role: 'jarvis', text: message }),
    )

    if (!rec) {
      // No native recognition (iPhone) and no transcription key configured
      s.pushChat({
        role: 'jarvis',
        text: 'Voice input needs a transcription brain on this device, sir. Add an OpenAI, ElevenLabs or Gemini key in Settings and I will hear you perfectly.',
      })
      return
    }

    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    send(input, images.length ? images : undefined)
    setInput('')
    setImages([])
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
            <p className="hud-label !mb-0 mt-1 flex items-center gap-1.5 !text-[8px]">
              {!listening && !busy && <span className={`h-1.5 w-1.5 rounded-full ${jarvisSourceColor(s.lastJarvisSource).dot}`} />}
              {listening ? 'LISTENING…' : busy ? 'THINKING…' : jarvisSourceLabel(s.lastJarvisSource)}
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

      <div className="glass flex-1 space-y-3 overflow-y-auto overscroll-contain rounded-2xl p-4">
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
              {(m.images?.length || m.image) && (
                <div className={`mb-2 grid gap-1.5 ${(m.images?.length ?? 1) > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {(m.images ?? (m.image ? [m.image] : [])).map((img, i) => (
                    <img key={i} src={img} alt={`attached reference ${i + 1}`} className="max-h-56 w-full rounded-lg object-cover" />
                  ))}
                </div>
              )}
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

      {images.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-arc/30 bg-arc/[0.05] p-2">
          <div className="flex gap-1.5">
            {images.map((img, i) => (
              <span key={i} className="relative">
                <img src={img} alt={`attachment ${i + 1} preview`} className="h-14 w-14 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/85 text-haze ring-1 ring-edge"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <span className="min-w-0 flex-1 text-xs text-haze">
            {images.length > 1 ? `${images.length} photos attached` : 'Photo attached'} — ask Jarvis, or say “log these”.
          </span>
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? 'Stop listening' : 'Speak to Jarvis'}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all ${
            listening
              ? 'border-ice/50 bg-white/10 text-ice shadow-[0_0_18px_rgba(234,244,255,0.5)] animate-pulse-soft'
              : 'border-edge-strong bg-black/30 text-haze hover:border-ice/40 hover:text-ice'
          }`}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a photo"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all ${
            images.length ? 'border-arc bg-arc/20 text-arc' : 'border-edge-strong bg-black/30 text-haze hover:border-arc/50 hover:text-ice'
          }`}
        >
          <ImagePlus size={18} />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && attachPhotos(e.target.files)}
        />

        <input
          className="field h-11 flex-1 !rounded-full !px-4"
          placeholder={listening ? 'Listening…' : images.length > 1 ? 'Ask about the photos…' : images.length ? 'Ask about the photo…' : 'Speak or type to Jarvis…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          aria-label="Message Jarvis"
        />

        <button
          type="submit"
          aria-label="Send"
          disabled={(!input.trim() && !images.length) || busy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-b from-[#2a2f38] to-[#08090d] text-ice shadow-[0_0_18px_rgba(234,244,255,0.3),0_6px_20px_-6px_rgba(0,0,0,0.8)] transition-all disabled:opacity-50"
        >
          <SendHorizonal size={18} />
        </button>
      </form>
    </div>
  )
}
