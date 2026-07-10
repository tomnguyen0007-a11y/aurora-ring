import { Camera, ImagePlus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { todayISO } from '../lib/dates'
import { loadPhoto, peekPhoto } from '../lib/photoDb'
import { useStore } from '../store/store'
import type { TrainingPhoto } from '../store/types'
import { Empty, HudLabel, InlineEdit, Panel } from './ui'

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

/** Group photos by date, newest date first — the Strava-style day-by-day feed. */
function groupByDate(photos: TrainingPhoto[]): [string, TrainingPhoto[]][] {
  const map = new Map<string, TrainingPhoto[]>()
  for (const p of photos) {
    const bucket = map.get(p.date)
    if (bucket) bucket.push(p)
    else map.set(p.date, [p])
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? 1 : -1))
}

function Thumb({ photo, onOpen }: { photo: TrainingPhoto; onOpen: () => void }) {
  const url = usePhotoUrl(photo)
  return (
    <button
      onClick={onOpen}
      aria-label={photo.caption || `Photo from ${photo.date}`}
      className="group relative aspect-square overflow-hidden rounded-lg border border-edge"
    >
      {url ? (
        <img src={url} alt={photo.caption || ''} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      ) : (
        <span className="block h-full w-full animate-pulse bg-white/5" />
      )}
      {photo.caption && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1 text-[9px] text-ice">
          {photo.caption}
        </span>
      )}
    </button>
  )
}

function Lightbox({ photo, onClose }: { photo: TrainingPhoto; onClose: () => void }) {
  const s = useStore()
  const url = usePhotoUrl(photo)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-lg animate-rise" onClick={(e) => e.stopPropagation()}>
        {url ? (
          <img src={url} alt={photo.caption || ''} className="max-h-[70vh] w-full rounded-xl object-contain" />
        ) : (
          <div className="h-64 w-full animate-pulse rounded-xl bg-white/5" />
        )}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/60 p-3">
          <span className="num shrink-0 text-xs text-fog">
            {new Date(photo.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <InlineEdit
            value={photo.caption ?? ''}
            placeholder="Add a caption…"
            label={`Caption for photo from ${photo.date}`}
            className="min-w-0 flex-1 text-sm text-ice"
            onSave={(v) => s.updateTrainingPhoto(photo.id, { caption: v })}
          />
          <button
            type="button"
            aria-label="Delete photo"
            onClick={() => {
              s.removeTrainingPhoto(photo.id)
              onClose()
            }}
          >
            <Trash2 size={15} className="text-alert/70" />
          </button>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={15} className="text-haze" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Dated photo log for Golf/Training — "what did I actually do that day," like
 * Strava. Upload directly here, or attach a photo to Jarvis and say "log this
 * to golf/training" — both land in the same gallery, filtered by category.
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
      <Panel>
      <div className="mb-3 flex items-center justify-between">
        <HudLabel className="!mb-0">
          <Camera size={11} className="text-arc" /> Photo Log
        </HudLabel>
        <button type="button" className="btn btn-ghost !py-1 !text-xs" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImagePlus size={13} /> {busy ? 'Adding…' : 'Add photo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && importFiles(e.target.files)}
        />
      </div>

      {groups.length ? (
        <div className="space-y-3">
          {groups.map(([date, dayPhotos]) => (
            <div key={date}>
              <div className="num mb-1.5 text-[10px] text-fog">
                {new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {dayPhotos.map((p) => (
                  <Thumb key={p.id} photo={p} onOpen={() => setActiveId(p.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>
          No photos yet. Add one, or send Jarvis a photo and say “log this to {category === 'golf' ? 'golf training' : 'training'}.”
        </Empty>
      )}
      </Panel>

      {/* Rendered as a sibling of Panel, not a child — Panel's backdrop-filter (the
          glass effect) creates a new containing block for position:fixed descendants,
          which would trap this overlay inside the panel's bounds instead of the viewport. */}
      {active && <Lightbox photo={active} onClose={() => setActiveId(null)} />}
    </>
  )
}
