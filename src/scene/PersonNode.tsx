import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Person } from '../data/types'
import { asset, lifeYears } from '../ui/format'
import type { Vec3 } from './layout'
import { firstNameOf, shortNameOf, haloTexture, initialsTexture, LABEL_ASPECT, labelTexture } from './textures'

export type NodeEmphasis = 'normal' | 'lit' | 'dim'

interface Props {
  person: Person
  position: Vec3
  tint: THREE.Color
  emphasis: NodeEmphasis
  active: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  /** Write the last name under every star, not just the one in focus. */
  showSurname: boolean
  /** Write the years of birth and death under the name. */
  showYears: boolean
}

const RADIUS = 0.9
const LABEL_HEIGHT = 0.62
/** Beyond this distance names stop shrinking with distance (up to GROW_MAX times). */
const GROW_FROM = 26
const GROW_MAX = 2.7
const scratch = new THREE.Vector3()

export function PersonNode({ person, position, tint, emphasis, active, onHover, onSelect, showSurname, showYears }: Props) {
  const group = useRef<THREE.Group>(null)
  const disc = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const label = useRef<THREE.MeshBasicMaterial>(null)
  const shortLabel = useRef<THREE.MeshBasicMaterial>(null)
  const yearsLabel = useRef<THREE.MeshBasicMaterial>(null)
  const labels = useRef<THREE.Group>(null)
  /** Dimming darkens the disc instead of fading it: on the black sky it looks the same, but stays opaque so links behind it don't show through. */
  const fade = useRef(1)

  const initials = useMemo(() => initialsTexture(person.name, tint), [person.name, tint])
  const nameTexture = useMemo(() => labelTexture(shortNameOf(person.name)), [person.name])
  const firstNameTexture = useMemo(() => labelTexture(firstNameOf(person.name)), [person.name])
  const years = showYears ? lifeYears(person) : ''
  const yearsTexture = useMemo(() => (years ? labelTexture(years, true) : null), [years])
  const [photo, setPhoto] = useState<THREE.Texture | null>(null)

  useEffect(() => () => initials.dispose(), [initials])
  useEffect(() => () => nameTexture.dispose(), [nameTexture])
  useEffect(() => () => firstNameTexture.dispose(), [firstNameTexture])
  useEffect(() => () => yearsTexture?.dispose(), [yearsTexture])
  useEffect(() => {
    if (!person.thumb) return
    let alive = true
    let loaded: THREE.Texture | undefined
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(asset(person.thumb), (t) => {
      if (!alive) return t.dispose()
      t.colorSpace = THREE.SRGBColorSpace
      loaded = t
      setPhoto(t)
    })
    return () => {
      alive = false
      loaded?.dispose()
      setPhoto(null)
    }
  }, [person.thumb])

  useFrame(({ camera }, delta) => {
    if (!group.current || !disc.current || !ring.current || !glow.current) return
    if (!label.current || !shortLabel.current || !labels.current) return
    const k = 1 - Math.exp(-delta * 9)
    const dim = emphasis === 'dim'
    const scale = active ? 1.3 : emphasis === 'lit' ? 1.08 : 1
    group.current.scale.lerp(scratch.setScalar(scale), k)
    fade.current += ((dim ? 0.22 : 1) - fade.current) * k
    disc.current.color.setScalar(fade.current)
    ring.current.color.copy(tint).multiplyScalar(fade.current ** 1.25) // 1 → 1, 0.22 → 0.15
    glow.current.opacity += ((dim ? 0.04 : active ? 0.5 : emphasis === 'lit' ? 0.4 : 0.3) - glow.current.opacity) * k

    // Names: a first name under every star; first and last name for the one in focus.
    const d = camera.position.distanceTo(group.current.getWorldPosition(scratch))
    const grow = THREE.MathUtils.clamp(d / GROW_FROM, 1, GROW_MAX)
    labels.current.scale.setScalar(grow)
    labels.current.position.y = -RADIUS - 0.18 - (LABEL_HEIGHT / 2) * grow
    const full = active || showSurname ? 1 : 0
    const strength = dim ? 0.22 : 1
    label.current.opacity += (full * strength - label.current.opacity) * k
    shortLabel.current.opacity += ((1 - full) * strength - shortLabel.current.opacity) * k
    if (yearsLabel.current) yearsLabel.current.opacity += (strength - yearsLabel.current.opacity) * k
  })

  return (
    <Billboard position={position}>
      <group ref={group}>
        <mesh position-z={-0.05} renderOrder={1}>
          <planeGeometry args={[RADIUS * 5, RADIUS * 5]} />
          <meshBasicMaterial
            ref={glow}
            map={haloTexture()}
            color={tint}
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            fog={false}
          />
        </mesh>
        <mesh renderOrder={2}>
          <ringGeometry args={[RADIUS, RADIUS + 0.07, 64]} />
          <meshBasicMaterial ref={ring} color={tint} toneMapped={false} />
        </mesh>
        <mesh
          renderOrder={2}
          onPointerOver={(e) => {
            e.stopPropagation()
            onHover(person.id)
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            e.stopPropagation()
            if (e.delta < 6) onSelect(person.id)
          }}
        >
          <circleGeometry args={[RADIUS, 48]} />
          <meshBasicMaterial ref={disc} map={photo ?? initials} toneMapped={false} />
        </mesh>
        <group ref={labels}>
          {[
            [label, nameTexture] as const,
            [shortLabel, firstNameTexture] as const,
          ].map(([ref, texture], i) => (
            <mesh key={i} renderOrder={3}>
              <planeGeometry args={[LABEL_HEIGHT * LABEL_ASPECT, LABEL_HEIGHT]} />
              <meshBasicMaterial
                ref={ref}
                map={texture}
                transparent
                opacity={0}
                depthWrite={false}
                depthTest={false}
                toneMapped={false}
                fog={false}
              />
            </mesh>
          ))}
          {yearsTexture && (
            <mesh renderOrder={3} position-y={-LABEL_HEIGHT * 0.82}>
              <planeGeometry args={[LABEL_HEIGHT * LABEL_ASPECT, LABEL_HEIGHT]} />
              <meshBasicMaterial
                ref={yearsLabel}
                map={yearsTexture}
                transparent
                opacity={0}
                depthWrite={false}
                depthTest={false}
                toneMapped={false}
                fog={false}
              />
            </mesh>
          )}
        </group>
      </group>
    </Billboard>
  )
}
