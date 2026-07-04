import { useStore } from '../../store/store'
import type { ChatMsg } from '../../store/types'
import { applyActions, type JarvisAction } from './actions'
import { buildSnapshot } from './snapshot'

// ————————————————————————————————————————————————————————
// LLM brain — optional. Anthropic (best) or Gemini (free tier).
// The model replies naturally and may emit a ```json actions block,
// which we strip from the display and execute against the store.
// ————————————————————————————————————————————————————————

function systemPrompt(): string {
  const s = useStore.getState()
  return `You are JARVIS — ${s.settings.userName}'s personal chief of staff inside his "Calibrate" life operating system. Personality: composed, dry British wit, surgically concise, direct. Address him as "${s.settings.userName}" or "sir" sparingly. You are not a chatbot; you are an operator.

His system: "The Blueprint" — four pillars: (1) Physique: lean 87–90kg via Tue Push/Wed Pull/Fri Legs/Sat Upper split + Thu Zone 2 run, 3600–3900 kcal, 190–220g protein; (2) Elite golf: 2.4 handicap → plus handicap, simulator Wed/Fri + Sunday on-course with coach; (3) AURORA smart-ring business → $1,000/day; (4) Recovery: 22:30 blackout, 8h sleep. He is a student at an Austrian gymnasium on weekdays.

CURRENT STATE OF HIS SYSTEM:
${buildSnapshot()}

You can EXECUTE actions in the app. To do so, append ONE fenced json block at the END of your reply:
\`\`\`json
{"actions":[{"type":"log_golf","category":"putting","minutes":30}]}
\`\`\`
Available actions:
- {"type":"log_golf","category":"putting|chipping|long-game|drills|simulator|on-course","minutes":N}
- {"type":"log_water","ml":N} · {"type":"log_weight","kg":N} · {"type":"log_sleep","hours":N,"blackoutOnTime":bool}
- {"type":"log_reading","minutes":N} · {"type":"log_run","minutes":N,"distanceKm":N}
- {"type":"log_food","name":"...","kcal":N,"protein":N,"carbs":N,"fat":N}
- {"type":"log_revenue","amount":N,"source":"..."} · {"type":"log_handicap","value":N}
- {"type":"add_grocery","name":"...","qty":"..."} · {"type":"add_note","title":"...","body":"..."}
- {"type":"add_goal","title":"...","target":"...","pillar":"physique|golf|business|recovery|custom"}
- {"type":"add_milestone","goal":"<goal title fragment>","title":"..."}
- {"type":"add_biz_task","title":"...","area":"Content|Store|Marketing|Suppliers|Ops"}
- {"type":"add_book","title":"...","author":"..."} · {"type":"add_watch","kind":"crypto|stock","symbol":"..."}
- {"type":"complete_block","title":"<today's schedule block title fragment>"} · {"type":"complete_workout"}
- {"type":"update_goal_progress","goal":"<fragment>","progress":0-100}
- {"type":"navigate","view":"today|goals|training|golf|nutrition|grocery|notes|business|books|markets|schedule|settings"}

Rules: Only emit actions the user clearly asked for or explicitly confirmed. Never invent data values. Keep replies under 120 words unless he asks for deep planning/strategy — then think hard and structure it. Use his real numbers from CURRENT STATE when advising.`
}

function historyFor(chat: ChatMsg[], userText: string): { role: 'user' | 'assistant'; content: string }[] {
  const recent = chat.slice(-12).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.text,
  }))
  // Merge consecutive same-role turns (APIs require alternation)
  const merged: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of [...recent, { role: 'user' as const, content: userText }]) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) last.content += '\n' + m.content
    else merged.push({ ...m })
  }
  if (merged[0]?.role === 'assistant') merged.shift()
  return merged
}

async function callAnthropic(userText: string): Promise<string> {
  const { settings, chat } = useStore.getState()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.anthropicModel || 'claude-sonnet-5',
      max_tokens: 1500,
      system: systemPrompt(),
      messages: historyFor(chat, userText),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 180)}`)
  }
  const data: { content: { type: string; text?: string }[] } = await res.json()
  return data.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
}

async function callGemini(userText: string): Promise<string> {
  const { settings, chat } = useStore.getState()
  const model = settings.geminiModel || 'gemini-2.5-flash'
  const contents = historyFor(chat, userText).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${settings.geminiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt() }] },
        contents,
        generationConfig: { maxOutputTokens: 1500 },
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 180)}`)
  }
  const data: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = await res.json()
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

export function llmConfigured(): boolean {
  const { settings } = useStore.getState()
  return (
    (settings.provider === 'anthropic' && !!settings.anthropicKey) ||
    (settings.provider === 'gemini' && !!settings.geminiKey)
  )
}

export interface LlmResult {
  reply: string
  receipts: string[]
}

/** Send to the configured LLM, execute any actions block, return clean reply + receipts. */
export async function runLlm(userText: string): Promise<LlmResult> {
  const { settings } = useStore.getState()
  const raw = settings.provider === 'anthropic' ? await callAnthropic(userText) : await callGemini(userText)

  // Extract and execute the trailing actions block
  let receipts: string[] = []
  let reply = raw
  const blocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)]
  for (const b of blocks) {
    try {
      const parsed: { actions?: JarvisAction[] } = JSON.parse(b[1])
      if (Array.isArray(parsed.actions) && parsed.actions.length) {
        receipts = receipts.concat(applyActions(parsed.actions))
      }
      reply = reply.replace(b[0], '')
    } catch {
      // leave malformed blocks visible so nothing is silently lost
    }
  }
  return { reply: reply.trim() || (receipts.length ? 'Done.' : '…'), receipts }
}
