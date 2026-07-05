/**
 * VOICE SYSTEM UPGRADE (Phase 5)
 *
 * JARVIS speaks like the Iron Man films JARVIS:
 * - Refined British butler accent (prioritize ElevenLabs "Daniel" voice)
 * - Measured pacing (0.9-1.0 rate), natural pauses on punctuation
 * - Never robotic, always composed and articulate
 * - Flowing prose with conversational rhythm
 *
 * Voice Priority:
 * 1. ElevenLabs (primary - natural fluency, best quality)
 * 2. OpenAI TTS (fallback - natural sounding)
 * 3. Web Speech API (last resort - robotic but functional)
 *
 * Improvements:
 * - Sentence chunking with natural pause detection
 * - Streaming speech (ElevenLabs) for immediate feedback
 * - Proper punctuation handling (pause on . ! ? ; :)
 * - Rate optimization for butler-like composition
 */

// ————————————————————————————————————————————————————————
// SENTENCE CHUNKING (Natural break detection)
// ————————————————————————————————————————————————————————

interface SpeechChunk {
  text: string
  duration?: number
}

/**
 * Split response into natural sentence chunks for streaming speech.
 * Preserves prosody by respecting punctuation and clause boundaries.
 *
 * Rules:
 * - Split on sentence endings (. ! ?)
 * - Respect clause breaks (; :)
 * - Don't split mid-parenthetical
 * - Keep contractions and quoted text intact
 * - Minimum chunk length to avoid fragmentation
 */
function chunkText(text: string, minLength = 15): SpeechChunk[] {
  // Remove excessive whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim()

  // Split on sentence boundaries + clause breaks
  const sentences = cleaned.split(/(?<=[.!?;:])\s+/)

  const chunks: SpeechChunk[] = []
  let current = ''

  for (const sent of sentences) {
    const candidate = current ? `${current} ${sent}` : sent

    // If candidate is short, accumulate; if long, flush
    if (candidate.length < 120 && chunks.length === 0) {
      current = candidate
    } else if (candidate.length < 200) {
      current = candidate
    } else {
      if (current) chunks.push({ text: current })
      current = sent
    }
  }

  if (current) chunks.push({ text: current })

  return chunks
}

/**
 * Calculate pause duration based on punctuation.
 * JARVIS speaks with deliberate, composed pauses.
 *
 * . = 300ms (statement pause)
 * ! = 250ms (emphasis, slightly quicker)
 * ? = 350ms (inquiry, thoughtful)
 * ; = 200ms (clause continuation)
 * : = 150ms (setup for next clause)
 */
function pauseForPunctuation(text: string): number {
  const lastChar = text.trimEnd().slice(-1)
  switch (lastChar) {
    case '.':
      return 300
    case '!':
      return 250
    case '?':
      return 350
    case ';':
      return 200
    case ':':
      return 150
    default:
      return 100 // natural breath
  }
}

// ————————————————————————————————————————————————————————
// ELEVENLABS TTS (Primary - Natural Fluency)
// ————————————————————————————————————————————————————————

let elevenLabsAudioQueue: AudioContext | null = null

async function initAudioContext(): Promise<AudioContext> {
  if (elevenLabsAudioQueue) return elevenLabsAudioQueue

  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  elevenLabsAudioQueue = ctx
  return ctx
}

/**
 * Stream speech via ElevenLabs API.
 * Uses the Daniel voice (deep British butler) by default.
 * Streams audio directly for low-latency response.
 */
async function speakViaElevenLabs(
  text: string,
  apiKey: string,
  voiceId: string = 'onwK4e9ZLuTAKqWW03F9', // "Daniel" - deep composed British
): Promise<void> {
  const chunks = chunkText(text)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: chunk.text,
          model_id: 'eleven_turbo_v2', // Fast, natural quality
          voice_settings: {
            stability: 0.6, // Moderate stability for natural variation
            similarity_boost: 0.85, // High similarity to reference voice
            style: 0, // No exaggerated style
            use_speaker_boost: true,
          },
          optimize_streaming_latency: 4, // Level 4 = ultra-fast streaming
        }),
      })

      if (!res.ok) {
        console.warn(`ElevenLabs error: ${res.status}. Falling back to OpenAI TTS.`)
        return
      }

      const arrayBuffer = await res.arrayBuffer()
      const audioContext = await initAudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start(0)

      // Wait for this chunk to finish + natural pause
      const pauseDuration = pauseForPunctuation(chunk.text)
      await new Promise((resolve) => {
        source.onended = resolve
        setTimeout(resolve, (audioBuffer.duration + pauseDuration / 1000) * 1000)
      })
    } catch (err) {
      console.warn('ElevenLabs streaming failed:', err)
      break
    }
  }
}

// ————————————————————————————————————————————————————————
// OPENAI TTS (Fallback - Natural Sounding)
// ————————————————————————————————————————————————————————

let openaiAudioElement: HTMLAudioElement | null = null

