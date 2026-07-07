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

// Provider-native web search tools — no backend required.
// Anthropic: server-side web_search tool; Gemini: Google Search grounding.
const ANTHROPIC_WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 3 }
const GEMINI_SEARCH_TOOLS = [{ google_search: {} }]

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

Editing & deleting (fix mistakes, don't just add):
  - {"type":"update_food","name":"<today's entry fragment>","newName":"...","kcal":N,"protein":N,"carbs":N,"fat":N}
  - {"type":"delete_food","name":"<fragment, omit for most recent>"}
  - {"type":"delete_golf"} · {"type":"delete_run"}  (most recent today)
  - {"type":"check_grocery","name":"..."} · {"type":"remove_grocery","name":"..."}
  - {"type":"remove_note","title":"<fragment>"}
  - {"type":"toggle_milestone","goal":"<fragment>","milestone":"<fragment>"}
  - {"type":"complete_biz_task","title":"<fragment>"} · {"type":"remove_goal","title":"<fragment>"}
  - {"type":"forget","fact":"<memory fragment to erase>"}
  - {"type":"add_block","title":"...","start":"HH:MM","end":"HH:MM","weekday":0-6,"detail":"...","tag":"morning|school|gym|golf|run|business|meal|study|recovery|social|language"}
  - {"type":"move_block","title":"<today's block fragment>","start":"HH:MM","end":"HH:MM"}
  - {"type":"remove_block","title":"<today's block fragment>"}

Memory:
  - {"type":"remember","fact":"<durable fact to store in memory>"}

Navigation:
  - {"type":"navigate","view":"today|goals|training|golf|nutrition|recovery|grocery|notes|business|books|mindset|markets|schedule|settings"}

EXECUTION RULES:
- Only emit actions the user clearly asked for or explicitly confirmed
- Ground advice about HIS data (his plans, his numbers, his history) in KNOWLEDGE and LIVE STATE — never invent those
- Use "remember" when user shares durable preferences, plans, or insights
- Keep replies under 120 words unless the user asks for deep strategy/planning
- When he corrects a mistake ("that was wrong", "actually it was 600 kcal"), FIX it with an edit action — don't apologise and do nothing

FOOD LOGGING POLICY (accurate, never a dead end):
1. If the item matches the KNOWN FOOD DATABASE in KNOWLEDGE → use those exact figures.
2. If the user gave numbers → use exactly those.
3. Otherwise → estimate from your solid nutrition knowledge (or a quick web search for restaurant/branded items),
   LOG IT with the estimate, and say it's an estimate — e.g. "Logged pho bo at roughly 450 kcal / 30g protein for a
   typical bowl — correct me if the portion was bigger." An honest labeled estimate beats refusing to help.
   NEVER present an estimate as an exact fact, and NEVER refuse to log because you lack the label.

WEB SEARCH: You have live web search. Use it when current or specific facts matter — branded/restaurant nutrition,
golf course info, prices, news, weather, anything beyond your training data. Never claim you are a closed system
or cannot access the internet. Search silently; report the answer, not the search process.
`

  return basePrompt + '\n' + actionDocs
}

function historyFor(chat: ChatMsg[], userText: string): { role: 'user' | 'assistant'; content: string }[] {
  // Deep conversational context — the last 24 turns ride along with every query
  const recent = chat.slice(-24).map((m) => ({
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
      tools: [ANTHROPIC_WEB_SEARCH],
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
        tools: GEMINI_SEARCH_TOOLS,
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

/** Parse trailing ```json action blocks out of a raw LLM reply; execute them. */
function extractAndApplyActions(raw: string): LlmResult {
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

/** The user-visible part of a partially-streamed reply (everything before the action block). */
function displayPortion(raw: string): string {
  const cut = raw.indexOf('```')
  return (cut === -1 ? raw : raw.slice(0, cut)).trimEnd()
}

/**
 * Unified LLM pipeline (non-streaming):
 * 1. Receive the context already built once by the caller (Jarvis.tsx) —
 *    never rebuilt here, so memory-access bookkeeping isn't double-counted
 *    and the local engine + LLM always reason from the exact same snapshot.
 * 2. Call configured provider
 * 3. Parse and execute action blocks
 * 4. Return clean reply + receipts
 */
export async function runLlm(userText: string, ctx: JarvisContext, image?: string): Promise<LlmResult> {
  const { settings } = useStore.getState()

  if (!llmConfigured()) {
    throw new Error('LLM not configured. Add an API key in Settings.')
  }

  const raw =
    settings.provider === 'anthropic'
      ? await callAnthropic(userText, ctx, image)
      : await callGemini(userText, ctx, image)

  return extractAndApplyActions(raw)
}

// ————————————————————————————————————————————————————————
// STREAMING PIPELINE — the reply renders and speaks as it's generated
// ————————————————————————————————————————————————————————

/** Consume an SSE fetch body, invoking onData for each `data: {...}` payload. */
async function consumeSSE(res: Response, onData: (json: string) => void): Promise<void> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += decoder.decode(value, { stream: true })

    const lines = pending.split('\n')
    pending = lines.pop() ?? '' // keep the trailing partial line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload && payload !== '[DONE]') onData(payload)
    }
  }
}

