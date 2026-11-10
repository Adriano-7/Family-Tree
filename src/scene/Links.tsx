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

/** A piece of line to draw, and the segment whose colour it takes. */
interface Piece {
  segment: number
  a: [number, number, number]
  b: [number, number, number]
}

const SLASH_GAP = 0.55
const SLASH = 0.26
/** Radius of a star: the part of a line under it is hidden. */
const STAR = 0.9

/**
 * A partner line is broken by two slashes (the usual mark for a divorce) when they separated.
 * Everything else is one straight piece. A partner who died is deliberately not marked on the
 * line: a dotted or dashed line reads as an illegitimate or uncertain link in family trees.
 */
function piecesOf(s: Segment, segment: number): Piece[] {
  const [ax, ay, az] = [s.a[0], s.a[1], s.a[2] + DEPTH]
  const [bx, by] = [s.b[0], s.b[1]]
  if (s.kind !== 'partner' || s.ended !== 'separated') return [{ segment, a: [ax, ay, az], b: [bx, by, az] }]
  const length = Math.hypot(bx - ax, by - ay)
  if (length === 0) return []
  const [dx, dy] = [(bx - ax) / length, (by - ay) / length]
  const at = (t: number): [number, number, number] => [ax + dx * t, ay + dy * t, az]
  // Separated: a gap with two slanted strokes across it; in the middle, or, when the children's
  // line drops from the middle, halfway between it and the first partner, so the two don't meet.
  const mid = s.children.length ? (STAR + length / 2) / 2 : length / 2
  const half = SLASH_GAP / 2
  const slash = (t: number): Piece => {
    const [cx, cy] = at(t)
    // Leaning the same way as "/" on a line read from left to right.
    const [ux, uy] = [dx * 0.45 - dy, dy * 0.45 + dx]
    const k = SLASH / 2 / Math.hypot(ux, uy)
    return { segment, a: [cx - ux * k, cy - uy * k, az], b: [cx + ux * k, cy + uy * k, az] }
  }
  return [
    { segment, a: at(0), b: at(mid - half) },
    slash(mid - half * 0.45),
    slash(mid + half * 0.45),
    { segment, a: at(mid + half), b: at(length) },
  ]
}

export function Links({ segments, line, shown }: Props) {
  const pieces = useMemo(() => segments.flatMap((s, i) => piecesOf(s, i)), [segments])
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(pieces.length * 6)
    pieces.forEach((p, i) => {
      pos.set(p.a, i * 6)
      pos.set(p.b, i * 6 + 3)
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pieces.length * 6), 3))
    return g
  }, [pieces])

  useEffect(() => () => geometry.dispose(), [geometry])

  // Additive blending: a darker colour is a fainter line.
  useEffect(() => {
    const color = geometry.getAttribute('color') as THREE.BufferAttribute
    const c = new THREE.Color()
    const colours = segments.map((s) => {
      const base = s.kind === 'partner' ? PARTNER : PARENT
      if (!line || !shown) c.copy(base).multiplyScalar(s.far ? 0.3 : 0.7)
      else if (s.kind === 'partner') {
        if (s.parents.every((p) => shown.has(p))) c.copy(LIT_PARTNER)
        else c.copy(base).multiplyScalar(0.1)
      } else if (s.parents.some((p) => line.has(p)) && s.children.some((ch) => line.has(ch))) c.copy(LIT)
      else c.copy(base).multiplyScalar(0.1)
      return c.clone()
    })
    pieces.forEach((p, i) => {
      const { r, g, b } = colours[p.segment]
      color.setXYZ(i * 2, r, g, b)
      color.setXYZ(i * 2 + 1, r, g, b)
    })
    color.needsUpdate = true
  }, [geometry, pieces, segments, line, shown])

  return (
    // Drawn before the stars, so a disc always covers the lines that reach it. Depth alone is not
    // enough: each star turns to face the camera, and seen from an angle its tilted edge can sit
    // behind the lines (most visibly when it grows under the pointer). Not marked transparent, so it
    // is drawn with the opaque stars, in renderOrder; three.js still blends it additively.
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={0}>
      <lineBasicMaterial
        vertexColors
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </lineSegments>
  )
}
