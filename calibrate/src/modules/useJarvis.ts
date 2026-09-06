import { useCallback, useState } from 'react'
import { buildJarvisContext } from '../lib/jarvis/context'
import { runLocalEngine } from '../lib/jarvis/engine'
import { getProviderChain, llmConfigured, runAgent } from '../lib/jarvis/llm'
import { createSpeechStream, speak, stopSpeaking, type SpeechProviders } from '../lib/speech'
import { useStore } from '../store/store'

function speechProviders(): SpeechProviders | null {
  const { speakReplies, voiceURI, elevenKey, elevenVoiceId, openaiKey } = useStore.getState().settings
  if (!speakReplies) return null
  return { voiceURI, eleven: elevenKey ? { key: elevenKey, voiceId: elevenVoiceId } : undefined, openaiKey }
}

/**
 * The single pipeline every surface uses — the Jarvis page, the desktop
 * dock and the command palette all send through this, so context, voice
 * and receipts behave identically wherever you talk to it.
 */
export function useJarvis() {
  const pushChat = useStore((s) => s.pushChat)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)

  const say = (text: string) => {
    const p = speechProviders()
    if (p) void speak(text, p.voiceURI, p.eleven, p.openaiKey)
  }

  const send = useCallback(
    async (text: string, image?: string) => {
      const t = text.trim()
      if ((!t && !image) || busy) return

      stopSpeaking()
      pushChat({ role: 'user', text: t || '(photo)', image })

      const ctx = buildJarvisContext(t)

      // Fast path: deterministic, instant, free.
      if (!image) {
        const local = await runLocalEngine(t, ctx.userName)
        if (local) {
          pushChat({ role: 'jarvis', text: local.reply, acted: local.receipts })
          say(local.reply)
          return
        }
      }

      if (getProviderChain({ needsVision: !!image }).length === 0) {
        const fallback = image
          ? llmConfigured()
            ? "None of your configured brains read photos. Add a Gemini, Claude or OpenRouter key, or describe what's in it."
            : 'I need a brain to see photos. A free Gemini or OpenRouter key in Settings unlocks it.'
          : 'That one needs the full brain. The built-in engine handles logging and edits; for reasoning, search and restructuring, add a key in Settings — Gemini and Groq are free, or point me at Ollama on this Mac.'
        pushChat({ role: 'jarvis', text: fallback })
        say(fallback)
        return
      }

      setBusy(true)
      const providers = speechProviders()
      const voice = providers ? createSpeechStream(providers) : null

      try {
        const res = await runAgent(t || 'What do you make of this?', ctx, image, {
          onDelta: (delta, full) => {
            setDraft(full)
            voice?.push(delta)
          },
          onTool: (name) => setActiveTool(name),
        })
        pushChat({ role: 'jarvis', text: res.reply, acted: res.receipts, tools: res.tools })
        void voice?.end()
      } catch (e) {
        voice?.cancel()
        pushChat({
          role: 'jarvis',
          text: `That didn't get through: ${e instanceof Error ? e.message : 'unknown error'}. Check the key in Settings.`,
        })
      } finally {
        setDraft(null)
        setActiveTool(null)
        setBusy(false)
      }
    },
    [busy, pushChat],
  )

  return { send, busy, draft, activeTool }
}

/** Human-readable label for a tool name, for the "working" line. */
export function toolLabel(name: string): string {
  const map: Record<string, string> = {
    search_web: 'Searching the web',
    get_snapshot: 'Reading your data',
    lookup_food: 'Checking the food databases',
    log_metric: 'Logging',
    log_food: 'Logging food',
    log_session: 'Logging the session',
    delete_entry: 'Removing an entry',
    edit_food: 'Correcting the entry',
    complete: 'Ticking it off',
    manage_workout: 'Reshaping the split',
    manage_exercise: 'Editing the session',
    manage_schedule: 'Editing the blueprint',
    manage_goal: 'Updating goals',
    manage_milestone: 'Updating milestones',
    manage_list: 'Updating the list',
    manage_note: 'Writing notes',
    manage_section: 'Rebuilding the navigation',
    manage_group: 'Reorganising groups',
    manage_block: 'Building the page',
    manage_taxonomy: 'Renaming categories',
    manage_habit: 'Adjusting habits',
    manage_reminder: 'Setting reminders',
    set_targets: 'Updating targets',
    set_golf_stats: 'Updating the diagnostic',
    remember: 'Committing to memory',
    forget: 'Forgetting',
    manage_knowledge: 'Filing reference',
    navigate: 'Opening the section',
  }
  return map[name] ?? 'Working'
}
