import { useStore } from '../../store/store'
import type { ChatMsg, LlmProvider } from '../../store/types'
import { splitDataURL } from '../image'
import { applyActions, type JarvisAction } from './actions'
import { formatContextForLlm, type JarvisContext } from './context'
import { canCall, rateLimitStatus, recordCall } from './rateLimit'

/** Thrown by every provider call so the failover chain knows who failed and why. */
export class ProviderError extends Error {
  constructor(
    public provider: LlmProvider,
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// Priority order when auto-failing over: strongest/most-capable first.
const PROVIDER_ORDER: LlmProvider[] = ['anthropic', 'gemini', 'groq', 'openrouter']

export function providerLabel(p: LlmProvider): string {
  switch (p) {
    case 'anthropic':
      return 'Claude'
    case 'gemini':
      return 'Gemini'
    case 'groq':
      return 'Groq'
    case 'openrouter':
      return 'OpenRouter'
    default:
      return p
  }
}

function providerHasKey(p: LlmProvider, settings: ReturnType<typeof useStore.getState>['settings']): boolean {
  switch (p) {
    case 'anthropic':
      return !!settings.anthropicKey
    case 'gemini':
      return !!settings.geminiKey
    case 'groq':
      return !!settings.groqKey
    case 'openrouter':
      return !!settings.openrouterKey
    default:
      return false
  }
}

/**
 * The ordered list of providers to try for this request: the user's chosen
 * primary first (if it's actually configured), then every other configured
 * provider as an automatic fallback. Providers with no vision support are
 * excluded when the request carries a photo.
 */
export function getProviderChain(opts: { needsVision?: boolean } = {}): LlmProvider[] {
  const { settings } = useStore.getState()
  const configured = PROVIDER_ORDER.filter((p) => providerHasKey(p, settings))
  const primary = settings.provider
  const chain = configured.includes(primary) ? [primary, ...configured.filter((p) => p !== primary)] : configured
  return opts.needsVision ? chain.filter((p) => p !== 'groq') : chain
}

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

function buildSystemPrompt(ctx: JarvisContext, opts: { webSearch: boolean } = { webSearch: true }): string {
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
  - {"type":"log_photo","category":"golf|training|other","caption":"<short description of what's in it>"}
    Use this ONLY when a photo is attached to this message and he asks to log/save it (e.g. "log this into golf
    training", "save this"). It goes into his dated photo gallery (Golf/Training view) — never emit this without an
    attached photo, and never invent a caption he didn't describe or confirm.

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
  - {"type":"update_note","title":"<fragment>","body":"<full new body>"}
  - {"type":"append_note","title":"<fragment>","text":"<lines to add at the END>"}  ← use this to add items to a list note; never delete+recreate
  - {"type":"toggle_milestone","goal":"<fragment>","milestone":"<fragment>"}
  - {"type":"complete_biz_task","title":"<fragment>"} · {"type":"remove_goal","title":"<fragment>"}
  - {"type":"forget","fact":"<memory fragment to erase>"}
  - {"type":"add_block","title":"...","start":"HH:MM","end":"HH:MM","weekday":0-6,"detail":"...","tag":"morning|school|gym|golf|run|business|meal|study|recovery|social|language"}
  - {"type":"move_block","title":"<today's block fragment>","start":"HH:MM","end":"HH:MM"}
  - {"type":"remove_block","title":"<today's block fragment>"}

Corrections & fine-grained control:
  - {"type":"set_water","ml":N}  ← overwrite today's TOTAL (e.g. accidental over-log: "make it 1 liter" → 1000)
  - {"type":"log_water","ml":-N}  ← negative values subtract
  - {"type":"toggle_supplement","name":"<fragment>"} · {"type":"add_supplement","name":"...","dose":"...","timing":"..."}
  - {"type":"remove_supplement","name":"<fragment>"} · {"type":"move_supplement","name":"<fragment>","position":1}  (1 = top)
  - {"type":"update_exercise","workout":"<name fragment>","exercise":"<fragment>","name":"...","sets":N,"reps":"8-10","cue":"..."}
  - {"type":"add_exercise","workout":"<fragment>","name":"...","sets":N,"reps":"8-10","cue":"..."}
  - {"type":"remove_exercise","workout":"<fragment>","exercise":"<fragment>"}

Restructuring the training split itself (weekday: 0=Mon … 6=Sun):
  - {"type":"add_workout","name":"Push + Biceps","weekday":1,"exercises":[{"name":"Incline DB Press","sets":4,"reps":"6-8","cue":"..."},...]}  ← ONE action creates the full workout with all its exercises
  - {"type":"update_workout","workout":"<fragment>","name":"<new name>","weekday":N}  ← rename / move day
  - {"type":"remove_workout","workout":"<fragment>"}

Fuelling framework — the Nutrition view's day-type carb periodisation table (Recovery/Lift/Easy Run/Quality Run/Double Day/Long Run):
  - {"type":"update_day_type_macro","dayType":"<code like L, or a label fragment like 'lift'>","proteinGkg":"1.8-2.2","carbGkg":"3.5-4.5","fatGkg":"0.6-0.8"}
    Only include the field(s) he asked to change. The "Example (80kg)" column recomputes automatically from
    whatever protein/carb/fat is set — never state a kcal figure for this table yourself, the app computes it.
    This table is a REFERENCE FRAMEWORK at a fixed 80kg for scaling logic, not his personal calorie target — for
    his actual daily target use the NUTRITION TODAY line in LIVE STATE, not this table's example kcal.

Memory:
  - {"type":"remember","fact":"<durable one-line fact to store in memory>"}
  - {"type":"save_knowledge","title":"...","body":"<a longer reference — a plan, protocol, or notes he wants you to keep and reason from later>"}
    Use this for anything too long for a one-line fact. It lands in his Brain Feed and rides along with every future query.
    TOM'S OWN KNOWLEDGE (his Brain Feed, in KNOWLEDGE above) is authoritative about HIS world — prefer it over generic advice.

Navigation:
  - {"type":"navigate","view":"today|goals|training|golf|nutrition|recovery|grocery|notes|business|books|mindset|markets|schedule|settings"}

EXECUTION RULES:
- ACT, DON'T ANNOUNCE. When asked to change/edit/restructure ANYTHING, this reply MUST end with the json block
  that does it. NEVER say "I will now proceed to…" or list planned steps — the plan IS the action block. If you
  describe a change without emitting its actions, you have failed the request.
- When executing changes, keep prose to ONE short confirmation sentence, then the action block. Long prose before
  a large block risks the block being cut off by the token limit — the actions are the priority, not the speech.
- A single block can hold MANY actions — full restructures (remove old workouts, add new ones, move schedule
  blocks, update memory) belong in ONE block in ONE reply.
- ALWAYS close the json fence with \`\`\` — an unterminated block cannot execute
- Emit ONLY action types from the list above, exactly as spelled
- Only emit actions the user clearly asked for or explicitly confirmed
- Ground advice about HIS data (his plans, his numbers, his history) in KNOWLEDGE and LIVE STATE — never invent those
- Use "remember" when user shares durable preferences, plans, or insights
- Keep replies under 120 words unless the user asks for deep strategy/planning
- When he corrects a mistake ("that was wrong", "actually it was 600 kcal"), FIX it with an edit action — don't apologise and do nothing

FOOD LOGGING POLICY (accurate, never a hallucination):
1. If the item matches the KNOWN FOOD DATABASE in KNOWLEDGE → use those exact figures.
2. If the user gave numbers → use exactly those.
3. Otherwise → do NOT invent macros. Ask for the specific item, brand, or portion (e.g. "What brand/size — I want
   to log this accurately rather than guess") ${
     opts.webSearch ? 'or use web search to find the real label/menu figures for a branded or restaurant item' : ''
   }.
   NEVER present a guess as a fact, and NEVER silently log a number you are not confident in — asking one clarifying
   question is always better than a fabricated calorie count.

MEAL INSPIRATION (distinct from logging — no numbers required here):
When he asks what to eat/cook given constraints ("what should I eat quickly, I only have yogurt", "quick high-protein
idea with what I've got"), that is a request for IDEAS, not a logging event — don't ask for a label, just suggest
2-3 concrete, fast options using what he named${opts.webSearch ? ', using web search if a specific recipe or product needs current details' : ''}.
Keep it practical and short. Only log something if he then tells you he made/ate it.
${
  opts.webSearch
    ? `
WEB SEARCH: You have live web search. Use it when current or specific facts matter — branded/restaurant nutrition,
golf course info, prices, news, weather, anything beyond your training data. Never claim you are a closed system
or cannot access the internet. Search silently; report the answer, not the search process.`
    : `
NOTE: This provider has no live web search — for anything requiring current/real-time facts you don't know, say so
plainly rather than guessing, and suggest the user ask again with the Anthropic or Gemini brain active for that.`
}
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
      max_tokens: 2500,
      system: buildSystemPrompt(ctx),
      messages,
      tools: [ANTHROPIC_WEB_SEARCH],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ProviderError('anthropic', res.status, `Anthropic ${res.status}: ${body.slice(0, 180)}`)
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
        generationConfig: { maxOutputTokens: 2500 },
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ProviderError('gemini', res.status, `Gemini ${res.status}: ${body.slice(0, 180)}`)
  }

  const data: { candidates?: { content?: { parts?: { text?: string }[] } }[] } = await res.json()
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

// Groq (groq.com): genuinely free tier, no card, no daily reset surprises —
// the recommended fallback when Anthropic/Gemini limits are hit. OpenAI-compatible
// chat completions API. Trade-off: no native web search tool (Groq doesn't offer
// one), so the system prompt's web-search claim is omitted for this provider.
async function callGroq(userText: string, ctx: JarvisContext): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctx, { webSearch: false }) },
    ...historyFor(chat, userText),
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.groqKey}` },
    body: JSON.stringify({ model: settings.groqModel || 'llama-3.3-70b-versatile', max_tokens: 2500, messages }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ProviderError('groq', res.status, `Groq ${res.status}: ${body.slice(0, 180)}`)
  }

  const data: { choices?: { message?: { content?: string } }[] } = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// OpenRouter: one key routes to many models, several genuinely free (":free" suffix).
// Free models get retired without notice (qwen2.5-vl-72b:free vanished and 404'd
// everyone using the old default), so the model is SELF-HEALING: on a 404 we fetch
// the live catalogue, pick the best available free model (vision-capable when the
// request needs it), persist it to settings, and retry — no user intervention.
// Web search would need OpenRouter's paid ":online" plugin, so — like Groq — the
// prompt doesn't claim search on this provider.

/** Known-good free models to prefer, best first. Anything here that's been retired is skipped automatically. */
const OPENROUTER_FREE_PREFERRED = [
  'qwen/qwen2.5-vl-72b-instruct:free', // vision — kept first in case it returns
  'google/gemma-3-27b-it:free', // vision
  'meta-llama/llama-4-maverick:free', // vision
  'qwen/qwen-2.5-72b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'deepseek/deepseek-r1:free',
]
const OPENROUTER_VISION_MODELS = new Set(['qwen/qwen2.5-vl-72b-instruct:free', 'google/gemma-3-27b-it:free', 'meta-llama/llama-4-maverick:free'])

/** Real proof of life: actually call the chat endpoint rather than trusting catalogue metadata. */
async function pingOpenRouterModelDetailed(model: string, apiKey: string): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://calibrate.app',
        'X-Title': 'Calibrate',
      },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
    })
    if (res.ok) return { ok: true, status: res.status }
    return { ok: false, status: res.status, body: (await res.text().catch(() => '')).slice(0, 140) }
  } catch {
    // Network/CORS failure — no status to report
    return { ok: false }
  }
}

