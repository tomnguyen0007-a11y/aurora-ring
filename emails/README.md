# AURORA — Hero Promo Email (Klaviyo-ready)

Dark, premium, athletic promo email for the **AURORA RING** (€109.90, no subscription).
Built in the production style of Recess / Trü Fru / Lemme: tall single-column scroll,
floating framed product, oversized display headline top **and** bottom, comparison block,
and a single electric-blue accent used with restraint.

**File:** [`aurora-hero-promo.html`](./aurora-hero-promo.html) — one responsive file (600px desktop → fluid 100% on mobile/390px). No separate mobile build needed.

---

## What's inside (matches the spec)

| Section | Content |
|---|---|
| Wordmark | `AURORA` (live text, letter-spaced) + accent hairline |
| Hero | `YOUR BODY TRACKS IT. / YOUR RING REMEMBERS IT.` + `No subscription. Ever.` |
| Primary CTA | `SHOP AURORA — €109` (white outline pill, hover-fills white) |
| Product hero | Framed dark card + radial-glow, real Shopify image `IMG_9592` |
| Pull quote | *"The ring that pays for itself in month one."* (italic serif) |
| Feature cards | ☾ Sleep Score · ∿ HRV Monitor · 7d Battery (`#13131A` / border `#2A2A3A`) |
| Comparison | Oura €5.99/mo · WHOOP €239+€30/mo · **AURORA €109. Done.** (highlighted `#0F1A40` + `#4A7AFF` left border) |
| Mid CTA | `GET AURORA NOW` (solid white — strongest in the hierarchy) |
| Closer | Lifestyle image + `WEAR THE DATA.` + `Get yours` |
| Footer | Wordmark, QRing note, address, unsubscribe / preferences |

**Design tokens used:** bg `#0A0A0F` · card `#13131A` · border `#2A2A3A` · text `#FFFFFF` /
secondary `#8A8A9A` · accent `#4A7AFF` · highlight `#0F1A40`. Display font `Archivo`
(Monument-Extended substitute, web-safe fallback to Helvetica Neue), body `Inter`,
pull-quote `Georgia` italic.

> **Live product data** (pulled from the connected store): AURORA RING, €109.90,
> handle `aurora-ring`, sizes 6–13 in Black/Silver/Gold, titanium 2.8 mm, IP68/50 m,
> 7-day battery. Images are hosted on Shopify's CDN, so they load directly in inboxes.

---

## Paste into Klaviyo (2 minutes)

1. **Campaigns / Flows → Create → Email →** choose template type **“Paste in HTML”** (or in any email, drag in an **HTML** block / open **Source code** ` </> `).
2. Open `aurora-hero-promo.html`, copy the **entire** file, paste it in, **Save**.
3. The file already uses Klaviyo's universal tags so it passes compliance automatically:
   - `{% unsubscribe %}` · `{% manage_preferences %}` · `{% web_view %}`
   - `{{ organization.name }}` / `{{ organization.full_address }}` → set under **Account → Settings → Contact information** (required physical address).
4. Send yourself a **preview/test** and click each button (all 4 CTAs deep-link to
   `auroraring.store/products/aurora-ring` with `utm_*` tracking).

> Optional personalization: add `{{ first_name|default:'' }}` if you want a greeting —
> intentionally omitted to keep the premium, founder-voice tone.

---

## Automation

### A) Welcome / registration flow (triggered when people sign up)

Sends this offer automatically the moment someone joins.

1. **Flows → Create flow → Build your own.**
2. **Trigger** — pick one:
   - **List trigger:** *Added to list* → your **Newsletter** list (newsletter/popup signups), **or**
   - **Metric trigger:** *Subscribed to Email Marketing* (catches consent from anywhere), **or**
   - **Shopify metric:** *Created Account* / *Active on Site* if you want account registrations specifically.
3. **(Recommended) Smart Sending ON** + add a **Conditional split**: only continue if
   `Has placed order zero times` → so you don't pitch the ring to existing buyers.
4. Drag an **Email** action in → paste `aurora-hero-promo.html` (as above).
5. Suggested timing: **Email 1 immediately**, then an optional **Email 2 after 2 days**
   (re-use this template, swap the headline to a soft nudge + the comparison block).
6. **Review → Set live.** New registrants now auto-receive the offer.

### B) One-time campaign (send to "random people" / a segment now)

For a broadcast to your existing list:

1. **Campaigns → Create campaign → Email.**
2. **Audience:** target a segment, e.g.
   `Email consent = subscribed AND Placed order zero times AND (Active in last 90 days)`.
   Add an **exclusion** for anyone already in the welcome flow to avoid doubles.
3. Paste the same `aurora-hero-promo.html`.
4. **Subject line A/B test** (see below), schedule for a high-open window
   (Tue–Thu, ~10:00 or 18:00 recipient local), send.

### Subject lines + preview text (founder voice, no hype)

| Subject | Preview text |
|---|---|
| All the data. None of the subscription. | Pay €109 once — no monthly fee, ever. |
| Your ring shouldn't have a monthly bill. | Sleep, HRV and recovery. One price. Done. |
| The smart ring that pays for itself in month one. | Titanium. 7-day battery. Zero subscription. |

The hidden preheader in the HTML defaults to: *"Pay €109 once. Sleep score, HRV and recovery on your finger — no monthly fee, ever."*

---

## Compatibility & QA

- **Tested-pattern build:** table layout, inline styles, `role="presentation"`, MSO conditionals, `bgcolor` fallbacks behind every gradient → renders in Apple Mail, iOS, Gmail (web/app), Outlook (desktop falls back to square corners + solid bg, content intact).
- **Dark-mode safe:** `color-scheme` meta + `[data-ogsc]` overrides so the already-dark art isn't inverted.
- **Web fonts** (`Archivo`/`Inter`) load in Apple Mail/iOS; all other clients fall back to Helvetica Neue/Arial — hierarchy holds either way.
- **Accessibility:** semantic `role="article"`, alt text on images, 4.5:1+ contrast on body copy, real `<a>` links.
- **Motion:** only a subtle glow pulse, wrapped in `prefers-reduced-motion: no-preference` (Apple Mail only) — purely additive, never required to read the email.

### Pre-send checklist
- [ ] Set org contact address in Klaviyo (legal requirement).
- [ ] Send a test to Gmail + Apple Mail + Outlook.
- [ ] Confirm all 4 CTAs land on the live product page.
- [ ] Confirm the unsubscribe link resolves.
- [ ] Spam-test (e.g. Klaviyo preview / a seed-list tool) before the broadcast.

> **Optional polish:** the radial glow uses CSS (great in Apple/iOS, ignored by Outlook,
> which falls back to solid black). For a pixel-identical glow everywhere, swap in a
> hosted background PNG behind the hero `<td>` — left as CSS to avoid an extra asset dependency.