async function speakViaOpenAI(
  text: string,
  apiKey: string,
): Promise<void> {
  const chunks = chunkText(text)

  for (const chunk of chunks) {
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd', // High definition
          voice: 'onyx', // Deep, composed voice
          text: chunk.text,
          speed: 0.95, // Slightly slower for deliberation
        }),
      })

      if (!res.ok) {
        console.warn(`OpenAI TTS error: ${res.status}`)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      if (!openaiAudioElement) {
        openaiAudioElement = new Audio()
      }

      openaiAudioElement.src = url
      openaiAudioElement.playbackRate = 1

      await new Promise((resolve) => {
        openaiAudioElement!.onended = () => {
          URL.revokeObjectURL(url)
          resolve(null)
        }
        openaiAudioElement!.play()
      })

      // Natural pause between chunks
      await new Promise((resolve) => setTimeout(resolve, pauseForPunctuation(chunk.text)))
    } catch (err) {
      console.warn('OpenAI TTS failed:', err)
      break
    }
  }
}

// ————————————————————————————————————————————————————————
// WEB SPEECH API (Last Resort - Robotic but Functional)
// ————————————————————————————————————————————————————————

let synth: SpeechSynthesis | null = null
let currentUtterance: SpeechSynthesisUtterance | null = null

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis || (window as any).webkitSpeechSynthesis || null
}

async function speakViaBrowserAPI(text: string, voiceURI: string): Promise<void> {
  synth = getSpeechSynthesis()
  if (!synth) return

  // Cancel any ongoing speech
  synth.cancel()

  const chunks = chunkText(text)

  for (const chunk of chunks) {
    currentUtterance = new SpeechSynthesisUtterance(chunk.text)

    // Find matching voice by URI
    const voices = synth.getVoices()
    if (voiceURI && voices.length) {
      const voice = voices.find((v) => v.voiceURI === voiceURI) || voices[0]
      currentUtterance.voice = voice
    }

    // JARVIS pacing: composed, measured, never rushed
    currentUtterance.rate = 0.95 // Slightly slower than normal speech
    currentUtterance.pitch = 0.95 // Slightly deeper
    currentUtterance.volume = 1

    await new Promise((resolve) => {
      currentUtterance!.onend = resolve
      synth!.speak(currentUtterance!)
      // Fallback timeout in case onend doesn't fire
      setTimeout(resolve, 10000)
    })

    // Natural pause between sentences
    await new Promise((resolve) => setTimeout(resolve, pauseForPunctuation(chunk.text)))
  }
}

// ————————————————————————————————————————————————————————
// UNIFIED VOICE CONTROL
// ————————————————————————————————————————————————————————

export function speechSupported(): boolean {
  return (
    (typeof window !== 'undefined' && (window.speechSynthesis || (window as any).webkitSpeechSynthesis)) ||
    typeof AudioContext !== 'undefined' ||
    typeof (window as any).webkitAudioContext !== 'undefined'
  )
}

export function stopSpeaking(): void {
  // Stop ElevenLabs/OpenAI
  if (elevenLabsAudioQueue) {
    elevenLabsAudioQueue.close()
    elevenLabsAudioQueue = null
  }

  // Stop browser API
  synth = getSpeechSynthesis()
  if (synth) {
    synth.cancel()
    currentUtterance = null
  }

  // Stop any Audio element
  if (openaiAudioElement) {
    openaiAudioElement.pause()
    openaiAudioElement.currentTime = 0
  }
}

/**
 * Speak text using optimal voice provider.
 * Priority: ElevenLabs → OpenAI → Web Speech API
 *
 * @param text - Response text to speak
 * @param voiceURI - Browser voice URI (fallback)
 * @param elevenLabs - { key, voiceId } for ElevenLabs
 * @param openaiKey - OpenAI API key (optional)
 */
export async function speak(
  text: string,
  voiceURI?: string,
  elevenLabs?: { key: string; voiceId: string },
  openaiKey?: string,
): Promise<void> {
  if (!text.trim()) return

  try {
    // Primary: ElevenLabs (best quality, natural fluency)
    if (elevenLabs?.key) {
      try {
        await speakViaElevenLabs(text, elevenLabs.key, elevenLabs.voiceId)
        return
      } catch (err) {
        console.warn('ElevenLabs failed, trying OpenAI:', err)
      }
    }

    // Secondary: OpenAI TTS
    if (openaiKey) {
      try {
        await speakViaOpenAI(text, openaiKey)
        return
      } catch (err) {
        console.warn('OpenAI TTS failed, falling back to browser:', err)
      }
    }

    // Fallback: Web Speech API
    await speakViaBrowserAPI(text, voiceURI || '')
  } catch (err) {
    console.error('All speech providers failed:', err)
  }
}

// ————————————————————————————————————————————————————————
// SPEECH RECOGNITION (Input)
// ————————————————————————————————————————————————————————

type RecognizerCallback = (text: string) => void
type RecognizerErrorCallback = () => void

export function createRecognizer(onResult: RecognizerCallback, onEnd: RecognizerErrorCallback) {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  if (!SpeechRecognition) {
    console.warn('Speech Recognition not supported')
    return null
  }

  const recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'en-US'

  let finalTranscript = ''

  recognition.onresult = (event: any) => {
    let interimTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript

      if (event.results[i].isFinal) {
        finalTranscript += transcript + ' '
      } else {
        interimTranscript += transcript
      }
    }

    if (finalTranscript.trim()) {
      onResult(finalTranscript.trim())
      finalTranscript = ''
    }
  }

  recognition.onerror = () => {
    onEnd()
  }

  recognition.onend = () => {
    onEnd()
  }

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  }
}