async function pingOpenRouterModel(model: string, apiKey: string): Promise<boolean> {
  return (await pingOpenRouterModelDetailed(model, apiKey)).ok
}

/** 401/403 means the key itself is bad — no point brute-forcing every model with the same dead key. */
function isAuthFailure(status: number | undefined): boolean {
  return status === 401 || status === 403
}

interface OpenRouterModel {
  id: string
  architecture?: { input_modalities?: string[] }
}

/**
 * Ask OpenRouter what's actually available right now and pick the best free
 * model. Preference order: our curated list first (highest quality), then any
 * other ":free" model — vision-capable ones first when the request needs vision.
 */
export async function discoverOpenRouterFreeModel(needsVision: boolean): Promise<string | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models')
    if (!res.ok) return null
    const data: { data?: OpenRouterModel[] } = await res.json()
    const free = (data.data ?? []).filter((m) => m.id.endsWith(':free'))
    if (!free.length) return null

    const hasVision = (m: OpenRouterModel) => m.architecture?.input_modalities?.includes('image') ?? false
    const pool = needsVision ? free.filter(hasVision) : free
    if (!pool.length) return null

    const ids = new Set(pool.map((m) => m.id))
    const preferred = OPENROUTER_FREE_PREFERRED.find((id) => ids.has(id))
    if (preferred) return preferred

    // No curated hit — fall back to the largest-sounding model still standing
    const bySize = [...pool].sort((a, b) => {
      const size = (m: OpenRouterModel) => parseInt(m.id.match(/(\d+)b/i)?.[1] ?? '0', 10)
      return size(b) - size(a)
    })
    return bySize[0]?.id ?? null
  } catch {
    return null
  }
}

