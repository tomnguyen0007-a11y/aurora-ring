/* ═══════════════════════════════════════════════════════════════════
   BRAND MARK
   The mark in the sidebar, the mobile top bar and the browser tab is
   whatever image you put here. Drop in an SVG or PNG and it replaces
   the default wing everywhere, including the favicon and the installed
   PWA tab icon. Nothing ships with the app — it is your file, stored
   locally and synced with the rest of your state.
   ═══════════════════════════════════════════════════════════════════ */

/** Hard ceiling. Anything bigger bloats localStorage and every sync push. */
const MAX_BYTES = 180_000
const MAX_EDGE = 512

export interface MarkResult {
  dataUrl: string
  kind: 'svg' | 'raster'
  bytes: number
}

/** Read a picked file into a data URL, downscaling rasters and inlining SVG. */
export async function fileToMark(file: File): Promise<MarkResult> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

  if (isSvg) {
    let text = await file.text()
    // Own app, own file — but an inline <script> in an <img src> is never wanted.
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '')
    if (!/<svg[\s>]/i.test(text)) throw new Error('That file is not an SVG.')
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
    if (dataUrl.length > MAX_BYTES) throw new Error('SVG is too large — simplify it or export a PNG.')
    return { dataUrl, kind: 'svg', bytes: dataUrl.length }
  }

  if (!file.type.startsWith('image/')) throw new Error('Pick an image file.')

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  let dataUrl = canvas.toDataURL('image/png')
  if (dataUrl.length > MAX_BYTES) dataUrl = canvas.toDataURL('image/webp', 0.9)
  if (dataUrl.length > MAX_BYTES) throw new Error('Image is too heavy — try a simpler, flatter mark.')
  return { dataUrl, kind: 'raster', bytes: dataUrl.length }
}

/** Point the tab icon at the mark. Falls back to the shipped icon when cleared. */
export function applyFavicon(mark: string | undefined, invert: boolean) {
  const set = (rel: string, href: string, type?: string) => {
    let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
    if (!el) {
      el = document.createElement('link')
      el.rel = rel
      document.head.appendChild(el)
    }
    if (type) el.type = type
    el.href = href
  }

  if (!mark) {
    set('icon', `${import.meta.env.BASE_URL}icon.svg`, 'image/svg+xml')
    set('apple-touch-icon', `${import.meta.env.BASE_URL}apple-touch-icon.png`)
    return
  }

  // A tab icon sits on the browser's own chrome, so it gets a black plate and
  // the same inversion the sidebar uses — otherwise a black-on-transparent
  // mark disappears in dark mode.
  const size = 180
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, size, size)
    const pad = size * 0.14
    const box = size - pad * 2
    const r = Math.min(box / img.width, box / img.height)
    const w = img.width * r
    const h = img.height * r
    if (invert) ctx.filter = 'invert(1)'
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    const url = c.toDataURL('image/png')
    set('icon', url, 'image/png')
    set('apple-touch-icon', url)
  }
  img.onerror = () => {
    /* keep whatever the tab already shows */
  }
  img.src = mark
}
