import { useEffect, useRef, useState } from 'react'
import type { GalleryImage } from '../data/types'
import { asset } from './format'
import { strings } from './strings'

export function Gallery({ images }: { images: GalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const current = index === null ? null : images[index]

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (current && !d.open) d.showModal()
    if (!current && d.open) d.close()
  }, [current])

  const step = (by: number) => setIndex((i) => (i === null ? i : (i + by + images.length) % images.length))

  return (
    <>
      <ul className="gallery">
        {images.map((img, i) => (
          <li key={img.src}>
            <button type="button" onClick={() => setIndex(i)} aria-label={`${strings.openPhoto}: ${img.caption || i + 1}`}>
              <img src={asset(img.src)} alt={img.caption} width={img.width} height={img.height} loading="lazy" />
            </button>
            {img.caption && <p>{img.caption}</p>}
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className="lightbox"
        onClose={() => setIndex(null)}
        onClick={(e) => e.target === e.currentTarget && setIndex(null)}
        onKeyDown={(e) => {
          // Keep Escape from also closing the person panel behind the photo.
          if (e.key === 'Escape') e.stopPropagation()
          if (e.key === 'ArrowRight') step(1)
          if (e.key === 'ArrowLeft') step(-1)
        }}
      >
        {current && (
          <figure>
            <img src={asset(current.src)} alt={current.caption} width={current.width} height={current.height} />
            <figcaption>
              {images.length > 1 && (
                <button type="button" onClick={() => step(-1)} aria-label={strings.previousPhoto}>
                  ‹
                </button>
              )}
              <span>{current.caption}</span>
              {images.length > 1 && (
                <button type="button" onClick={() => step(1)} aria-label={strings.nextPhoto}>
                  ›
                </button>
              )}
              <button type="button" className="text" onClick={() => setIndex(null)}>
                {strings.close}
              </button>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  )
}