/** True when an OpenRouter error means "this model no longer exists" (vs. auth/rate issues). */
function isModelGone(e: unknown): boolean {
  return e instanceof ProviderError && e.provider === 'openrouter' && (e.status === 404 || /model.*(not found|does not exist|is not available)/i.test(e.message))
}

/**
 * Self-heal a dead OpenRouter model: discover a live free replacement, prove it
 * actually responds, persist it so every future call uses it, and return it
 * (null if nothing suitable). The catalogue call can itself be unreliable — CORS,
 * a transient outage, stale metadata — so if it doesn't produce a working model
 * we fall back to pinging our curated list directly against the chat endpoint,
 * which sidesteps the catalogue entirely.
 */
async function healOpenRouterModel(needsVision: boolean): Promise<string | null> {
  const apiKey = useStore.getState().settings.openrouterKey
  if (!apiKey) return null

  const discovered = await discoverOpenRouterFreeModel(needsVision)
  if (discovered && (await pingOpenRouterModel(discovered, apiKey))) {
    useStore.getState().setSettings({ openrouterModel: discovered })
    return discovered
  }

  const candidates = needsVision ? OPENROUTER_FREE_PREFERRED.filter((id) => OPENROUTER_VISION_MODELS.has(id)) : OPENROUTER_FREE_PREFERRED
  for (const id of candidates) {
    if (id === discovered) continue // already proven dead above
    if (await pingOpenRouterModel(id, apiKey)) {
      useStore.getState().setSettings({ openrouterModel: id })
      return id
    }
  }
  return null
}
function openRouterMessages(userText: string, image: string | undefined, chat: ChatMsg[]) {
  const history = historyFor(chat, userText) as { role: 'user' | 'assistant'; content: string | unknown }[]
  if (image) {
    const last = history[history.length - 1]
    const content = [
      { type: 'text', text: userText },
      { type: 'image_url', image_url: { url: image } },
    ]
    if (last && last.role === 'user') last.content = content
    else history.push({ role: 'user', content })
  }
  return history
}