async function streamAnthropic(userText: string, ctx: JarvisContext, image: string | undefined, onText: (delta: string) => void): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = historyFor(chat, userText) as Array<{ role: 'user' | 'assistant'; content: unknown }>

  if (image) {
    const { mime, base64 } = splitDataURL(image)
    const last = messages[messages.length - 1]
    const content = [
      { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
      { type: 'text', text: userText },
    ]
    if (last) last.content = content
    else messages.push({ role: 'user', content })
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
      max_tokens: 2000,
      stream: true,
      system: buildSystemPrompt(ctx),
      messages,
      tools: [ANTHROPIC_WEB_SEARCH],
    }),
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 180)}`)
  }

  let full = ''
  await consumeSSE(res, (payload) => {
    try {
      const ev: { type?: string; delta?: { type?: string; text?: string } } = JSON.parse(payload)
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        full += ev.delta.text
        onText(ev.delta.text)
      }
    } catch {
      /* ignore malformed frames */
    }
  })
  return full
}

async function streamGemini(userText: string, ctx: JarvisContext, image: string | undefined, onText: (delta: string) => void): Promise<string> {
  const { settings, chat } = useStore.getState()
  const model = settings.geminiModel || 'gemini-2.5-flash'

  const contents = historyFor(chat, userText).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }] as Array<Record<string, unknown>>,
  }))

  if (image) {
    const { mime, base64 } = splitDataURL(image)
    contents[contents.length - 1]?.parts.unshift({ inlineData: { mimeType: mime, data: base64 } })
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${settings.geminiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
        contents,
        tools: GEMINI_SEARCH_TOOLS,
        generationConfig: { maxOutputTokens: 2000 },
      }),
    },
  )

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 180)}`)
  }

  let full = ''
  await consumeSSE(res, (payload) => {
    try {
      const ev: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = JSON.parse(payload)
      const text = ev.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (text) {
        full += text
        onText(text)
      }
    } catch {
      /* ignore malformed frames */
    }
  })
  return full
}

export interface StreamHandlers {
  /**
   * Called as visible reply text grows (action JSON is never included).
   * `displayDelta` is the newly-arrived visible text; `displayFull` the whole visible reply so far.
   */
  onDelta: (displayDelta: string, displayFull: string) => void
}

/**
 * Streaming LLM pipeline: text renders and can be spoken sentence-by-sentence
 * while the model is still generating. Falls back to the caller for
 * non-streaming retry on failure. Action blocks are executed after the
 * stream completes, exactly like the non-streaming path.
 */
export async function runLlmStream(userText: string, ctx: JarvisContext, image: string | undefined, handlers: StreamHandlers): Promise<LlmResult> {
  const { settings } = useStore.getState()

  if (!llmConfigured()) {
    throw new Error('LLM not configured. Add an API key in Settings.')
  }

  let rawText = ''
  let shown = ''
  const collect = (delta: string) => {
    rawText += delta
    const display = displayPortion(rawText)
    if (display.length > shown.length) {
      handlers.onDelta(display.slice(shown.length), display)
      shown = display
    }
  }

  const full =
    settings.provider === 'anthropic'
      ? await streamAnthropic(userText, ctx, image, collect)
      : await streamGemini(userText, ctx, image, collect)

  return extractAndApplyActions(full)
}
