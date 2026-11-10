import { type Graph, partnershipEnd, type PersonLinks } from '../data/graph'

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
  /** For a partner line: how the partnership ended, if it did. */
  ended?: 'separated' | 'widowed'
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

/** One way of setting the family trees side by side, and how well it reads. */
interface Arrangement {
  flat: Map<string, [u: number, y: number]>
  segments: Segment[]
  width: number
  /** Lower is better: lines that cut across the chart count most, then long row lines, then width. */
  cost: number
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
  const at = (u: number, y: number): Vec3 => [u, y, 0]

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
  const firstRow: number[] = []
  const waiting = new Set(roots.map((_, t) => t))
  while (waiting.size) {
    const score = (t: number) => firstRow.reduce((n, r) => n + links[t][r], 0)
    const next = [...waiting].sort((a, b) => score(b) - score(a) || treeSize[b] - treeSize[a] || a - b)[0]
    waiting.delete(next)
    if (firstRow.length % 2) firstRow.push(next)
    else firstRow.unshift(next)
  }

  const families = new Map<string, { parents: string[]; children: string[] }>()
  for (const id of ids) {
    const parents = parentsOf(id).sort()
    if (!parents.length) continue
    const key = parents.join('+')
    if (!families.has(key)) families.set(key, { parents, children: [] })
    families.get(key)!.children.push(id)
  }

