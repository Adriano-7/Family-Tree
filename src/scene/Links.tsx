import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Graph } from '../data/graph'
import type { Vec3 } from './layout'

interface Props {
  graph: Graph
  positions: Map<string, Vec3>
  /** The hovered or selected person, if any. */
  focusId: string | null
}

const PARENT = new THREE.Color('#6f86d6')
const PARTNER = new THREE.Color('#e3a0b4')
const LIT = new THREE.Color('#ffe7b0')

type Pair = [string, string]

function useSegments(pairs: Pair[], positions: Map<string, Vec3>, base: THREE.Color, focusId: string | null) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(pairs.length * 6)
    pairs.forEach(([a, b], i) => {
      pos.set(positions.get(a)!, i * 6)
      pos.set(positions.get(b)!, i * 6 + 3)
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3))
    return g
  }, [pairs, positions])

  useEffect(() => () => geometry.dispose(), [geometry])

  // Additive blending: a darker colour is a fainter line.
  useEffect(() => {
    const color = geometry.getAttribute('color') as THREE.BufferAttribute
    const c = new THREE.Color()
    pairs.forEach(([a, b], i) => {
      if (!focusId) c.copy(base).multiplyScalar(0.6)
      else if (a === focusId || b === focusId) c.copy(LIT)
      else c.copy(base).multiplyScalar(0.12)
      color.setXYZ(i * 2, c.r, c.g, c.b)
      color.setXYZ(i * 2 + 1, c.r, c.g, c.b)
    })
    color.needsUpdate = true
  }, [geometry, pairs, base, focusId])

  return geometry
}

export function Links({ graph, positions, focusId }: Props) {
  const [parentPairs, partnerPairs] = useMemo(() => {
    const parents: Pair[] = []
    const partners: Pair[] = []
    for (const p of graph.people) {
      for (const parent of p.parents) if (graph.byId.has(parent)) parents.push([parent, p.id])
      for (const s of graph.spouses.get(p.id) ?? []) if (p.id < s) partners.push([p.id, s])
    }
    return [parents, partners]
  }, [graph])

  const parentGeometry = useSegments(parentPairs, positions, PARENT, focusId)
  const partnerGeometry = useSegments(partnerPairs, positions, PARTNER, focusId)

  return (
    <>
      {[parentGeometry, partnerGeometry].map((geometry, i) => (
        <lineSegments key={i} geometry={geometry} frustumCulled={false}>
          <lineBasicMaterial
            vertexColors
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </lineSegments>
      ))}
    </>
  )
}
