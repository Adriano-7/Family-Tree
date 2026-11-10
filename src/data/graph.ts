import type { Person } from './types'

export type PersonLinks = Pick<Person, 'id' | 'name' | 'born' | 'parents' | 'spouses'> & {
  died?: string | null
  families?: string[]
  separated?: string[]
  godparents?: string[]
}

/** The same key for A+B and B+A. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}+${b}` : `${b}+${a}`)

export interface Graph<T extends PersonLinks = Person> {
  people: T[]
  byId: Map<string, T>
  children: Map<string, string[]>
  /** Symmetric: if A lists B as a spouse, B also has A. Includes former partners. */
  spouses: Map<string, string[]>
  /** Couples who separated or divorced, by `pairKey`. */
  separated: Set<string>
  /** The reverse of `godparents`: whose godparent each person is. */
  godchildren: Map<string, string[]>
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
    // Somebody listed only as separated from is still a (former) partner.
    for (const s of [...p.spouses, ...(p.separated ?? [])]) {
      if (!byId.has(s) || s === p.id) continue
      spouseSets.get(p.id)!.add(s)
      spouseSets.get(s)!.add(p.id)
    }
  }
  const separated = new Set<string>()
  for (const p of people) for (const s of p.separated ?? []) if (byId.has(s) && s !== p.id) separated.add(pairKey(p.id, s))

  const byAge = (a: string, b: string) => {
    const pa = byId.get(a)!
    const pb = byId.get(b)!
    return (pa.born ?? '9999').localeCompare(pb.born ?? '9999') || pa.name.localeCompare(pb.name)
  }
  for (const list of children.values()) list.sort(byAge)
  const godchildren = new Map<string, string[]>(people.map((p) => [p.id, []]))
  for (const p of people) for (const g of p.godparents ?? []) if (g !== p.id) godchildren.get(g)?.push(p.id)
  for (const list of godchildren.values()) list.sort(byAge)
  const spouses = new Map([...spouseSets].map(([id, set]) => [id, [...set].sort(byAge)]))

  assertNoAncestorLoop(people, byId)

  // A child sits one layer below their lowest parent; partners share a layer.
  let generation = new Map<string, number>(people.map((p) => [p.id, 0]))
  const settle = () => {
    for (let pass = 0, changed = true; changed && pass <= people.length + 1; pass++) {
      changed = false
      for (const p of people) {
        let g = generation.get(p.id)!
        for (const parent of p.parents) if (byId.has(parent)) g = Math.max(g, generation.get(parent)! + 1)
        for (const s of spouses.get(p.id)!) g = Math.max(g, generation.get(s)!)
        if (g > generation.get(p.id)!) {
          generation.set(p.id, g)
          changed = true
        }
      }
    }
  }
  settle()
  // Brothers and sisters share a layer too: when one of them sits lower (their partner's line has
  // more generations above it), the parents come down to stand right above that child, and the
  // rest of their branch follows. Left alone where that cannot work out (say, an uncle married to
  // his niece's sister-in-law).
  for (let round = 0, moved = true; moved && round <= people.length; round++) {
    moved = false
    for (const p of people) {
      const kids = children.get(p.id)!
      if (!kids.length) continue
      const target = Math.max(...kids.map((c) => generation.get(c)!)) - 1
      if (target <= generation.get(p.id)!) continue
      const before = new Map(generation)
      generation.set(p.id, target)
      settle()
      if (kids.every((c) => generation.get(c) === target + 1)) moved = true
      else generation = before
    }
  }
  const generationCount = people.length ? Math.max(...generation.values()) + 1 : 0

  return { people, byId, children, spouses, separated, godchildren, generation, generationCount }
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

/** Everybody from generation `first` to generation `last` of the tree, both included; 0 is the oldest. */
export function generationsBetween(graph: Graph<PersonLinks>, first: number, last: number): Set<string> {
  const inRange = (id: string) => graph.generation.get(id)! >= first && graph.generation.get(id)! <= last
  return new Set(graph.people.filter((p) => inRange(p.id)).map((p) => p.id))
}

export interface Filter {
  /** Names of the family sides to show; empty shows every side. */
  sides: string[]
  /** The oldest and the youngest generation to show (0 is the oldest of all); null shows all. */
  generations: [first: number, last: number] | null
}

/** The people a filter leaves on show, or null when it hides nobody. */
export function visiblePeople(graph: Graph<PersonLinks>, filter: Filter): Set<string> | null {
  let visible: Set<string> | null = null
  if (filter.sides.length) {
    visible = new Set()
    for (const side of familySides(graph)) if (filter.sides.includes(side.name)) for (const id of side.shown) visible.add(id)
  }
  if (filter.generations !== null) {
    const between = generationsBetween(graph, ...filter.generations)
    visible = visible ? new Set([...visible].filter((id) => between.has(id))) : between
  }
  return visible && visible.size < graph.people.length ? visible : null
}

