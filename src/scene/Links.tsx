import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Segment } from './layout'

interface Props {
  segments: Segment[]
  /** Ancestors, the person and descendants of whoever is in focus; null when nobody is. */
  line: Set<string> | null
  /** The same, plus their partners. */
  shown: Set<string> | null
}

const PARENT = new THREE.Color('#93a0bd')
const PARTNER = new THREE.Color('#e0b48a')
const LIT = new THREE.Color('#ffffff')
const LIT_PARTNER = new THREE.Color('#ffd9b0')
/** Links sit just behind the plane of the stars, so the discs cover the ends that meet them. */
const DEPTH = -0.1

export function Links({ segments, line, shown }: Props) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(segments.length * 6)
    segments.forEach((s, i) => {
      pos.set([s.a[0], s.a[1], s.a[2] + DEPTH], i * 6)
      pos.set([s.b[0], s.b[1], s.b[2] + DEPTH], i * 6 + 3)
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segments.length * 6), 3))
    return g
  }, [segments])

  useEffect(() => () => geometry.dispose(), [geometry])

  // Additive blending: a darker colour is a fainter line.
  useEffect(() => {
    const color = geometry.getAttribute('color') as THREE.BufferAttribute
    const c = new THREE.Color()
    segments.forEach((s, i) => {
      const base = s.kind === 'partner' ? PARTNER : PARENT
      if (!line || !shown) c.copy(base).multiplyScalar(s.far ? 0.3 : 0.7)
      else if (s.kind === 'partner') {
        if (s.parents.every((p) => shown.has(p))) c.copy(LIT_PARTNER)
        else c.copy(base).multiplyScalar(0.1)
      } else if (s.parents.some((p) => line.has(p)) && s.children.some((ch) => line.has(ch))) c.copy(LIT)
      else c.copy(base).multiplyScalar(0.1)
      color.setXYZ(i * 2, c.r, c.g, c.b)
      color.setXYZ(i * 2 + 1, c.r, c.g, c.b)
    })
    color.needsUpdate = true
  }, [geometry, segments, line, shown])

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </lineSegments>
  )
}
