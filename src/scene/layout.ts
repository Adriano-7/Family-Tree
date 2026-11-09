import type { Graph, PersonLinks } from '../data/graph'

export type Vec3 = [number, number, number]

export interface Segment {
  a: Vec3
  b: Vec3
  kind: 'descent' | 'partner'
  /** A descent line to a child who sits in another branch of the tree (drawn fainter). */
  far?: boolean
  /** For a partner line: the two partners. */
  parents: string[]
  /** The children this piece of line leads to. */
  children: string[]
}

export interface Layout {
  positions: Map<string, Vec3>
  segments: Segment[]
  /** Size of the tree, seen from the front. */
  width: number
  height: number
}

export const LAYER_GAP = 7
const SLOT = 3.4 // room for one person in a row
const UNIT_GAP = 1.4 // extra room between neighbouring households
const TREE_GAP = 5 // between unrelated family trees
const GROUP_GAP = 3.5 // between the children of one partner and the children of another
const BUS_LIFT = 0.9 // row lines of a third, fourth... partner's children run at their own height

/** Partners (and people who share a child) placed side by side. */
interface Unit {
  members: string[]
  generation: number
  children: Unit[]
  parent: Unit | null
  tree: number
  width: number
  u: number
  /** Which side this branch should lean to, to be near another tree it is linked to. */
  lean: number
  /** The child through whom this household hangs under its parents. */
  via: string
  /** Starts a new group of children (those of a different partner). */
  newGroup: boolean
  /** With children by several partners: [index of the shared parent, number of children in the first group]. */
  split: [hub: number, firstGroup: number] | null
}

/**
 * A tidy tree: partners sit side by side, their children fan out below them and
 * every branch keeps its own stretch of the row. The chart is flat; it lives in
 * 3D space so it can be turned and flown through.
 */