export interface Relation {
  /** Everybody on the way from one person to the other, both included. */
  people: Set<string>
  /**
   * For blood relatives: generations up from the first person to the ancestor they
   * share, then down to the second. Null when the way goes through a marriage.
   */
  steps: { up: number; down: number; half: boolean } | null
  /** The two are partners. */
  partners: boolean
}

/** The shortest way from one person to another through parents, children and partners; null if there is none. */
export function relation(graph: Graph<PersonLinks>, from: string, to: string): Relation | null {
  if (!graph.byId.has(from) || !graph.byId.has(to) || from === to) return null
  type Step = 'up' | 'down' | 'partner'
  // Blood before marriage: among equally short ways, the one through parents and children is found first.
  const next = (id: string): [string, Step][] => [
    ...graph.byId.get(id)!.parents.filter((p) => graph.byId.has(p)).map((p): [string, Step] => [p, 'up']),
    ...(graph.children.get(id) ?? []).map((c): [string, Step] => [c, 'down']),
    ...(graph.spouses.get(id) ?? []).map((s): [string, Step] => [s, 'partner']),
  ]
  const cameFrom = new Map<string, [string, Step] | null>([[from, null]])
  const queue = [from]
  while (queue.length && !cameFrom.has(to)) {
    const id = queue.shift()!
    for (const [other, step] of next(id)) {
      if (cameFrom.has(other)) continue
      cameFrom.set(other, [id, step])
      queue.push(other)
    }
  }
  if (!cameFrom.has(to)) return null

  const path = [to]
  const steps: Step[] = []
  for (let at = cameFrom.get(to); at; at = cameFrom.get(at[0])) {
    path.unshift(at[0])
    steps.unshift(at[1])
  }

  const people = new Set(path)
  let half = false
  // Where the way turns from going up to going down, both parents of the two children belong to it.
  for (let i = 1; i + 1 < path.length; i++) {
    if (steps[i - 1] !== 'up' || steps[i] !== 'down') continue
    const [a, b] = [graph.byId.get(path[i - 1])!, graph.byId.get(path[i + 1])!]
    const shared = a.parents.filter((p) => graph.byId.has(p) && b.parents.includes(p))
    shared.forEach((p) => people.add(p))
    const known = (p: PersonLinks) => p.parents.filter((x) => graph.byId.has(x)).length
    half = shared.length < Math.max(known(a), known(b))
  }

  const up = steps.filter((s) => s === 'up').length
  const down = steps.filter((s) => s === 'down').length
  const turns = steps.slice(1).filter((s, i) => s !== steps[i]).length
  const blood = !steps.includes('partner') && turns <= 1 && (up === 0 || down === 0 || steps[0] === 'up')
  return { people, steps: blood ? { up, down, half } : null, partners: steps.length === 1 && steps[0] === 'partner' }
}

/**
 * Who counts as related to this person: blood relatives (anybody who shares an
 * ancestor with them) and their partners; not their partner's own family. Not
 * including the person.
 */
export function relatives(graph: Graph<PersonLinks>, id: string): Set<string> {
  const out = new Set<string>()
  if (!graph.byId.has(id)) return out
  const ancestors = new Set([id])
  const up = (x: string) => {
    for (const p of graph.byId.get(x)!.parents) if (graph.byId.has(p) && !ancestors.has(p)) (ancestors.add(p), up(p))
  }
  up(id)
  const down = (x: string) => {
    for (const c of graph.children.get(x) ?? []) if (!out.has(c)) (out.add(c), down(c))
  }
  for (const a of ancestors) (out.add(a), down(a))
  for (const s of graph.spouses.get(id) ?? []) out.add(s)
  out.delete(id)
  return out
}

/**
 * Everybody connected to this person, to show them their family: the person, their blood
 * relatives (anybody who shares an ancestor with them), and the partners of all of those.
 * Their partners' own families are left out, as with a side of the family.
 */
export function connected(graph: Graph<PersonLinks>, id: string): Set<string> {
  if (!graph.byId.has(id)) return new Set()
  const blood = relatives(graph, id)
  for (const s of graph.spouses.get(id) ?? []) blood.delete(s)
  blood.add(id)
  const shown = new Set(blood)
  for (const x of blood) for (const s of graph.spouses.get(x) ?? []) shown.add(s)
  return shown
}

/**
 * How a couple's partnership ended, if it did: separated or divorced, or one of them has died
 * and the other lives on. When both have died the couple is simply shown together.
 */
export function partnershipEnd(graph: Graph<PersonLinks>, a: string, b: string): 'separated' | 'widowed' | null {
  if (graph.separated.has(pairKey(a, b))) return 'separated'
  if (!graph.byId.get(a)?.died !== !graph.byId.get(b)?.died) return 'widowed'
  return null
}
