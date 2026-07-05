import { useStore } from '../../store/store'
import type { ChatMsg } from '../../store/types'
import { splitDataURL } from '../image'
import { applyActions, type JarvisAction } from './actions'
import { fullKnowledge } from './knowledge'
import { buildProfile, buildSnapshot } from './snapshot'

// ————————————————————————————————————————————————————————
// LLM brain — optional. Anthropic (best) or Gemini (free tier).
// The model replies naturally and may emit a ```json actions block,
// which we strip from the display and execute against the store.
// ————————————————————————————————————————————————————————

function systemPrompt(): string {
  const s = useStore.getState()
  return `You are JARVIS — ${s.settings.userName}'s personal chief of staff and coach inside his "Calibrate" life operating system.

VOICE & STYLE: Speak exactly like the JARVIS of the Iron Man films — refined British butler, composed, effortlessly articulate, warm but understated, with dry wit. Flowing natural prose, never robotic, never a wall of bullet points. Concise by default: 1–3 sentences for most replies. Expand into structured depth ONLY when he explicitly asks you to plan, strategise, or explain. Address him as "sir" occasionally and naturally, not every line. Your replies are read aloud, so write them to be spoken — clean sentences, no markdown symbols, no emoji.

━━━ WHO HE IS (your persistent memory of ${s.settings.userName}) ━━━
${buildProfile()}

━━━ GROUNDED KNOWLEDGE (his real plans & domain facts — advise from THESE, never invent specifics) ━━━
${fullKnowledge()}

━━━ LIVE STATE OF HIS SYSTEM (right now) ━━━
${buildSnapshot()}

ANTI-HALLUCINATION RULES: When giving training, nutrition, golf, recovery, business or book advice, ground it in the KNOWLEDGE and LIVE STATE above and use his real numbers. If you don't have a specific fact (e.g. a live news event, a stat not shown), say so plainly rather than inventing it — never fabricate quotes, page numbers, prices, or statistics. You may reason and strategise freely, but label opinion as opinion.

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
- {"type":"remember","fact":"<durable fact about him to store in your memory>"}
- {"type":"add_mantra","text":"<quote/principle>","author":"<optional>"}
- {"type":"navigate","view":"today|goals|training|golf|nutrition|recovery|grocery|notes|business|books|mindset|markets|schedule|settings"}
When he tells you something durable about himself, his preferences, or his plans, use "remember" so you carry it forward.

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

async function callAnthropic(userText: string, image?: string): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = historyFor(chat, userText) as Array<{ role: 'user' | 'assistant'; content: unknown }>
  if (image) {
    const { mime, base64 } = splitDataURL(image)
    const last = messages[messages.length - 1]
    last.content = [
      { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
      { type: 'text', text: userText },
    ]
  }
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
      messages,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 180)}`)
  }
  const data: { content: { type: string; text?: string }[] } = await res.json()
  return data.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
}

async function callGemini(userText: string, image?: string): Promise<string> {
  const { settings, chat } = useStore.getState()
  const model = settings.geminiModel || 'gemini-2.5-flash'
  const contents = historyFor(chat, userText).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }] as Array<Record<string, unknown>>,
  }))
  if (image) {
    const { mime, base64 } = splitDataURL(image)
    contents[contents.length - 1].parts.unshift({ inlineData: { mimeType: mime, data: base64 } })
  }
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
export async function runLlm(userText: string, image?: string): Promise<LlmResult> {
  const { settings } = useStore.getState()
  const raw = settings.provider === 'anthropic' ? await callAnthropic(userText, image) : await callGemini(userText, image)

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
