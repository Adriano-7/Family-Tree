import { buildGraph } from './graph'
import type { Person } from './types'

export const DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/

export function emptyPerson(): Person {
  return {
    id: '',
    name: '',
    born: null,
    died: null,
    birthplace: null,
    parents: [],
    spouses: [],
    thumb: null,
    portrait: null,
    gallery: [],
    bio: '',
  }
}

/** "Maria da Silva" -> "maria-da-silva", with a number added if somebody already has it. */
export function slugFor(name: string, taken: Iterable<string>) {
  const used = new Set(taken)
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'person'
  let slug = base
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`
  return slug
}

export class EditError extends Error {
  constructor(public reason: 'name' | 'date' | 'loop') {
    super(reason)
  }
}

export interface EditResult {
  /** Everybody, after the change. */
  people: Person[]
  /** The people whose record has to be written. */
  changed: Person[]
}

/** Adds or replaces one person and keeps everybody else consistent with them. */
export function savePerson(people: Person[], person: Person): EditResult {
  const clean: Person = {
    ...person,
    name: person.name.trim(),
    parents: [...new Set(person.parents)].filter((p) => p !== person.id),
    spouses: [...new Set(person.spouses)].filter((s) => s !== person.id),
  }
  if (!clean.name) throw new EditError('name')
  if ([clean.born, clean.died].some((d) => d && !DATE_PATTERN.test(d))) throw new EditError('date')

  const changed = [clean]
  const next = people.filter((p) => p.id !== clean.id).map((other) => {
    // Somebody who used to be a partner must stop pointing back.
    if (other.spouses.includes(clean.id) && !clean.spouses.includes(other.id)) {
      const updated = { ...other, spouses: other.spouses.filter((s) => s !== clean.id) }
      changed.push(updated)
      return updated
    }
    return other
  })
  next.push(clean)
  try {
    buildGraph(next)
  } catch {
    throw new EditError('loop')
  }
  return { people: next, changed }
}

/** Removes one person and every mention of them. */
export function deletePerson(people: Person[], id: string): EditResult {
  const changed: Person[] = []
  const next = people
    .filter((p) => p.id !== id)
    .map((other) => {
      if (!other.parents.includes(id) && !other.spouses.includes(id)) return other
      const updated = {
        ...other,
        parents: other.parents.filter((p) => p !== id),
        spouses: other.spouses.filter((s) => s !== id),
      }
      changed.push(updated)
      return updated
    })
  return { people: next, changed }
}
