# AURORA — Klaviyo Cowork Prompt Guide

Paste the prompt below into your Klaviyo cowork / Marketing Agent, and attach the file
**`aurora-hero-promo.html`** (the premium dark, Klaviyo-ready email).

---

## 🔹 PROMPT TO PASTE

> You are setting up email marketing for **AURORA** (auroraring.store), a premium titanium
> smart ring — €109.90, **no subscription ever**. Brand is **dark/premium, Oura-style**:
> black background (#000000), white text, white logo, monochrome. Font: Inter.
>
> I'm attaching a finished, responsive HTML email (`aurora-hero-promo.html`). It already
> contains Klaviyo tags (`{% web_view %}`, `{% unsubscribe %}`, `{% manage_preferences %}`,
> `{{ organization.full_address }}`). **Do not redesign it — import it as raw HTML.**
>
> Please do the following:
>
> **1) Brand settings** → Set logo to the AURORA white wordmark, primary/button color
> `#000000`, text `#000000`, background `#FFFFFF`. Remove the auto-detected green accent.
>
> **2) Create the email** → New email → template type **"Paste in HTML"** → paste the full
> contents of `aurora-hero-promo.html` → Save. Subject line: **"Your body. Deeply understood."**
> Preview text: **"€109 once. Sleep, HRV, recovery. No subscription, ever."**
>
> **3) Welcome flow** → Create flow → trigger **"Added to list"** on my main newsletter /
> sign-up list. Add an **Email** action using the email from step 2. Add a **Conditional
> split**: only continue if **"Placed order zero times"** (so buyers don't get the pitch).
> Set the flow **Live**.
>
> **4) (Optional) One-time campaign** → Audience: subscribed AND placed order zero times AND
> active in last 90 days. Use the same email. Schedule Tue–Thu, ~10:00 or 18:00 local.
>
> Before finishing: send me a **preview/test** and confirm all CTA buttons link to
> `auroraring.store/products/aurora-ring` and that the unsubscribe link resolves.

---

## 🔹 Quick reference (for you)

| Field | Value |
|---|---|
| Subject A | Your body. Deeply understood. |
| Subject B | The smart ring with no monthly bill. |
| Preview text | €109 once. Sleep, HRV, recovery. No subscription, ever. |
| Primary color | `#000000` (black) |
| Background | `#FFFFFF` page / email art is `#000000` |
| Product URL | https://auroraring.store/products/aurora-ring |
| Price | €109.90 · Black/Silver/Gold · sizes 6–13 |

## 🔹 Flow timing (recommended)
- **Email 1:** immediately on signup (this design)
- **Email 2:** +2 days — reuse template, swap headline to a soft nudge, lead with the
  comparison block (Oura €5.99/mo vs AURORA €109 done).

## 🔹 Compliance note
The HTML already includes unsubscribe + preferences + org address tags, so it passes
Klaviyo's required-elements check on import. Just make sure your physical address is set
under **Account → Settings → Contact information**.