export function computeLayout(graph: Graph<PersonLinks>): Layout {
  const ids = graph.people.map((p) => p.id).sort()
  const age = (id: string) => `${graph.byId.get(id)!.born ?? '9999'} ${id}`
  const parentsOf = (id: string) => graph.byId.get(id)!.parents.filter((p) => graph.byId.has(p))

  // ---- households ----------------------------------------------------------
  const mates = new Map<string, Set<string>>(ids.map((id) => [id, new Set(graph.spouses.get(id))]))
  for (const id of ids) {
    const [first, ...others] = parentsOf(id)
    for (const other of others) {
      mates.get(first)!.add(other)
      mates.get(other)!.add(first)
    }
  }
  const unitOf = new Map<string, Unit>()
  const units: Unit[] = []
  for (const id of ids) {
    if (unitOf.has(id)) continue
    const unit: Unit = { members: [], generation: 0, children: [], parent: null, tree: -1, width: 0, u: 0, lean: 0, via: '', newGroup: false, split: null }
    const queue = [id]
    while (queue.length) {
      const m = queue.shift()!
      if (unitOf.has(m)) continue
      unitOf.set(m, unit)
      unit.members.push(m)
      queue.push(...[...mates.get(m)!].sort())
    }
    unit.generation = Math.max(...unit.members.map((m) => graph.generation.get(m)!))
    units.push(unit)
  }

  const descendants = (unit: Unit) => {
    const seen = new Set<string>()
    const walk = (id: string) => {
      for (const c of graph.children.get(id)!) if (!seen.has(c)) (seen.add(c), walk(c))
    }
    unit.members.forEach(walk)
    return seen.size
  }
  const size = new Map(units.map((u) => [u, descendants(u)]))

  // ---- hang each household under one set of parents ------------------------
  const placed = new Set<Unit>()
  const order = (unit: Unit, primary: string) => {
    const partners = [...mates.get(primary)!].filter((m) => unit.members.includes(m)).sort((a, b) => age(a).localeCompare(age(b)))
    const rest = unit.members.filter((m) => m !== primary && !partners.includes(m))
    unit.members =
      partners.length >= 2 ? [partners[0], primary, ...partners.slice(1), ...rest] : [primary, ...partners, ...rest]
  }
  const attach = (unit: Unit, tree: number) => {
    placed.add(unit)
    unit.tree = tree
    for (const member of unit.members) {
      for (const child of graph.children.get(member)!) {
        const cu = unitOf.get(child)!
        if (placed.has(cu) || cu === unit) continue
        cu.parent = unit
        cu.via = child
        order(cu, child)
        unit.children.push(cu)
        attach(cu, tree)
      }
    }
  }
  const roots: Unit[] = []
  const byRank = [...units].sort(
    (a, b) => a.generation - b.generation || size.get(b)! - size.get(a)! || a.members[0].localeCompare(b.members[0]),
  )
  for (const unit of byRank) {
    if (placed.has(unit)) continue
    order(unit, [...unit.members].sort((a, b) => age(a).localeCompare(age(b)))[0])
    attach(unit, roots.length)
    roots.push(unit)
  }

  // ---- put trees that are linked by a marriage next to each other -----------
  const links = roots.map(() => roots.map(() => 0))
  const crossing: [child: string, parentTree: number][] = []
  for (const id of ids) {
    const tree = unitOf.get(id)!.tree
    for (const parent of parentsOf(id)) {
      const other = unitOf.get(parent)!.tree
      if (other === tree) continue
      links[tree][other]++
      links[other][tree]++
      crossing.push([id, other])
    }
  }
  const treeSize = roots.map((_, t) => units.filter((u) => u.tree === t).reduce((n, u) => n + u.members.length, 0))
  const row: number[] = []
  const waiting = new Set(roots.map((_, t) => t))
  while (waiting.size) {
    const score = (t: number) => row.reduce((n, r) => n + links[t][r], 0)
    const next = [...waiting].sort((a, b) => score(b) - score(a) || treeSize[b] - treeSize[a] || a - b)[0]
    waiting.delete(next)
    if (row.length % 2) row.push(next)
    else row.unshift(next)
  }
  const rank = new Map(row.map((t, i) => [t, i]))
  for (const [child, parentTree] of crossing) {
    const unit = unitOf.get(child)!
    const side = Math.sign(rank.get(parentTree)! - rank.get(unit.tree)!)
    for (let u: Unit | null = unit; u; u = u.parent) u.lean += side
    // Inside the couple, the partner from the other tree stands on that tree's side.
    unit.members = unit.members.filter((m) => m !== child)
    if (side > 0) unit.members.push(child)
    else unit.members.unshift(child)
  }
  for (const unit of units) {
    const original = new Map(unit.children.map((c, i) => [c, i]))
    unit.children.sort((a, b) => Math.sign(a.lean) - Math.sign(b.lean) || original.get(a)! - original.get(b)!)
  }

  // ---- someone with children by several partners: keep each partner's children together
  const busLift = new Map<string, number>()
  for (const unit of units) {
    const keyOf = (c: Unit) => parentsOf(c.via).sort().join('+')
    const keys = [...new Set(unit.children.map(keyOf))]
    if (keys.length < 2) continue
    const groups = keys.map((key) => ({
      key,
      parents: key.split('+'),
      children: unit.children.filter((c) => keyOf(c) === key),
    }))
    const hub = unit.members.find((m) => groups.every((g) => g.parents.includes(m)))
    const seat = (g: (typeof groups)[number]) =>
      Math.min(...g.parents.filter((p) => p !== hub).map((p) => unit.members.indexOf(p)), unit.members.length)
    const lean = (g: (typeof groups)[number]) => Math.sign(g.children.reduce((n, c) => n + Math.sign(c.lean), 0))
    groups.sort((a, b) => lean(a) - lean(b) || seat(a) - seat(b))
    if (hub) {
      // First partner on one side of the shared parent, the others on the other side.
      const partnerOf = (g: (typeof groups)[number]) => g.parents.filter((p) => p !== hub && unit.members.includes(p))
      const left = partnerOf(groups[0])
      const right = groups.slice(1).flatMap(partnerOf)
      const rest = unit.members.filter((m) => m !== hub && !left.includes(m) && !right.includes(m))
      unit.members = [...left, hub, ...right, ...rest]
      unit.split = [left.length, groups[0].children.length]
    }
    unit.children = groups.flatMap((g) => g.children)
    groups.forEach((g, i) => {
      if (i > 0) g.children[0].newGroup = true
      if (i > 1) busLift.set(g.key, (i - 1) * BUS_LIFT)
    })
  }

  // ---- flat chart: u runs along the rows, y is the generation --------------
  const gapBefore = (c: Unit, i: number) => (i === 0 ? 0 : c.newGroup ? GROUP_GAP : UNIT_GAP)
  const kidsWidth = (unit: Unit) => unit.children.reduce((w, c, i) => w + c.width + gapBefore(c, i), 0)
  const measure = (unit: Unit): number => {
    unit.children.forEach(measure)
    return (unit.width = Math.max(unit.members.length * SLOT, kidsWidth(unit)))
  }
  const place = (unit: Unit, left: number) => {
    unit.u = left + unit.width / 2
    let x = left + (unit.width - kidsWidth(unit)) / 2
    unit.children.forEach((child, i) => {
      x += gapBefore(child, i)
      if (unit.split && i === unit.split[1]) {
        // The shared parent stands exactly above the gap between the two groups of children.
        const own = unit.members.length * SLOT
        const wanted = x - GROUP_GAP / 2 - (unit.split[0] - (unit.members.length - 1) / 2) * SLOT
        unit.u = Math.min(Math.max(wanted, left + own / 2), left + unit.width - own / 2)
      }
      place(child, x)
      x += child.width
    })
  }
  let width = 0
  for (const t of row) {
    const w = measure(roots[t])
    place(roots[t], width)
    width += w + TREE_GAP
  }
  width = Math.max(0, width - TREE_GAP)

  const top = ((graph.generationCount - 1) * LAYER_GAP) / 2
  const flat = new Map<string, [u: number, y: number]>()
  for (const unit of units) {
    unit.members.forEach((m, i) => {
      const u = unit.u + (i - (unit.members.length - 1) / 2) * SLOT - width / 2
      flat.set(m, [u, top - graph.generation.get(m)! * LAYER_GAP])
    })
  }

  const at = (u: number, y: number): Vec3 => [u, y, 0]
  const positions = new Map(ids.map((id) => [id, at(...flat.get(id)!)]))

  // ---- lines: one stem per family, splitting to the children ---------------
  const segments: Segment[] = []
  const line = (
    from: [number, number],
    to: [number, number],
    info: Pick<Segment, 'kind' | 'parents' | 'children' | 'far'>,
  ) => {
    segments.push({ a: at(...from), b: at(...to), ...info })
  }

  const families = new Map<string, { parents: string[]; children: string[] }>()
  for (const id of ids) {
    const parents = parentsOf(id).sort()
    if (!parents.length) continue
    const key = parents.join('+')
    if (!families.has(key)) families.set(key, { parents, children: [] })
    families.get(key)!.children.push(id)
  }

  for (const { parents, children } of families.values()) {
    const spots = parents.map((p) => flat.get(p)!)
    const anchor: [number, number] = [
      spots.reduce((sum, s) => sum + s[0], 0) / spots.length,
      Math.min(...spots.map((s) => s[1])),
    ]
    const home = unitOf.get(parents[0])!
    const isLocal = (c: string) => unitOf.get(c)!.parent === home
    const local = children.filter(isLocal).sort((a, b) => flat.get(a)![0] - flat.get(b)![0])

    // A child who lives in the neighbouring tree (married into it) still joins this
    // family's row line when nobody stands in between; otherwise a direct line is drawn.
    if (local.length) {
      const rowY = Math.max(...local.map((c) => flat.get(c)![1]))
      const us = [anchor[0], ...local.map((c) => flat.get(c)![0])]
      const [from, to] = [Math.min(...us), Math.max(...us)]
      for (const child of children.filter((c) => !local.includes(c))) {
        const [u, y] = flat.get(child)!
        if (y !== rowY || (u >= from && u <= to)) continue
        const [gapFrom, gapTo] = u < from ? [u, from] : [to, u]
        const blocked = ids.some((id) => {
          const [ou, oy] = flat.get(id)!
          return oy === rowY && ou > gapFrom && ou < gapTo
        })
        if (!blocked) local.push(child)
      }
      local.sort((a, b) => flat.get(a)![0] - flat.get(b)![0])
    }

    for (const child of children.filter((c) => !local.includes(c)))
      line(anchor, flat.get(child)!, { kind: 'descent', far: true, parents, children: [child] })
    if (!local.length) continue

    const busY = Math.max(...local.map((c) => flat.get(c)![1])) + LAYER_GAP / 2 + (busLift.get(parents.join('+')) ?? 0)
    line(anchor, [anchor[0], busY], { kind: 'descent', parents, children: local })
    const stops = [...new Set([anchor[0], ...local.map((c) => flat.get(c)![0])])].sort((a, b) => a - b)
    for (let i = 0; i + 1 < stops.length; i++) {
      const leftOfStem = stops[i + 1] <= anchor[0]
      const served = local.filter((c) => (leftOfStem ? flat.get(c)![0] <= stops[i] : flat.get(c)![0] >= stops[i + 1]))
      line([stops[i], busY], [stops[i + 1], busY], { kind: 'descent', parents, children: served })
    }
    for (const child of local)
      line([flat.get(child)![0], busY], flat.get(child)!, { kind: 'descent', parents, children: [child] })
  }

  for (const id of ids)
    for (const partner of graph.spouses.get(id)!)
      if (id < partner) line(flat.get(id)!, flat.get(partner)!, { kind: 'partner', parents: [id, partner], children: [] })

  return { positions, segments, width, height: (graph.generationCount - 1) * LAYER_GAP }
}
