import type { Person } from './types'

export type PersonLinks = Pick<Person, 'id' | 'name' | 'born' | 'parents' | 'spouses'> & { families?: string[] }

export interface Graph<T extends PersonLinks = Person> {
  people: T[]
  byId: Map<string, T>
  children: Map<string, string[]>
  /** Symmetric: if A lists B as a spouse, B also has A. */
  spouses: Map<string, string[]>
  /** 0 is the oldest generation. */
  generation: Map<string, number>
  generationCount: number
}

export function buildGraph<T extends PersonLinks>(people: T[]): Graph<T> {
  const byId = new Map(people.map((p) => [p.id, p]))
  const children = new Map<string, string[]>(people.map((p) => [p.id, []]))
  const spouseSets = new Map<string, Set<string>>(people.map((p) => [p.id, new Set()]))

  for (const p of people) {
    for (const parent of p.parents) children.get(parent)?.push(p.id)
    for (const s of p.spouses) {
      if (!byId.has(s) || s === p.id) continue
      spouseSets.get(p.id)!.add(s)
      spouseSets.get(s)!.add(p.id)
    }
  }

  const byAge = (a: string, b: string) => {
    const pa = byId.get(a)!
    const pb = byId.get(b)!
    return (pa.born ?? '9999').localeCompare(pb.born ?? '9999') || pa.name.localeCompare(pb.name)
  }
  for (const list of children.values()) list.sort(byAge)
  const spouses = new Map([...spouseSets].map(([id, set]) => [id, [...set].sort(byAge)]))

  assertNoAncestorLoop(people, byId)

  // A child sits one layer below their lowest parent; partners share a layer.
  const generation = new Map<string, number>(people.map((p) => [p.id, 0]))
  for (let pass = 0, changed = true; changed && pass <= people.length + 1; pass++) {
    changed = false
    for (const p of people) {
      let g = 0
      for (const parent of p.parents) if (byId.has(parent)) g = Math.max(g, generation.get(parent)! + 1)
      for (const s of spouses.get(p.id)!) g = Math.max(g, generation.get(s)!)
      if (g > generation.get(p.id)!) {
        generation.set(p.id, g)
        changed = true
      }
    }
  }
  const generationCount = people.length ? Math.max(...generation.values()) + 1 : 0

  return { people, byId, children, spouses, generation, generationCount }
}

function assertNoAncestorLoop(people: PersonLinks[], byId: Map<string, PersonLinks>) {
  const state = new Map<string, 1 | 2>()
  const visit = (id: string) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) throw new Error(`${id} is their own ancestor`)
    state.set(id, 1)
    for (const parent of byId.get(id)!.parents) if (byId.has(parent)) visit(parent)
    state.set(id, 2)
  }
  for (const p of people) visit(p.id)
}

/** The person plus their parents, partners and children. */
export function closeFamily(graph: Graph<PersonLinks>, id: string): Set<string> {
  const p = graph.byId.get(id)
  if (!p) return new Set()
  return new Set([
    id,
    ...p.parents.filter((x) => graph.byId.has(x)),
    ...(graph.spouses.get(id) ?? []),
    ...(graph.children.get(id) ?? []),
  ])
}

export function siblings(graph: Graph<PersonLinks>, id: string): string[] {
  const p = graph.byId.get(id)
  if (!p) return []
  const out = new Set<string>()
  for (const parent of p.parents) for (const c of graph.children.get(parent) ?? []) if (c !== id) out.add(c)
  return [...out]
}

/**
 * A person's line of descent: `line` is their ancestors, themselves and their
 * descendants; `shown` adds the partners of the person and of their descendants.
 */
export function lineage(graph: Graph<PersonLinks>, id: string): { line: Set<string>; shown: Set<string> } {
  const line = new Set<string>()
  if (!graph.byId.has(id)) return { line, shown: line }
  const up = (x: string) => {
    for (const p of graph.byId.get(x)!.parents) if (graph.byId.has(p) && !line.has(p)) (line.add(p), up(p))
  }
  const down = (x: string) => {
    for (const c of graph.children.get(x) ?? []) if (!line.has(c)) (line.add(c), down(c))
  }
  // Partners are shown for the person and their descendants, not for ancestors:
  // an ancestor's other partner is not part of this line.
  line.add(id)
  down(id)
  const shown = new Set(line)
  for (const x of line) for (const s of graph.spouses.get(x) ?? []) shown.add(s)
  up(id)
  for (const x of line) shown.add(x)
  return { line, shown }
}

/** The person with their parents and brothers and sisters. */
export function household(graph: Graph<PersonLinks>, id: string): Set<string> {
  const p = graph.byId.get(id)
  if (!p) return new Set()
  return new Set([id, ...p.parents.filter((x) => graph.byId.has(x)), ...siblings(graph, id)])
}

export interface FamilySide {
  name: string
  /** The people the side starts with, and all their descendants. */
  line: Set<string>
  /** `line` plus the partners of those people. */
  shown: Set<string>
}

/** The named sides of the family, in alphabetical order. A person can belong to several. */
export function familySides(graph: Graph<PersonLinks>): FamilySide[] {
  // "machado" and "Machado" are one side; the first spelling met is the one shown.
  const found = new Map<string, [name: string, line: Set<string>]>()
  for (const p of graph.people) {
    for (const raw of p.families ?? []) {
      const name = raw.trim()
      const key = name.toLocaleLowerCase('pt')
      if (!key) continue
      if (!found.has(key)) found.set(key, [name, new Set()])
      const line = found.get(key)![1]
      const down = (x: string) => {
        if (line.has(x)) return
        line.add(x)
        for (const c of graph.children.get(x) ?? []) down(c)
      }
      down(p.id)
    }
  }
  return [...found.values()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt'))
    .map(([name, line]) => {
      const shown = new Set(line)
      for (const x of line) for (const s of graph.spouses.get(x) ?? []) shown.add(s)
      return { name, line, shown }
    })
}

/** Everybody in the oldest `n` generations of the tree. */
export function oldestGenerations(graph: Graph<PersonLinks>, n: number): Set<string> {
  return new Set(graph.people.filter((p) => graph.generation.get(p.id)! < n).map((p) => p.id))
}

export interface Filter {
  /** Names of the family sides to show; empty shows every side. */
  sides: string[]
  /** How many generations to show, counting down from the oldest; null shows all. */
  generations: number | null
}

/** The people a filter leaves on show, or null when it hides nobody. */
export function visiblePeople(graph: Graph<PersonLinks>, filter: Filter): Set<string> | null {
  let visible: Set<string> | null = null
  if (filter.sides.length) {
    visible = new Set()
    for (const side of familySides(graph)) if (filter.sides.includes(side.name)) for (const id of side.shown) visible.add(id)
  }
  if (filter.generations !== null) {
    const oldest = oldestGenerations(graph, filter.generations)
    visible = visible ? new Set([...visible].filter((id) => oldest.has(id))) : oldest
  }
  return visible && visible.size < graph.people.length ? visible : null
}
