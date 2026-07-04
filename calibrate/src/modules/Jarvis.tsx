import { Bot, KeyRound, Mic, MicOff, SendHorizonal, Trash2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createRecognizer, speak, speechSupported, stopSpeaking } from '../lib/speech'
import { runLocalEngine } from '../lib/jarvis/engine'
import { llmConfigured, runLlm } from '../lib/jarvis/llm'
import { useStore } from '../store/store'

const SUGGESTIONS = [
  'log 30 min putting',
  "what's next?",
  'protein today?',
  'add eggs and oats to the list',
  'plan my golf week',
  'weight 84.6',
]

export function useJarvis() {
  const pushChat = useStore((s) => s.pushChat)
  const speakReplies = useStore((s) => s.settings.speakReplies)
  const [busy, setBusy] = useState(false)

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    pushChat({ role: 'user', text: t })

    // 1) Free local engine first — instant, offline
    const local = runLocalEngine(t)
    if (local) {
      pushChat({ role: 'jarvis', text: local.reply, acted: local.receipts })
      if (speakReplies) speak(local.reply)
      return
    }

    // 2) LLM brain if configured
    if (!llmConfigured()) {
      const fallback =
        "That one needs my full brain, sir. The built-in engine handles logging, lists and stats — for strategy, planning and open conversation, add a free Gemini key or an Anthropic key in Settings. Meanwhile, try 'help' for everything I can do offline."
      pushChat({ role: 'jarvis', text: fallback })
      if (speakReplies) speak(fallback)
      return
    }

    setBusy(true)
    try {
      const res = await runLlm(t)
      pushChat({ role: 'jarvis', text: res.reply, acted: res.receipts })
      if (speakReplies) speak(res.reply)
    } catch (e) {
      pushChat({
        role: 'jarvis',
        text: `Connection issue with the advanced brain: ${e instanceof Error ? e.message : 'unknown error'}. Check the API key in Settings.`,
      })
    } finally {
      setBusy(false)
    }
  }

  return { send, busy }
}

export function Jarvis() {
  const s = useStore()
  const { send, busy } = useJarvis()
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [s.chat.length, busy])

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
    send(input)
    setInput('')
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] max-w-3xl flex-col lg:h-[calc(100dvh-5rem)]">
      <header className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className={`relative flex h-11 w-11 items-center justify-center rounded-full border ${busy || listening ? 'border-signal shadow-[0_0_20px_rgba(246,184,60,0.45)]' : 'border-edge-strong'}`}>
            <Bot size={20} className={busy || listening ? 'text-signal' : 'text-haze'} />
            {(busy || listening) && <span className="absolute inset-0 animate-ping rounded-full border border-signal/50" />}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold leading-none tracking-wide text-ice">JARVIS</h1>
            <p className="hud-label !mb-0 mt-1 !text-[8px]">
              {listening ? 'LISTENING…' : busy ? 'THINKING…' : llmConfigured() ? 'FULL BRAIN ONLINE' : 'BUILT-IN ENGINE · FREE'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          {!llmConfigured() && (
            <button className="btn !py-1.5 !text-xs" onClick={() => s.setView('settings')}>
              <KeyRound size={13} /> Upgrade brain
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
              At your service, {s.settings.userName}. I see every stat in your system — I can log, edit, plan and
              answer. Speak or type.
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
                  ? 'rounded-br-md bg-signal/15 text-ice ring-1 ring-signal/25'
                  : 'rounded-bl-md bg-black/35 text-ice/95 ring-1 ring-edge'
              }`}
            >
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
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-black/35 px-4 py-3 ring-1 ring-edge">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-signal"
                    style={{ animationDelay: `${i * 0.25}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        {speechSupported() && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? 'Stop listening' : 'Speak to Jarvis'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all ${
              listening
                ? 'border-signal bg-signal/20 text-signal shadow-[0_0_18px_rgba(246,184,60,0.5)]'
                : 'border-edge-strong bg-black/30 text-haze hover:border-signal/50 hover:text-ice'
            }`}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <input
          className="field h-11 flex-1 !rounded-full !px-4"
          placeholder={listening ? 'Listening…' : 'Speak or type to Jarvis…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message Jarvis"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!input.trim() || busy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#f6b83c] to-[#dd9224] text-[#141004] shadow-[0_6px_20px_-6px_rgba(246,184,60,0.6)] transition-transform active:scale-95 disabled:opacity-40"
        >
          <SendHorizonal size={18} />
        </button>
      </form>
    </div>
  )
}
