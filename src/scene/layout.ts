import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceZ } from 'd3-force-3d'
import type { Graph, PersonLinks } from '../data/graph'

export type Vec3 = [number, number, number]

export const LAYER_GAP = 7

/** Small deterministic random generator, so the sky looks the same on every visit. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SimNode {
  id: string
  x: number
  y: number
  z: number
  fy: number
}

/**
 * Generations are horizontal layers (oldest on top, vertically centred on 0).
 * Inside a layer a force simulation spreads people out, keeps partners side by
 * side and children below their parents.
 */
export function computeLayout(graph: Graph<PersonLinks>, seed = 7): Map<string, Vec3> {
  const random = seeded(seed)
  const ids = graph.people.map((p) => p.id).sort()
  const top = ((graph.generationCount - 1) * LAYER_GAP) / 2
  const spread = 3 + Math.sqrt(ids.length) * 1.6

  const nodes: SimNode[] = ids.map((id) => {
    const angle = random() * Math.PI * 2
    const r = Math.sqrt(random()) * spread
    const y = top - graph.generation.get(id)! * LAYER_GAP + (random() - 0.5) * 1.6
    return { id, x: Math.cos(angle) * r, y, z: Math.sin(angle) * r, fy: y }
  })

  const parentLinks: { source: string; target: string }[] = []
  const partnerLinks: { source: string; target: string }[] = []
  for (const id of ids) {
    for (const parent of graph.byId.get(id)!.parents)
      if (graph.byId.has(parent)) parentLinks.push({ source: parent, target: id })
    for (const s of graph.spouses.get(id)!) if (id < s) partnerLinks.push({ source: id, target: s })
  }

  const byNodeId = (n: SimNode) => n.id
  const sim = forceSimulation(nodes, 3)
    .randomSource(random)
    .force('repel', forceManyBody().strength(-28).distanceMax(40))
    .force('parents', forceLink(parentLinks).id(byNodeId).distance(LAYER_GAP * 1.05).strength(0.45))
    .force('partners', forceLink(partnerLinks).id(byNodeId).distance(2.6).strength(1))
    .force('x', forceX(0).strength(0.07))
    .force('z', forceZ(0).strength(0.07))
    .force('collide', forceCollide(1.5))
    .stop()
  for (let i = 0; i < 320; i++) sim.tick()

  // Centre the sky on the middle of the family.
  const cx = nodes.reduce((sum, n) => sum + n.x, 0) / (nodes.length || 1)
  const cz = nodes.reduce((sum, n) => sum + n.z, 0) / (nodes.length || 1)
  return new Map(nodes.map((n) => [n.id, [n.x - cx, n.y, n.z - cz] as Vec3]))
}