  // Which tree stands where decides who can stand next to their own parents, so the order is
  // tried out: starting from the one above, a tree moves wherever the lines come out cleaner.
  const original = new Map(units.map((u) => [u, { members: [...u.members], children: [...u.children] }]))
  const arrange = (row: number[]): Arrangement => {
    for (const unit of units) {
      unit.members = [...original.get(unit)!.members]
      unit.children = [...original.get(unit)!.children]
      unit.lean = 0
      unit.newGroup = false
      unit.split = null
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
    const spot = (unit: Unit, member: string) => unit.u + (unit.members.indexOf(member) - (unit.members.length - 1) / 2) * SLOT
    const place = (unit: Unit, left: number) => {
      unit.u = left + unit.width / 2
      const own = unit.members.length * SLOT
      const within = (u: number) => Math.min(Math.max(u, left + own / 2), left + unit.width - own / 2)
      let x = left + (unit.width - kidsWidth(unit)) / 2
      let hubAt: number | null = null
      unit.children.forEach((child, i) => {
        x += gapBefore(child, i)
        // The shared parent stands exactly above the gap between the two groups of children.
        if (unit.split && i === unit.split[1]) hubAt = x - GROUP_GAP / 2 - (unit.split[0] - (unit.members.length - 1) / 2) * SLOT
        place(child, x)
        x += child.width
      })
      if (hubAt !== null) unit.u = within(hubAt)
      // Otherwise parents stand above the middle of their children, wherever those ended up in their own households.
      else if (unit.children.length) {
        const [first, last] = [unit.children[0], unit.children[unit.children.length - 1]]
        unit.u = within((spot(first, first.via) + spot(last, last.via)) / 2)
      }
    }

    // Each tree is laid out on its own, then pushed against the ones before it row by row: a small
    // tree (somebody's parents and their brothers and sisters) fits above a neighbour's descendants.
    const generationOf = (id: string) => graph.generation.get(id)!
    const shift = new Map<number, number>()
    const edge = new Map<number, number>() // generation -> how far right the trees so far reach
    for (const t of row) {
      measure(roots[t])
      place(roots[t], 0)
      const reach = new Map<number, [from: number, to: number]>()
      const cover = (generation: number, from: number, to: number) => {
        const r = reach.get(generation)
        reach.set(generation, r ? [Math.min(r[0], from), Math.max(r[1], to)] : [from, to])
      }
      for (const unit of units) {
        if (unit.tree !== t) continue
        for (const m of unit.members) cover(generationOf(m), spot(unit, m) - SLOT / 2, spot(unit, m) + SLOT / 2)
        // The lines down to the children need their stretch of every row they pass.
        for (const child of unit.children) {
          const [a, b] = [unit.u, spot(child, child.via)]
          for (let g = unit.generation + 1; g <= generationOf(child.via); g++) cover(g, Math.min(a, b), Math.max(a, b))
        }
      }
      let by = -Infinity
      for (const [g, [from]] of reach) if (edge.has(g)) by = Math.max(by, edge.get(g)! + TREE_GAP - from)
      if (by === -Infinity) by = edge.size ? Math.max(...edge.values()) + TREE_GAP - Math.min(...[...reach.values()].map((r) => r[0])) : 0
      shift.set(t, by)
      for (const [g, [, to]] of reach) edge.set(g, Math.max(edge.get(g) ?? -Infinity, to + by))
    }

    const top = ((graph.generationCount - 1) * LAYER_GAP) / 2
    const raw = new Map<string, number>()
    for (const unit of units) for (const m of unit.members) raw.set(m, spot(unit, m) + shift.get(unit.tree)!)
    const [leftmost, rightmost] = [Math.min(...raw.values()) - SLOT / 2, Math.max(...raw.values()) + SLOT / 2]
    const width = ids.length ? rightmost - leftmost : 0
    const flat = new Map<string, [u: number, y: number]>()
    for (const id of ids) flat.set(id, [raw.get(id)! - (leftmost + rightmost) / 2, top - generationOf(id) * LAYER_GAP])

    // ---- lines: one stem per family, splitting to the children ---------------
    const segments: Segment[] = []
    let cost = width * 0.01
    const line = (
      from: [number, number],
      to: [number, number],
      info: Pick<Segment, 'kind' | 'parents' | 'children' | 'far' | 'ended'>,
    ) => {
      segments.push({ a: at(...from), b: at(...to), ...info })
    }

    const anchorOf = (parents: string[]): [number, number] => {
      const spots = parents.map((p) => flat.get(p)!)
      return [spots.reduce((sum, s) => sum + s[0], 0) / spots.length, Math.min(...spots.map((s) => s[1]))]
    }
    const stems = [...families.values()].map(({ parents, children }) => ({
      parents,
      at: anchorOf(parents),
      down: Math.min(...children.map((c) => flat.get(c)![1])),
    }))

    for (const { parents, children } of families.values()) {
      const anchor = anchorOf(parents)
      const home = unitOf.get(parents[0])!
      const isLocal = (c: string) => unitOf.get(c)!.parent === home
      const local = children.filter(isLocal)

      // A child who lives in the neighbouring tree (married into it) still joins this family's
      // row line when nothing stands in between; otherwise a direct line is drawn.
      const away = children
        .filter((c) => !isLocal(c))
        .sort((a, b) => Math.abs(flat.get(a)![0] - anchor[0]) - Math.abs(flat.get(b)![0] - anchor[0]))
      for (const child of away) {
        const [u, y] = flat.get(child)!
        const rowY = local.length ? Math.max(...local.map((c) => flat.get(c)![1])) : y
        const us = [anchor[0], ...local.map((c) => flat.get(c)![0])]
        const [from, to] = [Math.min(...us), Math.max(...us)]
        if (y !== rowY || y >= anchor[1] || (u >= from && u <= to)) continue
        const [gapFrom, gapTo] = u < from ? [u, from] : [to, u]
        const busY = rowY + LAYER_GAP / 2
        const blocked =
          ids.some((id) => {
            const [ou, oy] = flat.get(id)!
            return oy === rowY && ou > gapFrom && ou < gapTo
          }) ||
          // ...or another family's line comes down through that stretch.
          stems.some((s) => s.parents !== parents && s.at[0] > gapFrom && s.at[0] < gapTo && s.at[1] > busY && s.down < busY)
        if (blocked) continue
        local.push(child)
        cost += gapTo - gapFrom
      }
      local.sort((a, b) => flat.get(a)![0] - flat.get(b)![0])

      for (const child of children.filter((c) => !local.includes(c))) {
        line(anchor, flat.get(child)!, { kind: 'descent', far: true, parents, children: [child] })
        cost += 1000
      }
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
        if (id < partner)
          line(flat.get(id)!, flat.get(partner)!, {
            kind: 'partner',
            parents: [id, partner],
            // The couple's children: their line drops from the middle of this one.
            children: families.get([id, partner].sort().join('+'))?.children ?? [],
            ended: partnershipEnd(graph, id, partner) ?? undefined,
          })

    return { flat, segments, width, cost }
  }

  let best = arrange(firstRow)
  let bestRow = firstRow
  for (let improved = roots.length > 1, pass = 0; improved && pass < 4; pass++) {
    improved = false
    for (const t of [...bestRow]) {
      const rest = bestRow.filter((r) => r !== t)
      for (let i = 0; i <= rest.length; i++) {
        const row = [...rest.slice(0, i), t, ...rest.slice(i)]
        if (row.every((r, j) => r === bestRow[j])) continue
        const tried = arrange(row)
        if (tried.cost < best.cost - 1e-6) [best, bestRow, improved] = [tried, row, true]
      }
    }
  }

  const positions = new Map(ids.map((id) => [id, at(...best.flat.get(id)!)]))
  return { positions, segments: best.segments, width: best.width, height: (graph.generationCount - 1) * LAYER_GAP }
}

/**
 * The same chart with only some of its people: everybody stays where they stood, so brothers and
 * sisters whose parents are hidden keep their place in the row, and the line that joins them.
 */
export function cropLayout(layout: Layout, keep: Set<string>): Layout {
  const kept = [...layout.positions].filter(([id]) => keep.has(id))
  if (!kept.length) return { positions: new Map(), segments: [], width: 0, height: 0 }
  const xs = kept.map(([, p]) => p[0])
  const ys = kept.map(([, p]) => p[1])
  const [dx, dy] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const move = ([x, y, z]: Vec3): Vec3 => [x - dx, y - dy, z]
  // Brothers and sisters whose parents are hidden: the stretch of the row they still share.
  const shared = new Map<string, [from: number, to: number]>()
  for (const s of layout.segments) {
    if (s.kind !== 'descent') continue
    const key = s.parents.join('+')
    for (const child of s.children) {
      if (!keep.has(child)) continue
      const x = layout.positions.get(child)![0]
      const span = shared.get(key)
      shared.set(key, span ? [Math.min(span[0], x), Math.max(span[1], x)] : [x, x])
    }
  }
  const segments = layout.segments
    .filter((s) => {
      const parentsKept = s.parents.every((p) => keep.has(p))
      if (s.kind === 'partner' || parentsKept) return parentsKept && (s.kind === 'partner' || s.children.some((c) => keep.has(c)))
      // Without the parents, only the line that joins the children is left: nothing up to the
      // parents' row, nothing running on to where they stood, and nothing over an only child.
      const [from, to] = shared.get(s.parents.join('+')) ?? [0, 0]
      const parentRow = Math.min(...s.parents.map((p) => layout.positions.get(p)![1]))
      return (
        to > from &&
        s.children.some((c) => keep.has(c)) &&
        Math.max(s.a[1], s.b[1]) < parentRow - 0.01 &&
        Math.min(s.a[0], s.b[0]) > from - 0.01 &&
        Math.max(s.a[0], s.b[0]) < to + 0.01
      )
    })
    .map((s) => ({ ...s, a: move(s.a), b: move(s.b) }))
  return {
    positions: new Map(kept.map(([id, p]) => [id, move(p)])),
    segments,
    width: Math.max(...xs) - Math.min(...xs) + SLOT,
    height: Math.max(...ys) - Math.min(...ys),
  }
}
