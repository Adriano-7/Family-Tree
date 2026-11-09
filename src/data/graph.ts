import type { Person } from './types'

export type PersonLinks = Pick<Person, 'id' | 'name' | 'born' | 'parents' | 'spouses'>

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
