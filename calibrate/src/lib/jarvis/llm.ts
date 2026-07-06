import { useStore } from '../../store/store'
import type { ChatMsg } from '../../store/types'
import { splitDataURL } from '../image'
import { applyActions, type JarvisAction } from './actions'
import { formatContextForLlm, type JarvisContext } from './context'

// ————————————————————————————————————————————————————————
// UNIFIED LLM BRAIN (PHASE 1)
// ————————————————————————————————————————————————————————
// LLM now receives the same unified context as the local engine.
// Single system prompt template (no branching logic).
// All context is injected once, ensuring consistency.
//
// Flow:
// 1. Receive user query + image (optional)
// 2. Build unified context via buildJarvisContext()
// 3. Format context for LLM via formatContextForLlm()
// 4. Send to Anthropic or Gemini
// 5. Parse and execute any action blocks
// 6. Return clean reply + receipts
// ————————————————————————————————————————————————————————

function buildSystemPrompt(ctx: JarvisContext): string {
  const basePrompt = formatContextForLlm(ctx)

  // Add action documentation and rules
  const actionDocs = `
━━━ HOW TO EXECUTE ACTIONS ━━━
You can emit structured actions to execute in the app. Append ONE fenced json block at the END of your reply:

\`\`\`json
{"actions":[{"type":"log_golf","category":"putting","minutes":30}]}
\`\`\`

AVAILABLE ACTIONS:
Logging:
  - {"type":"log_golf","category":"putting|chipping|long-game|drills|simulator|on-course","minutes":N}
  - {"type":"log_water","ml":N}
  - {"type":"log_weight","kg":N}
  - {"type":"log_sleep","hours":N,"blackoutOnTime":bool}
  - {"type":"log_reading","minutes":N}
  - {"type":"log_run","minutes":N,"distanceKm":N}
  - {"type":"log_food","name":"...","kcal":N,"protein":N,"carbs":N,"fat":N}
  - {"type":"log_revenue","amount":N,"source":"..."}
  - {"type":"log_handicap","value":N}

Adding:
  - {"type":"add_grocery","name":"...","qty":"..."}
  - {"type":"add_note","title":"...","body":"..."}
  - {"type":"add_goal","title":"...","target":"...","pillar":"physique|golf|business|recovery|custom"}
  - {"type":"add_milestone","goal":"<goal title fragment>","title":"..."}
  - {"type":"add_biz_task","title":"...","area":"Content|Store|Marketing|Suppliers|Ops"}
  - {"type":"add_book","title":"...","author":"..."}
  - {"type":"add_watch","kind":"crypto|stock","symbol":"...","cgId":"...","name":"..."}
  - {"type":"add_mantra","text":"<quote/principle>","author":"<optional>"}

Completing:
  - {"type":"complete_block","title":"<today's schedule block title fragment>"}
  - {"type":"complete_workout"}

Updates:
  - {"type":"update_goal_progress","goal":"<fragment>","progress":0-100}

Memory:
  - {"type":"remember","fact":"<durable fact to store in memory>"}

Navigation:
  - {"type":"navigate","view":"today|goals|training|golf|nutrition|recovery|grocery|notes|business|books|mindset|markets|schedule|settings"}

EXECUTION RULES:
- Only emit actions the user clearly asked for or explicitly confirmed
- Never invent data values — use exact numbers from the user's input
- Ground all advice in the KNOWLEDGE section above, never invent specifics
- Use "remember" when user shares durable preferences, plans, or insights
- Keep replies under 120 words unless the user asks for deep strategy/planning
- Always cite relevant KNOWLEDGE when giving training/nutrition/golf/recovery/business advice
- If you don't have a specific, ask clarifying questions rather than inventing
- FOOD LOGGING IS ZERO-TOLERANCE FOR HALLUCINATION: when the user names a food without giving kcal/macros,
  use the exact figures from the KNOWN FOOD DATABASE in KNOWLEDGE if it matches. If it does NOT match anything
  in that database and the user gave no numbers, do NOT emit a log_food action with a guessed number — instead
  ask what's on the label ("how many kcal/protein on the label?"). A wrong invented number is worse than asking.
`

  return basePrompt + '\n' + actionDocs
}

function historyFor(chat: ChatMsg[], userText: string): { role: 'user' | 'assistant'; content: string }[] {
  // Include last 12 messages for context window efficiency
  const recent = chat.slice(-12).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.text,
  }))

  // Merge consecutive same-role turns (APIs require alternation)
  const merged: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of [...recent, { role: 'user' as const, content: userText }]) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) {
      last.content += '\n' + m.content
    } else {
      merged.push({ ...m })
    }
  }

  // Ensure conversation starts with user
  if (merged[0]?.role === 'assistant') {
    merged.shift()
  }

  return merged
}

async function callAnthropic(userText: string, ctx: JarvisContext, image?: string): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = historyFor(chat, userText) as Array<{ role: 'user' | 'assistant'; content: unknown }>

  if (image) {
    const { mime, base64 } = splitDataURL(image)
    const last = messages[messages.length - 1]
    if (!last) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
          { type: 'text', text: userText },
        ],
      })
    } else {
      last.content = [
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
        { type: 'text', text: userText },
      ]
    }
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
      system: buildSystemPrompt(ctx),
      messages,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 180)}`)
  }

  const data: { content: { type: string; text?: string }[] } = await res.json()
  return data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

async function callGemini(userText: string, ctx: JarvisContext, image?: string): Promise<string> {
  const { settings, chat } = useStore.getState()
  const model = settings.geminiModel || 'gemini-2.5-flash'

  const contents = historyFor(chat, userText).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }] as Array<Record<string, unknown>>,
  }))

  if (image) {
    const { mime, base64 } = splitDataURL(image)
    const lastContent = contents[contents.length - 1]
    if (lastContent) {
      lastContent.parts.unshift({ inlineData: { mimeType: mime, data: base64 } })
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${settings.geminiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
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

/**
 * Check if an LLM provider is configured and ready.
 */
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

/**
 * Unified LLM pipeline:
 * 1. Receive the context already built once by the caller (Jarvis.tsx) —
 *    never rebuilt here, so memory-access bookkeeping isn't double-counted
 *    and the local engine + LLM always reason from the exact same snapshot.
 * 2. Call configured provider
 * 3. Parse and execute action blocks
 * 4. Return clean reply + receipts
 *
 * This is the ONLY LLM entry point in the app.
 * No branching logic — single consistent flow.
 */
export async function runLlm(userText: string, ctx: JarvisContext, image?: string): Promise<LlmResult> {
  const { settings } = useStore.getState()

  if (!llmConfigured()) {
    throw new Error('LLM not configured. Add an API key in Settings.')
  }

  // Call the configured provider
  const raw =
    settings.provider === 'anthropic'
      ? await callAnthropic(userText, ctx, image)
      : await callGemini(userText, ctx, image)

  // Extract and execute trailing action blocks
  let receipts: string[] = []
  let reply = raw

  const blocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)]

  for (const b of blocks) {
    try {
      const parsed: { actions?: JarvisAction[] } = JSON.parse(b[1])

      if (Array.isArray(parsed.actions) && parsed.actions.length) {
        receipts = receipts.concat(applyActions(parsed.actions))
      }

      // Remove the action block from the displayed reply
      reply = reply.replace(b[0], '')
    } catch {
      // Leave malformed blocks visible so nothing is silently lost
    }
  }

  return {
    reply: reply.trim() || (receipts.length ? 'Done.' : '…'),
    receipts,
  }
}
