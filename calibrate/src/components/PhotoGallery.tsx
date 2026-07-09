import { Camera, ImagePlus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { todayISO } from '../lib/dates'
import { useStore } from '../store/store'
import type { TrainingPhoto } from '../store/types'
import { Empty, HudLabel, InlineEdit, Panel } from './ui'

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
                  <button
                    key={p.id}
                    onClick={() => setActiveId(p.id)}
                    aria-label={p.caption || `Photo from ${date}`}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-edge"
                  >
                    <img src={p.dataUrl} alt={p.caption || ''} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    {p.caption && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 py-1 text-[9px] text-ice">
                        {p.caption}
                      </span>
                    )}
                  </button>
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
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setActiveId(null)}>
          <div className="w-full max-w-lg animate-rise" onClick={(e) => e.stopPropagation()}>
            <img src={active.dataUrl} alt={active.caption || ''} className="max-h-[70vh] w-full rounded-xl object-contain" />
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/60 p-3">
              <span className="num shrink-0 text-xs text-fog">
                {new Date(active.date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <InlineEdit
                value={active.caption ?? ''}
                placeholder="Add a caption…"
                label={`Caption for photo from ${active.date}`}
                className="min-w-0 flex-1 text-sm text-ice"
                onSave={(v) => s.updateTrainingPhoto(active.id, { caption: v })}
              />
              <button
                type="button"
                aria-label="Delete photo"
                onClick={() => {
                  s.removeTrainingPhoto(active.id)
                  setActiveId(null)
                }}
              >
                <Trash2 size={15} className="text-alert/70" />
              </button>
              <button type="button" aria-label="Close" onClick={() => setActiveId(null)}>
                <X size={15} className="text-haze" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
