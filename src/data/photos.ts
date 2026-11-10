import type { GalleryImage, Person } from './types'

export interface PersonPhoto extends GalleryImage {
  /** Whose gallery the photo is kept in. */
  owner: string
}

/** A person's own photos, then those kept by other people that they appear in. */
export function photosOf(people: Person[], id: string): PersonPhoto[] {
  const own: PersonPhoto[] = []
  const shared: PersonPhoto[] = []
  for (const p of people)
    for (const g of p.gallery) {
      if (p.id === id) own.push({ ...g, owner: p.id })
      else if (g.with?.includes(id)) shared.push({ ...g, owner: p.id })
    }
  return [...own, ...shared]
}

/** Everybody who appears in a photo: whose gallery it is in, then the others. */
export const peopleIn = (photo: PersonPhoto) => [photo.owner, ...(photo.with ?? []).filter((x) => x !== photo.owner)]