async function callOpenRouter(userText: string, ctx: JarvisContext, image?: string, isRetry = false): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = [{ role: 'system', content: buildSystemPrompt(ctx, { webSearch: false }) }, ...openRouterMessages(userText, image, chat)]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.openrouterKey}`,
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://calibrate.app',
      'X-Title': 'Calibrate',
    },
    body: JSON.stringify({ model: settings.openrouterModel || 'qwen/qwen2.5-vl-72b-instruct:free', max_tokens: 2500, messages }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new ProviderError('openrouter', res.status, `OpenRouter ${res.status}: ${body.slice(0, 180)}`)
    // Free models get retired without notice — swap in a live one and retry once
    if (!isRetry && isModelGone(err) && (await healOpenRouterModel(!!image))) {
      return callOpenRouter(userText, ctx, image, true)
    }
    throw err
  }

  const data: { choices?: { message?: { content?: string } }[] } = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/**
 * Check if at least one LLM provider is configured and ready — not just the
 * chosen primary. If the primary has no key but a backup does, Jarvis still
 * has a brain to use (the failover chain will pick it up).
 */
export function llmConfigured(): boolean {
  return getProviderChain().length > 0
}

async function callProvider(p: LlmProvider, userText: string, ctx: JarvisContext, image?: string): Promise<string> {
  switch (p) {
    case 'anthropic':
      return callAnthropic(userText, ctx, image)
    case 'gemini':
      return callGemini(userText, ctx, image)
    case 'groq':
      return callGroq(userText, ctx)
    case 'openrouter':
      return callOpenRouter(userText, ctx, image)
    default:
      throw new Error('no provider configured')
  }
}

async function streamProvider(
  p: LlmProvider,
  userText: string,
  ctx: JarvisContext,
  image: string | undefined,
  onText: (delta: string) => void,
): Promise<string> {
  switch (p) {
    case 'anthropic':
      return streamAnthropic(userText, ctx, image, onText)
    case 'gemini':
      return streamGemini(userText, ctx, image, onText)
    case 'groq':
      return streamGroq(userText, ctx, onText)
    case 'openrouter':
      return streamOpenRouter(userText, ctx, image, onText)
    default:
      throw new Error('no provider configured')
  }
}

export interface LlmResult {
  reply: string
  receipts: string[]
  provider?: LlmProvider
}

/** Thrown when every provider in the chain is currently over its free-tier rate limit. */
export class AllProvidersRateLimitedError extends Error {
  constructor(public retryInSec: number) {
    super(`All configured brains are rate-limited right now. Retry in ~${retryInSec}s.`)
  }
}

/**
 * Parse a possibly-truncated JSON actions payload. Models sometimes hit the
 * token limit mid-block, leaving an unterminated fence — try progressively
 * appending closers so a cut-off block still executes instead of rendering
 * as raw JSON in the chat.
 */
function parseActionsJson(payload: string): { actions?: JarvisAction[] } | null {
  const attempts = [payload, payload + '"}]}', payload + '"}]}'.slice(1), payload + '}]}', payload + ']}', payload + '}']
  for (const p of attempts) {
    try {
      const parsed = JSON.parse(p)
      if (parsed && typeof parsed === 'object') return parsed as { actions?: JarvisAction[] }
    } catch {
      /* try the next repair */
    }
  }
  return null
}

/**
 * Parse trailing ```json action blocks out of a raw LLM reply; execute them.
 * `image` is the actual attached photo (if any) for THIS request — the model
 * only ever emits category/caption for log_photo, never image bytes, so we
 * splice the real attachment in here before it reaches applyActions.
 */
