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
  /** Partners (from `spouses`) this person separated or divorced from. Either of the two may list it. */
  separated: string[]
  /** The family sides that start with this person ("Machado"); their descendants belong to them too. */
  families: string[]
  thumb: string | null
  portrait: string | null
  gallery: GalleryImage[]
  /** The story, as Markdown text. */
  bio: string
}
