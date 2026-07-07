// ————————————————————————————————————————————————————————
// JARVIS VOICE — fluid, low-latency, film-grade pacing
//
// Priority: ElevenLabs (flash model, ~75ms TTFB) → OpenAI TTS → Web Speech API.
//
// Why it flows now:
// - Sentences are synthesized AHEAD of playback (prefetch pipeline): while
//   sentence N plays, N+1..N+2 are already being fetched. No dead air.
// - Streaming entry point (createSpeechStream) lets the LLM's reply be spoken
//   sentence-by-sentence AS IT ARRIVES, instead of waiting for the full text.
// - No artificial setTimeout pauses between chunks — natural pauses are already
//   baked into the synthesized audio; injected silence is what made it robotic.
// ————————————————————————————————————————————————————————

// ——— shared audio state ———

let audioCtx: AudioContext | null = null
let activeSource: AudioBufferSourceNode | null = null
let generation = 0 // bumped by stopSpeaking(); stale playback checks and aborts

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctor()
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis || (window as unknown as { webkitSpeechSynthesis?: SpeechSynthesis }).webkitSpeechSynthesis || null
}

// ——— sentence chunking ———

/**
 * Split text into speakable sentences. Merges fragments shorter than ~24 chars
 * into their neighbor so we don't fire a network round-trip for "Right."
 */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []

  const raw = cleaned.split(/(?<=[.!?…])\s+/)
  const out: string[] = []
  let current = ''

  for (const part of raw) {
    current = current ? `${current} ${part}` : part
    if (current.length >= 24) {
      out.push(current)
      current = ''
    }
  }
  if (current) {
    if (out.length && current.length < 24) out[out.length - 1] += ' ' + current
    else out.push(current)
  }
  return out
}

/** Strip markdown/code noise that sounds terrible spoken aloud. */
function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // fenced code blocks (incl. action JSON)
    .replace(/[*_#`>|]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// ——— providers: each synthesizes ONE sentence to an ArrayBuffer ———

const ELEVEN_DEFAULT_VOICE = 'onwK4e9ZLuTAKqWW03F9' // "Daniel" — composed British

async function fetchEleven(text: string, key: string, voiceId?: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId || ELEVEN_DEFAULT_VOICE}?optimize_streaming_latency=3`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5', // lowest-latency ElevenLabs model
      voice_settings: { stability: 0.5, similarity_boost: 0.85, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
  return res.arrayBuffer()
}

async function fetchOpenAI(text: string, key: string): Promise<ArrayBuffer> {
  const call = (model: string, instructions?: string) =>
    fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        voice: 'onyx', // deep, composed
        input: text,
        speed: 1.0,
        ...(instructions ? { instructions } : {}),
      }),
    })

  let res = await call('gpt-4o-mini-tts', 'Speak as a refined, composed British butler — measured, warm, articulate, never rushed.')
  if (!res.ok) res = await call('tts-1') // account may not have the newer model
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}`)
  return res.arrayBuffer()
}

/** Play one decoded buffer; resolves when finished. Respects stop-generation. */
async function playBuffer(buf: ArrayBuffer, gen: number): Promise<void> {
  if (gen !== generation) return
  const ctx = getAudioContext()
  const audio = await ctx.decodeAudioData(buf.slice(0))
  if (gen !== generation) return

  await new Promise<void>((resolve) => {
    const source = ctx.createBufferSource()
    source.buffer = audio
    source.connect(ctx.destination)
    source.onended = () => {
      if (activeSource === source) activeSource = null
      resolve()
    }
    activeSource = source
    source.start(0)
  })
}

// ——— browser Web Speech fallback ———

function pickBrowserVoice(voiceURI: string): SpeechSynthesisVoice | null {
  const synth = getSpeechSynthesis()
  if (!synth) return null
  const voices = synth.getVoices()
  if (!voices.length) return null
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI)
    if (chosen) return chosen
  }
  // Auto: prefer a British male-sounding en voice, then any en-GB, then any en
  const enGb = voices.filter((v) => /en[-_]GB/i.test(v.lang))
  return (
    enGb.find((v) => /daniel|james|arthur|male/i.test(v.name)) ??
    enGb[0] ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    voices[0]
  )
}

function speakBrowserSentence(text: string, voiceURI: string, gen: number): Promise<void> {
  const synth = getSpeechSynthesis()
  if (!synth || gen !== generation) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const voice = pickBrowserVoice(voiceURI)
    if (voice) u.voice = voice
    u.rate = 1.02 // natural conversational clip — slower rates read as robotic
    u.pitch = 0.92
    u.volume = 1
    u.onend = () => resolve()
    u.onerror = () => resolve()
    synth.speak(u)
  })
}

// ——— the speech queue: sequential playback, prefetched synthesis ———

export interface SpeechProviders {
  voiceURI?: string
  eleven?: { key: string; voiceId?: string }
  openaiKey?: string
}

