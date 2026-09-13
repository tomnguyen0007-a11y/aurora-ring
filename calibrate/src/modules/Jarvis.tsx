import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/icons'
import { Eyebrow, Page, Scroller, Tools } from '../components/ui'
import { takePendingAsk } from '../lib/ask'
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

/**
 * Monochrome status pair for the same source. The palette has no hue, so state
 * is carried by weight: a live brain reads bright, a degraded one recedes.
 * Literal class names so Tailwind's scanner picks them up.
 */
export function jarvisSourceColor(source: CalibrateState['lastJarvisSource']): { dot: string; text: string } {
  if (source === 'local') return { dot: 'bg-paper', text: 'text-mute' }
  if (source === 'rate-limited') return { dot: 'bg-ghost', text: 'text-faint' }
  if (source) return { dot: 'bg-paper', text: 'text-mute' }
  return { dot: 'bg-faint', text: 'text-faint' }
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


const MAX_PHOTOS = 4

export function Jarvis({ label }: { label: string }) {
  const s = useStore()
  const { send, busy, draft } = useJarvis()
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<Dictation | null>(null)

  // A question parked by the ⌘K palette gets answered the moment this mounts.
  useEffect(() => {
    const q = takePendingAsk()
    if (q) void send(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        text: 'Voice input needs a transcription brain on this device. Add an OpenAI, ElevenLabs or Gemini key in Settings and I will hear you.',
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

  const status = listening ? 'Listening…' : busy ? 'Thinking…' : jarvisSourceLabel(s.lastJarvisSource)

  return (
    <Page
      fill
      title={label}
      lede={
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 shrink-0 ${jarvisSourceColor(s.lastJarvisSource).dot} ${
              busy || listening ? 'animate-breathe' : ''
            }`}
          />
          <span className={jarvisSourceColor(s.lastJarvisSource).text}>{status}</span>
        </span>
      }
      actions={
        <Tools>
          {!llmConfigured() && (
            <button className="btn btn-sm" onClick={() => s.setView('settings')}>
              Unlock brain
            </button>
          )}
          <button className="btn btn-sm" aria-label="Stop speaking" onClick={stopSpeaking}>
            Silence
          </button>
          {s.chat.length > 0 && (
            <button className="btn btn-sm" aria-label="Clear conversation" onClick={s.clearChat}>
              Clear
            </button>
          )}
        </Tools>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="no-bar flex-1 overflow-y-auto overscroll-contain">
          {!s.chat.length && (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <p className="max-w-md text-lede leading-relaxed text-mute">
                At your service, {s.settings.userName}. I know your plan, your philosophy and your numbers — golf,
                training, fuel, Aurora. I can log, edit, strategise and remember.
              </p>
              <Scroller className="max-w-xl justify-center">
                {SUGGESTIONS.map((sg) => (
                  <button key={sg} className="btn btn-sm shrink-0" onClick={() => send(sg)}>
                    {sg}
                  </button>
                ))}
              </Scroller>
            </div>
          )}

          {s.chat.map((m) => (
            <div key={m.id} className="border-b border-line py-5 last:border-b-0">
              <Eyebrow className="mb-2">{m.role === 'user' ? s.settings.userName || 'You' : 'Jarvis'}</Eyebrow>
              {(m.images?.length || m.image) && (
                <div className={`mb-3 grid max-w-md gap-1.5 ${(m.images?.length ?? 1) > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {(m.images ?? (m.image ? [m.image] : [])).map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`attached reference ${i + 1}`}
                      className="max-h-56 w-full border border-line object-cover"
                    />
                  ))}
                </div>
              )}
              <div
                className={`max-w-2xl whitespace-pre-wrap text-lede leading-relaxed ${
                  m.role === 'user' ? 'text-mute' : 'text-paper'
                }`}
              >
                {m.text}
              </div>
              {m.acted && m.acted.length > 0 && (
                <ul className="mt-3 border-t border-line pt-3">
                  {m.acted.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 py-0.5 text-micro text-faint">
                      <span className="inline-block h-1 w-1 shrink-0 bg-paper" /> {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {busy && draft && (
            <div className="border-b border-line py-5">
              <Eyebrow className="mb-2">Jarvis</Eyebrow>
              <div className="max-w-2xl whitespace-pre-wrap text-lede leading-relaxed text-paper">
                {draft}
                <span className="ml-0.5 inline-block h-4 w-px animate-breathe bg-paper align-middle" />
              </div>
            </div>
          )}

          {busy && !draft && (
            <div className="py-5">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1 w-1 animate-breathe bg-faint" style={{ animationDelay: `${i * 0.25}s` }} />
                ))}
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {images.length > 0 && (
          <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
            <div className="flex gap-1.5">
              {images.map((img, i) => (
                <span key={i} className="relative">
                  <img src={img} alt={`attachment ${i + 1} preview`} className="h-14 w-14 border border-line object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center border border-line bg-ink text-faint hover:text-paper"
                  >
                    <Icon name="close" size={10} />
                  </button>
                </span>
              ))}
            </div>
            <span className="min-w-0 flex-1 text-micro text-faint">
              {images.length > 1 ? `${images.length} photos attached` : 'Photo attached'} — ask, or say “log these”.
            </span>
          </div>
        )}

        <form onSubmit={submit} className="mt-4 flex items-center gap-2.5 border-t border-line pt-4">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? 'Stop listening' : 'Speak to Jarvis'}
            className={`p-1.5 transition-colors ${listening ? 'animate-breathe text-paper' : 'text-faint hover:text-paper'}`}
          >
            <Icon name="mic" size={17} />
          </button>

          <button
            type="button"
            onClick={() => {
              if (s.settings.speakReplies) stopSpeaking() // muting mid-reply cuts it off immediately, not just future ones
              s.setSettings({ speakReplies: !s.settings.speakReplies })
            }}
            aria-label={s.settings.speakReplies ? 'Mute Jarvis' : 'Unmute Jarvis'}
            aria-pressed={!s.settings.speakReplies}
            title={s.settings.speakReplies ? 'Jarvis speaks replies — tap to mute' : 'Jarvis is muted — tap to unmute'}
            className={`p-1.5 transition-colors ${s.settings.speakReplies ? 'text-faint hover:text-paper' : 'text-paper'}`}
          >
            <Icon name={s.settings.speakReplies ? 'speaker' : 'speakerOff'} size={17} />
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a photo"
            className={`p-1.5 transition-colors ${images.length ? 'text-paper' : 'text-faint hover:text-paper'}`}
          >
            <Icon name="image" size={16} />
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
            className="min-w-0 flex-1 bg-transparent text-lede text-paper outline-none placeholder:text-faint"
            placeholder={
              listening
                ? 'Listening…'
                : images.length > 1
                  ? 'Ask about the photos…'
                  : images.length
                    ? 'Ask about the photo…'
                    : 'Speak or type to Jarvis…'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            aria-label="Message Jarvis"
          />

          <button
            type="submit"
            aria-label="Send"
            disabled={(!input.trim() && !images.length) || busy}
            className="p-1.5 text-faint transition-colors hover:text-paper disabled:opacity-30"
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>
    </Page>
  )
}
