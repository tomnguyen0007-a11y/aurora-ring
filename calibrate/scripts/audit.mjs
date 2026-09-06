import { chromium } from 'playwright'
import fs from 'fs'

const b = await chromium.launch({ channel: 'chrome' })
const errs = []
const report = []

const measure = () => {
  const W = document.documentElement.clientWidth
  const over = [...document.querySelectorAll('*')].filter((e) => e.scrollWidth > W + 1)
  const leaves = over.filter((e) => ![...e.querySelectorAll('*')].some((c) => over.includes(c)))
  return {
    docScroll: document.documentElement.scrollWidth,
    docClient: W,
    offenders: leaves.slice(0, 4).map((e) => ({
      cls: String(e.className).slice(0, 70),
      sw: e.scrollWidth,
      txt: (e.innerText || '').replace(/\n/g, ' / ').slice(0, 40),
    })),
  }
}

async function newPage(w, h, tag) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const p = await ctx.newPage()
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push(`${tag}: ${m.text()}`)
  })
  p.on('pageerror', (e) => errs.push(`${tag} PAGEERROR: ${e.message}`))
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  return { ctx, p }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function check(p, tag, label) {
  await p.waitForTimeout(600)
  const m = await p.evaluate(measure)
  if (m.docScroll > m.docClient + 1) report.push({ tag, label, ...m })
  await p.screenshot({ path: `/tmp/shots/${tag}-${label.toLowerCase().replace(/\W+/g, '')}.png`, fullPage: true })
}

fs.mkdirSync('/tmp/shots', { recursive: true })

{
  const { ctx, p } = await newPage(1440, 900, 'desktop')
  const labels = await p.$$eval('aside nav button', (bs) => bs.map((x) => x.innerText.trim()).filter(Boolean))
  for (const label of labels) {
    await p.locator('aside nav button', { hasText: new RegExp(`^${esc(label)}$`) }).first().click()
    await check(p, 'desktop', label)
  }
  console.log('DESKTOP_SECTIONS:', labels.join(','))
  await ctx.close()
}

{
  const { ctx, p } = await newPage(390, 844, 'mobile')
  await p.locator('nav[aria-label="Primary"] button', { hasText: 'Index' }).click()
  await p.waitForTimeout(600)
  const labels = await p.$$eval('body > div:last-of-type button, [role="dialog"] button', (bs) =>
    [...new Set(bs.map((x) => x.innerText.trim()))].filter((t) => t && t.length < 20),
  )
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  for (const label of labels) {
    await p.locator('nav[aria-label="Primary"] button', { hasText: 'Index' }).click().catch(() => {})
    await p.waitForTimeout(400)
    const hit = p.locator('button', { hasText: new RegExp(`^${esc(label)}$`) }).last()
    if (!(await hit.count())) continue
    await hit.click({ timeout: 3000 }).catch(() => {})
    await check(p, 'mobile', label)
  }
  console.log('MOBILE_SECTIONS:', labels.join(','))
  await ctx.close()
}

await b.close()
console.log('OVERFLOW:', JSON.stringify(report, null, 1))
console.log('CONSOLE_ERRORS:', JSON.stringify([...new Set(errs)].slice(0, 20), null, 1))