interface QueueJob {
  text: string
  fetched?: Promise<ArrayBuffer> // synthesis kicked off at enqueue time (prefetch)
}

/**
 * A live speech stream: push text fragments as they arrive (LLM deltas),
 * complete sentences are synthesized immediately and played in order.
 */
export interface SpeechStream {
  push: (delta: string) => void
  /** Flush any buffered partial sentence and resolve when all audio finishes. */
  end: () => Promise<void>
  cancel: () => void
}

export function createSpeechStream(providers: SpeechProviders): SpeechStream {
  const gen = generation
  const queue: QueueJob[] = []
  let buffer = ''
  let ended = false
  let draining = false
  let doneResolve: (() => void) | null = null

  const useEleven = !!providers.eleven?.key
  const useOpenAI = !useEleven && !!providers.openaiKey

  const synthesize = (text: string): Promise<ArrayBuffer> | undefined => {
    if (useEleven) return fetchEleven(text, providers.eleven!.key, providers.eleven!.voiceId).catch(() => Promise.reject(new Error('tts')))
    if (useOpenAI) return fetchOpenAI(text, providers.openaiKey!).catch(() => Promise.reject(new Error('tts')))
    return undefined // browser path synthesizes at play time
  }

  const drain = async () => {
    if (draining) return
    draining = true
    while (queue.length) {
      if (gen !== generation) break
      const job = queue.shift()!
      try {
        if (job.fetched) {
          await playBuffer(await job.fetched, gen)
        } else {
          await speakBrowserSentence(job.text, providers.voiceURI ?? '', gen)
        }
      } catch {
        // synthesis failed for this sentence → speak it via browser so nothing is lost
        try {
          await speakBrowserSentence(job.text, providers.voiceURI ?? '', gen)
        } catch {
          /* give up on this sentence only */
        }
      }
    }
    draining = false
    if (ended && !queue.length && doneResolve) doneResolve()
  }

  const enqueue = (sentence: string) => {
    const text = sentence.trim()
    if (!text || gen !== generation) return
    queue.push({ text, fetched: synthesize(text) })
    void drain()
  }

  return {
    push(delta: string) {
      if (ended || gen !== generation) return
      buffer += delta
      // Extract every complete sentence currently in the buffer; keep the tail.
      const clean = speakable(buffer)
      const parts = clean.split(/(?<=[.!?…])\s+/)
      if (parts.length > 1) {
        const complete = parts.slice(0, -1).join(' ')
        for (const s of splitSentences(complete)) enqueue(s)
        // Keep the raw (unspoken) tail — find it in the original buffer
        const tail = parts[parts.length - 1]
        buffer = tail
      }
    },
    end() {
      if (ended) return Promise.resolve()
      ended = true
      const rest = speakable(buffer)
      buffer = ''
      if (rest) for (const s of splitSentences(rest)) enqueue(s)
      if (!queue.length && !draining) return Promise.resolve()
      return new Promise<void>((resolve) => {
        doneResolve = resolve
      })
    },
    cancel() {
      ended = true
      queue.length = 0
      buffer = ''
    },
  }
}

// ——— public API ———

export function speechSupported(): boolean {
  return (
    (typeof window !== 'undefined' && !!(window.speechSynthesis || (window as unknown as { webkitSpeechSynthesis?: unknown }).webkitSpeechSynthesis)) ||
    typeof AudioContext !== 'undefined'
  )
}

/** English browser voices for the Web Speech API fallback picker in Settings. */
export function englishVoices(): SpeechSynthesisVoice[] {
  const synth = getSpeechSynthesis()
  if (!synth) return []
  return synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
}

export function stopSpeaking(): void {
  generation += 1
  if (activeSource) {
    try {
      activeSource.stop()
    } catch {
      /* already stopped */
    }
    activeSource = null
  }
  const synth = getSpeechSynthesis()
  if (synth) synth.cancel()
}

/**
 * Speak a complete text. Same fluid pipeline as streaming — sentences are
 * prefetched ahead of playback, so long replies start speaking immediately.
 */
export async function speak(
  text: string,
  voiceURI?: string,
  elevenLabs?: { key: string; voiceId?: string },
  openaiKey?: string,
): Promise<void> {
  const clean = speakable(text)
  if (!clean) return
  const stream = createSpeechStream({ voiceURI, eleven: elevenLabs, openaiKey })
  stream.push(clean + ' ')
  await stream.end()
}

// ——— speech recognition (input) ———

type RecognizerCallback = (text: string) => void
type RecognizerEndCallback = () => void

export function createRecognizer(onResult: RecognizerCallback, onEnd: RecognizerEndCallback) {
  const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }
  const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!SpeechRecognitionCtor) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition = new (SpeechRecognitionCtor as any)()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'

  let finalTranscript = ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' '
    }
    if (finalTranscript.trim()) {
      onResult(finalTranscript.trim())
      finalTranscript = ''
    }
  }
  recognition.onerror = () => onEnd()
  recognition.onend = () => onEnd()

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  }
}
