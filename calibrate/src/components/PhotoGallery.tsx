import { useEffect, useRef, useState } from 'react'
import { todayISO } from '../lib/dates'
import { loadPhoto, peekPhoto } from '../lib/photoDb'
import { useStore } from '../store/store'
import type { TrainingPhoto } from '../store/types'
import { Icon } from './icons'
import { DangerBtn, Empty, InlineText, Section } from './ui'

/**
 * Resolve a photo's image data: blobs live in IndexedDB (see lib/photoDb), the
 * store holds metadata only. Just-added photos and legacy pre-migration entries
 * resolve synchronously; everything else arrives one async read later.
 */
function usePhotoUrl(photo: TrainingPhoto): string | null {
  const [url, setUrl] = useState<string | null>(() => photo.dataUrl ?? peekPhoto(photo.id))
  useEffect(() => {
    if (url) return
    let live = true
    void loadPhoto(photo.id).then((v) => {
      if (live && v) setUrl(v)
    })
    return () => {
      live = false
    }
  }, [photo.id, url])
  return url
}

/** Group photos by date, newest date first — the day-by-day feed. */
function groupByDate(photos: TrainingPhoto[]): [string, TrainingPhoto[]][] {
  const map = new Map<string, TrainingPhoto[]>()
  for (const p of photos) {
    const bucket = map.get(p.date)
    if (bucket) bucket.push(p)
    else map.set(p.date, [p])
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
}

function fmtDay(date: string): string {
  return new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function Thumb({ photo, onOpen }: { photo: TrainingPhoto; onOpen: () => void }) {
  const url = usePhotoUrl(photo)
  return (
    <button
      onClick={onOpen}
      aria-label={photo.caption || `Photo from ${photo.date}`}
      className="group relative aspect-square overflow-hidden border border-line transition-colors hover:border-line-2"
    >
      {url ? (
        <img
          src={url}
          alt={photo.caption || ''}
          className="h-full w-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
        />
      ) : (
        <span className="block h-full w-full animate-breathe bg-ink-2" />
      )}
      {photo.caption && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-ink/80 px-1.5 py-1 text-[9px] text-mute">
          {photo.caption}
        </span>
      )}
    </button>
  )
}

function Lightbox({ photo, onClose }: { photo: TrainingPhoto; onClose: () => void }) {
  const s = useStore()
  const url = usePhotoUrl(photo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/92 p-4" onClick={onClose}>
      <div className="animate-lift w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <img src={url} alt={photo.caption || ''} className="max-h-[70vh] w-full border border-line object-contain" />
        ) : (
          <div className="h-64 w-full animate-breathe border border-line bg-ink-2" />
        )}
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
          <span className="num shrink-0 text-micro text-faint">
            {new Date(photo.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <InlineText
            value={photo.caption ?? ''}
            placeholder="Add a caption…"
            ariaLabel={`Caption for photo from ${photo.date}`}
            className="min-w-0 flex-1 text-body text-paper"
            onChange={(v) => s.updateTrainingPhoto(photo.id, { caption: v })}
          />
          <DangerBtn
            label="Delete"
            onConfirm={() => {
              s.removeTrainingPhoto(photo.id)
              onClose()
            }}
          />
          <button type="button" aria-label="Close" onClick={onClose} className="p-1 text-faint hover:text-paper">
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Dated photo log for Golf/Training — what actually happened that day. Upload
 * here, or attach a photo to Jarvis and say "log this to golf/training" — both
 * land in the same gallery, filtered by category.
 */
export function PhotoGallery({ category }: { category: 'golf' | 'training' }) {
  const s = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const photos = s.trainingPhotos.filter((p) => p.category === category).sort((a, b) => b.createdAt - a.createdAt)
  const groups = groupByDate(photos)
  const active = photos.find((p) => p.id === activeId)

  const importFiles = async (files: FileList) => {
    setBusy(true)
    try {
      const { fileToDataURL } = await import('../lib/image')
      for (const file of Array.from(files)) {
        const dataUrl = await fileToDataURL(file)
        s.addTrainingPhoto({ date: todayISO(), category, dataUrl })
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <Section
        label="Photo log"
        aside={
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Adding…' : 'Add photo'}
          </button>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && void importFiles(e.target.files)}
        />

        {groups.length ? (
          <div className="space-y-6">
            {groups.map(([date, dayPhotos]) => (
              <div key={date}>
                <div className="num mb-2 border-b border-line pb-1.5 text-micro text-faint">{fmtDay(date)}</div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
                  {dayPhotos.map((p) => (
                    <Thumb key={p.id} photo={p} onOpen={() => setActiveId(p.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>
            No photos yet. Add one, or send Jarvis a photo and say “log this to{' '}
            {category === 'golf' ? 'golf training' : 'training'}.”
          </Empty>
        )}
      </Section>

      {/* Sibling of Section, not a child: a transformed/filtered ancestor would
          become the containing block for this fixed overlay and trap it. */}
      {active && <Lightbox photo={active} onClose={() => setActiveId(null)} />}
    </>
  )
}
