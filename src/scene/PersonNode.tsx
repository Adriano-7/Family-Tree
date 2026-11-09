import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Person } from '../data/types'
import type { Vec3 } from './layout'
import { haloTexture, initialsTexture, LABEL_ASPECT, labelTexture } from './textures'

export type NodeEmphasis = 'normal' | 'lit' | 'dim'

interface Props {
  person: Person
  position: Vec3
  tint: THREE.Color
  emphasis: NodeEmphasis
  active: boolean
  /** Camera distances at which the name is fully visible and fully hidden. */
  labelRange: [number, number]
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

const RADIUS = 0.9
const scratch = new THREE.Vector3()

export function PersonNode({ person, position, tint, emphasis, active, labelRange, onHover, onSelect }: Props) {
  const group = useRef<THREE.Group>(null)
  const disc = useRef<THREE.MeshBasicMaterial>(null)
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  const label = useRef<THREE.MeshBasicMaterial>(null)

  const initials = useMemo(() => initialsTexture(person.name, tint), [person.name, tint])
  const nameTexture = useMemo(() => labelTexture(person.name), [person.name])
  const [photo, setPhoto] = useState<THREE.Texture | null>(null)

  useEffect(() => () => initials.dispose(), [initials])
  useEffect(() => () => nameTexture.dispose(), [nameTexture])
  useEffect(() => {
    if (!person.thumb) return
    let alive = true
    let loaded: THREE.Texture | undefined
    new THREE.TextureLoader().load(import.meta.env.BASE_URL + person.thumb, (t) => {
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
    if (!group.current || !disc.current || !ring.current || !glow.current || !label.current) return
    const k = 1 - Math.exp(-delta * 9)
    const dim = emphasis === 'dim'
    const scale = active ? 1.3 : emphasis === 'lit' ? 1.08 : 1
    group.current.scale.lerp(scratch.setScalar(scale), k)
    disc.current.opacity += ((dim ? 0.22 : 1) - disc.current.opacity) * k
    ring.current.opacity += ((dim ? 0.15 : 1) - ring.current.opacity) * k
    glow.current.opacity += ((dim ? 0.04 : active ? 0.5 : emphasis === 'lit' ? 0.4 : 0.3) - glow.current.opacity) * k

    let labelOpacity = 0
    if (emphasis === 'lit') labelOpacity = 1
    else if (emphasis === 'normal') {
      const d = camera.position.distanceTo(group.current.getWorldPosition(scratch))
      labelOpacity = THREE.MathUtils.clamp((labelRange[1] - d) / (labelRange[1] - labelRange[0]), 0, 1) * 0.9
    }
    label.current.opacity += (labelOpacity - label.current.opacity) * k
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
          <meshBasicMaterial ref={ring} color={tint} transparent toneMapped={false} />
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
          <meshBasicMaterial ref={disc} map={photo ?? initials} transparent toneMapped={false} />
        </mesh>
        <mesh position-y={-RADIUS - 0.62} renderOrder={3}>
          <planeGeometry args={[0.62 * LABEL_ASPECT, 0.62]} />
          <meshBasicMaterial
            ref={label}
            map={nameTexture}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      </group>
    </Billboard>
  )
}
