import { buildGraph, type Graph, lineage, pairKey, siblings } from './graph'
import type { Person } from './types'

export const DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/

export function emptyPerson(): Person {
  return {
    id: '',
    name: '',
    nickname: null,
    born: null,
    died: null,
    birthplace: null,
    parents: [],
    spouses: [],
    separated: [],
    godparents: [],
    families: [],
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

/** Tidy side names; "machado" and "Machado" are the same side (the first spelling wins). */
export function cleanFamilies(names: string[] | undefined) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names ?? []) {
    const name = raw.trim().replace(/\s+/g, ' ')
    const key = name.toLocaleLowerCase('pt')
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
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
    nickname: person.nickname?.trim() || null,
    parents: [...new Set(person.parents)].filter((p) => p !== person.id),
    spouses: [...new Set(person.spouses)].filter((s) => s !== person.id),
    // Only somebody who is (or was) a partner can be separated from.
    separated: [...new Set(person.separated ?? [])].filter((s) => s !== person.id && person.spouses.includes(s)),
    godparents: [...new Set(person.godparents ?? [])].filter((g) => g !== person.id),
    families: cleanFamilies(person.families),
    gallery: person.gallery.map((g) => ({ ...g, with: [...new Set(g.with ?? [])].filter((x) => x !== person.id) })),
  }
  if (!clean.name) throw new EditError('name')
  if ([clean.born, clean.died].some((d) => d && !DATE_PATTERN.test(d))) throw new EditError('date')

  const changed = [clean]
  const next = people.filter((p) => p.id !== clean.id).map((other) => {
    // Somebody who used to be a partner must stop pointing back, and a separation
    // taken away on one side must go on the other too.
    const dropPartner = other.spouses.includes(clean.id) && !clean.spouses.includes(other.id)
    const dropSeparation = (other.separated ?? []).includes(clean.id) && !clean.separated.includes(other.id)
    if (dropPartner || dropSeparation) {
      const updated = {
        ...other,
        spouses: dropPartner ? other.spouses.filter((s) => s !== clean.id) : other.spouses,
        separated: (other.separated ?? []).filter((s) => s !== clean.id),
      }
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
      const inPhotos = other.gallery.some((g) => g.with?.includes(id))
      const mentioned = [other.parents, other.spouses, other.separated ?? [], other.godparents ?? []].some((list) => list.includes(id))
      if (!mentioned && !inPhotos) return other
      const updated = {
        ...other,
        parents: other.parents.filter((p) => p !== id),
        spouses: other.spouses.filter((s) => s !== id),
        separated: (other.separated ?? []).filter((s) => s !== id),
        godparents: (other.godparents ?? []).filter((g) => g !== id),
        gallery: inPhotos ? other.gallery.map((g) => (g.with ? { ...g, with: g.with.filter((x) => x !== id) } : g)) : other.gallery,
      }
      changed.push(updated)
      return updated
    })
  return { people: next, changed }
}

export type Relative = 'child' | 'partner' | 'parent' | 'sibling' | 'godparent' | 'godchild'

/**
 * Who could be linked to this person as that relative without breaking the tree: not themselves,
 * not their own ancestors or descendants (for a child, parent or sibling), nobody already linked
 * that way, and nobody who already has two parents (as a child) or other parents (as a sibling).
 */
export function linkCandidates(graph: Graph<Person>, id: string, relative: Relative): Person[] {
  const me = graph.byId.get(id)
  if (!me) return []
  const line = lineage(graph, id).line
  const knownParents = (p: Person) => p.parents.filter((x) => graph.byId.has(x))
  const partners = new Set(graph.spouses.get(id) ?? [])
  const children = new Set(graph.children.get(id) ?? [])
  const brothers = new Set(siblings(graph, id))
  return graph.people.filter((p) => {
    if (p.id === id) return false
    if (relative === 'partner') return !partners.has(p.id)
    if (relative === 'godparent') return !(me.godparents ?? []).includes(p.id)
    if (relative === 'godchild') return !(p.godparents ?? []).includes(id)
    if (line.has(p.id)) return false
    if (relative === 'child') return !children.has(p.id) && knownParents(p).length < 2
    if (relative === 'parent') return knownParents(me).length < 2
    return !brothers.has(p.id) && knownParents(p).length === 0
  })
}

/**
 * A record with every partner and separation written on it, including those only the other
 * person wrote down. `savePerson` reads a record's partners as the complete list, so a record
 * changed for another reason must carry them all, or the missing ones would be dropped.
 */
export function withAllPartners(graph: Graph<Person>, p: Person): Person {
  const spouses = [...new Set([...p.spouses, ...(graph.spouses.get(p.id) ?? [])])]
  return { ...p, spouses, separated: spouses.filter((s) => graph.separated.has(pairKey(p.id, s))) }
}

/** The one record to change so that `other` becomes this relative of `me`. */
export function linkExisting(graph: Graph<Person>, mine: Person, relative: Relative, theirs: Person): Person {
  const me = withAllPartners(graph, mine)
  const other = withAllPartners(graph, theirs)
  if (relative === 'partner') return { ...me, spouses: [...me.spouses, other.id] }
  if (relative === 'parent') return { ...me, parents: [...me.parents, other.id] }
  if (relative === 'godparent') return { ...me, godparents: [...(me.godparents ?? []), other.id] }
  if (relative === 'godchild') return { ...other, godparents: [...(other.godparents ?? []), me.id] }
  if (relative === 'sibling') return { ...other, parents: me.parents.filter((p) => graph.byId.has(p)) }
  // A child with no parents yet gets this person's partner too, as a new child would, when there is only one.
  const partners = graph.spouses.get(me.id) ?? []
  const known = other.parents.filter((p) => graph.byId.has(p))
  return { ...other, parents: known.length === 0 && partners.length === 1 ? [me.id, partners[0]] : [...known, me.id] }
}

/** A change to a photo kept in somebody else's gallery, made by somebody who appears in it. */
export interface PhotoEdit {
  /** Whose gallery the photo is kept in. */
  owner: string
  src: string
  caption: string
  with: string[]
}

/** Writes changes to photos into the galleries they are kept in. */
export function editPhotos(people: Person[], edits: PhotoEdit[]): EditResult {
  const changed: Person[] = []
  const next = people.map((p) => {
    const mine = edits.filter((e) => e.owner === p.id)
    if (!mine.length) return p
    let touched = false
    const gallery = p.gallery.map((g) => {
      const edit = mine.find((e) => e.src === g.src)
      if (!edit) return g
      const withIds = [...new Set(edit.with)].filter((x) => x !== p.id)
      const caption = edit.caption.trim()
      if (caption === g.caption && withIds.join() === (g.with ?? []).join()) return g
      touched = true
      const { with: _, ...rest } = g
      return { ...rest, caption, ...(withIds.length ? { with: withIds } : {}) }
    })
    if (!touched) return p
    const updated = { ...p, gallery }
    changed.push(updated)
    return updated
  })
  return { people: next, changed }
}