function extractAndApplyActions(raw: string, image?: string): LlmResult {
  let receipts: string[] = []
  let reply = raw

  const withImage = (actions: JarvisAction[]) =>
    image ? actions.map((a) => (a.type === 'log_photo' ? { ...a, imageData: image } : a)) : actions

  // Properly closed blocks
  const blocks = [...raw.matchAll(/```json\s*([\s\S]*?)```/g)]
  for (const b of blocks) {
    const parsed = parseActionsJson(b[1])
    if (parsed && Array.isArray(parsed.actions) && parsed.actions.length) {
      receipts = receipts.concat(applyActions(withImage(parsed.actions)))
    }
    // Strip the block from the displayed reply whether or not it parsed —
    // raw JSON in the chat is never useful to the user
    reply = reply.replace(b[0], '')
  }

  // Truncated trailing block (no closing fence — the reply got cut off)
  const openIdx = reply.lastIndexOf('```json')
  if (openIdx !== -1) {
    const payload = reply.slice(openIdx + 7).trim()
    const parsed = parseActionsJson(payload)
    if (parsed && Array.isArray(parsed.actions) && parsed.actions.length) {
      receipts = receipts.concat(applyActions(withImage(parsed.actions)))
    }
    reply = reply.slice(0, openIdx)
  }
  // Any other stray fence markers left behind
  reply = reply.replace(/```[a-z]*\s*$/i, '')

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
 * 2. Walk the provider failover chain — primary first, then every other
 *    configured provider — so a rate limit, quota error, or outage on one
 *    provider doesn't stop Jarvis; it just quietly tries the next brain.
 * 3. Parse and execute action blocks
 * 4. Return clean reply + receipts, noting the switch if one happened
 */
export async function runLlm(userText: string, ctx: JarvisContext, image?: string): Promise<LlmResult> {
  const chain = getProviderChain({ needsVision: !!image })
  if (!chain.length) {
    throw new Error('LLM not configured. Add an API key in Settings.')
  }

  const failures: string[] = []
  let rateLimitedCount = 0
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i]
    if (!canCall(p)) {
      rateLimitedCount++
      const { retryInSec } = rateLimitStatus(p)
      failures.push(`${providerLabel(p)}: rate-limited, retry in ~${retryInSec}s`)
      continue
    }
    recordCall(p)
    try {
      const raw = await callProvider(p, userText, ctx, image)
      const result = extractAndApplyActions(raw, image)
      result.provider = p
      if (i > 0) {
        result.receipts = [`Auto-switched to ${providerLabel(p)} — ${providerLabel(chain[0])} was unavailable`, ...result.receipts]
      }
      return result
    } catch (e) {
      failures.push(`${providerLabel(p)}: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  if (rateLimitedCount === chain.length) {
    throw new AllProvidersRateLimitedError(Math.min(...chain.map((p) => rateLimitStatus(p).retryInSec)))
  }
  throw new Error(`All configured brains failed. ${failures.join(' | ')}`)
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
      max_tokens: 2500,
      stream: true,
      system: buildSystemPrompt(ctx),
      messages,
      tools: [ANTHROPIC_WEB_SEARCH],
    }),
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new ProviderError('anthropic', res.status, `Anthropic ${res.status}: ${body.slice(0, 180)}`)
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
        generationConfig: { maxOutputTokens: 2500 },
      }),
    },
  )

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new ProviderError('gemini', res.status, `Gemini ${res.status}: ${body.slice(0, 180)}`)
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

