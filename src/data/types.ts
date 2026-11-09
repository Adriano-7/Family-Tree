export interface GalleryImage {
  src: string
  caption: string
  width: number
  height: number
}

export interface Person {
  id: string
  name: string
  /** "1938", "1938-04" or "1938-04-12" */
  born: string | null
  died: string | null
  birthplace: string | null
  parents: string[]
  spouses: string[]
  thumb: string | null
  portrait: string | null
  gallery: GalleryImage[]
  html: string
}