async function streamGroq(userText: string, ctx: JarvisContext, onText: (delta: string) => void): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctx, { webSearch: false }) },
    ...historyFor(chat, userText),
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.groqKey}` },
    body: JSON.stringify({
      model: settings.groqModel || 'llama-3.3-70b-versatile',
      max_tokens: 2500,
      stream: true,
      messages,
    }),
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    throw new ProviderError('groq', res.status, `Groq ${res.status}: ${body.slice(0, 180)}`)
  }

  let full = ''
  await consumeSSE(res, (payload) => {
    try {
      const ev: { choices?: { delta?: { content?: string } }[] } = JSON.parse(payload)
      const text = ev.choices?.[0]?.delta?.content ?? ''
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

async function streamOpenRouter(
  userText: string,
  ctx: JarvisContext,
  image: string | undefined,
  onText: (delta: string) => void,
  isRetry = false,
): Promise<string> {
  const { settings, chat } = useStore.getState()
  const messages = [{ role: 'system', content: buildSystemPrompt(ctx, { webSearch: false }) }, ...openRouterMessages(userText, image, chat)]

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.openrouterKey}`,
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://calibrate.app',
      'X-Title': 'Calibrate',
    },
    body: JSON.stringify({
      model: settings.openrouterModel || 'qwen/qwen2.5-vl-72b-instruct:free',
      max_tokens: 2500,
      stream: true,
      messages,
    }),
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    const err = new ProviderError('openrouter', res.status, `OpenRouter ${res.status}: ${body.slice(0, 180)}`)
    // Free models get retired without notice — swap in a live one and retry once
    if (!isRetry && isModelGone(err) && (await healOpenRouterModel(!!image))) {
      return streamOpenRouter(userText, ctx, image, onText, true)
    }
    throw err
  }

  let full = ''
  await consumeSSE(res, (payload) => {
    try {
      const ev: { choices?: { delta?: { content?: string } }[] } = JSON.parse(payload)
      const text = ev.choices?.[0]?.delta?.content ?? ''
      if (text) {
        full += text
        onText(text)
      }
    } catch {
      /* ignore malformed frames (OpenRouter sends occasional keep-alive comments) */
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
 * while the model is still generating. Walks the same failover chain as
 * runLlm — if the primary provider errors before (or shortly after) it
 * starts streaming, the next configured provider picks up the request from
 * scratch. Falls back to the caller for a non-streaming retry only if every
 * provider in the chain fails. Action blocks execute after the stream
 * completes, exactly like the non-streaming path.
 */
export async function runLlmStream(userText: string, ctx: JarvisContext, image: string | undefined, handlers: StreamHandlers): Promise<LlmResult> {
  const chain = getProviderChain({ needsVision: !!image })
  if (!chain.length) {
    throw new Error('LLM not configured. Add an API key in Settings.')
  }

  const failures: string[] = []
  let rateLimitedCount = 0
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i]
    if (!canCall(p)) {
      rateLimitedCount++
      const { retryInSec } = rateLimitStatus(p)
      failures.push(`${providerLabel(p)}: rate-limited, retry in ~${retryInSec}s`)
      continue
    }
    recordCall(p)
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

    try {
      const full = await streamProvider(p, userText, ctx, image, collect)
      const result = extractAndApplyActions(full, image)
      result.provider = p
      if (i > 0) {
        result.receipts = [`Auto-switched to ${providerLabel(p)} — ${providerLabel(chain[0])} was unavailable`, ...result.receipts]
      }
      return result
    } catch (e) {
      failures.push(`${providerLabel(p)}: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  if (rateLimitedCount === chain.length) {
    throw new AllProvidersRateLimitedError(Math.min(...chain.map((p) => rateLimitStatus(p).retryInSec)))
  }
  throw new Error(`All configured brains failed. ${failures.join(' | ')}`)
}

// ————————————————————————————————————————————————————————
// CONNECTION TEST — lets the user verify a pasted key actually works,
// straight from Settings, with a real (tiny, cheap) round-trip.
// ————————————————————————————————————————————————————————

export interface ProviderTestResult {
  ok: boolean
  message: string
}

export async function testProvider(p: LlmProvider): Promise<ProviderTestResult> {
  const { settings } = useStore.getState()

  try {
    switch (p) {
      case 'anthropic': {
        if (!settings.anthropicKey) return { ok: false, message: 'No key set' }
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
            max_tokens: 8,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        })
        if (!res.ok) return { ok: false, message: `${res.status}: ${(await res.text().catch(() => '')).slice(0, 100)}` }
        return { ok: true, message: 'Connected' }
      }
      case 'gemini': {
        if (!settings.geminiKey) return { ok: false, message: 'No key set' }
        const model = settings.geminiModel || 'gemini-2.5-flash'
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${settings.geminiKey}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 8 } }),
          },
        )
        if (!res.ok) return { ok: false, message: `${res.status}: ${(await res.text().catch(() => '')).slice(0, 100)}` }
        return { ok: true, message: 'Connected' }
      }
      case 'groq': {
        if (!settings.groqKey) return { ok: false, message: 'No key set' }
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.groqKey}` },
          body: JSON.stringify({ model: settings.groqModel || 'llama-3.3-70b-versatile', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] }),
        })
        if (!res.ok) return { ok: false, message: `${res.status}: ${(await res.text().catch(() => '')).slice(0, 100)}` }
        return { ok: true, message: 'Connected' }
      }
      case 'openrouter': {
        if (!settings.openrouterKey) return { ok: false, message: 'No key set' }
        const model = settings.openrouterModel || 'qwen/qwen2.5-vl-72b-instruct:free'
        const first = await pingOpenRouterModelDetailed(model, settings.openrouterKey)
        if (first.ok) return { ok: true, message: 'Connected' }

        // A bad/expired key fails identically for every model — heal would just burn
        // requests re-proving the same auth error against the whole curated list.
        if (isAuthFailure(first.status)) {
          return { ok: false, message: `OpenRouter rejected this key (${first.status}) — check it's correct at openrouter.ai/keys` }
        }

        // Model retired or unreachable — heal now brute-forces the whole curated list
        // directly against the chat endpoint, so this succeeds even if the /models
        // catalogue call itself is flaky.
        const healed = await healOpenRouterModel(false)
        if (healed) return { ok: true, message: `"${model}" was retired — auto-switched to ${healed}` }
        return { ok: false, message: `Model "${model}" and every free fallback are unreachable right now — try again shortly or pick one at openrouter.ai/models` }
      }
      default:
        return { ok: false, message: 'Not applicable' }
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Network error' }
  }
}
