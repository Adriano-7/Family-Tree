import { CameraControls, Stars } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import type CameraControlsImpl from 'camera-controls'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { closeFamily, type Graph } from '../data/graph'
import { Links } from './Links'
import type { Vec3 } from './layout'
import { PersonNode } from './PersonNode'

interface Props {
  graph: Graph
  positions: Map<string, Vec3>
  selectedId: string | null
  onSelect: (id: string) => void
  reducedMotion: boolean
  /** True when the person panel covers the right side of a wide screen. */
  panelBeside: boolean
}

const SKY = '#0b1230'
const OLDEST = new THREE.Color('#f6d99a')
const YOUNGEST = new THREE.Color('#a9c8ff')
const FOCUS_DISTANCE = 11

function Scene({ graph, positions, selectedId, onSelect, reducedMotion, panelBeside }: Props) {
  const controls = useRef<CameraControlsImpl>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const lastTouched = useRef(-Infinity)
  const started = useRef(false)

  const radius = useMemo(() => {
    let r = 6
    for (const [x, y, z] of positions.values()) r = Math.max(r, Math.hypot(x, y, z))
    return r + 2
  }, [positions])

  const tints = useMemo(() => {
    const last = Math.max(1, graph.generationCount - 1)
    return Array.from({ length: graph.generationCount }, (_, g) => OLDEST.clone().lerp(YOUNGEST, g / last))
  }, [graph.generationCount])

  // A small family can show every name at once; a large one shows names as you come closer.
  const labelRange = useMemo<[number, number]>(
    () => (graph.people.length <= 30 ? [radius * 2.4, radius * 3.4] : [16, 30]),
    [graph.people.length, radius],
  )

  const focusId = hoverId ?? selectedId
  const family = useMemo(() => (focusId ? closeFamily(graph, focusId) : null), [graph, focusId])

  useEffect(() => {
    document.body.style.cursor = hoverId ? 'pointer' : ''
    return () => void (document.body.style.cursor = '')
  }, [hoverId])

  // Camera: whole sky on arrival, then fly to whoever is selected.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const animate = started.current && !reducedMotion
    if (!started.current) {
      started.current = true
      c.setLookAt(radius * 0.45, radius * 0.2, radius * 1.75, 0, 0, 0, false)
    }
    const target = selectedId && positions.get(selectedId)
    if (target) {
      const [x, y, z] = target
      const here = new THREE.Vector3(x, y, z)
      const dir = c.camera.position.clone().sub(here)
      dir.y *= 0.25
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1)
      // Look across the nearest neighbour (usually a partner) instead of through them.
      let nearest: THREE.Vector3 | null = null
      for (const [id, p] of positions) {
        if (id === selectedId) continue
        const offset = new THREE.Vector3(...p).sub(here)
        if (offset.length() < 6 && (!nearest || offset.length() < nearest.length())) nearest = offset
      }
      if (nearest) {
        const side = new THREE.Vector3(-nearest.z, 0, nearest.x)
        if (side.lengthSq() > 0.01) {
          if (side.dot(dir) < 0) side.negate()
          dir.copy(side).setY(side.length() * 0.12)
        }
      }
      dir.normalize().multiplyScalar(FOCUS_DISTANCE)
      void c.setLookAt(x + dir.x, y + dir.y, z + dir.z, x, y, z, animate)
      void c.setFocalOffset(panelBeside ? 2.6 : 0, 0, 0, animate)
    } else {
      void c.setFocalOffset(0, 0, 0, animate)
    }
  }, [selectedId, positions, radius, reducedMotion, panelBeside])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const touch = () => (lastTouched.current = performance.now())
    c.addEventListener('control', touch)
    return () => c.removeEventListener('control', touch)
  }, [])

  // Slow drift while nobody is steering.
  useFrame((_, delta) => {
    if (reducedMotion || selectedId || hoverId || !controls.current) return
    if (performance.now() - lastTouched.current < 5000) return
    void controls.current.rotate(delta * 0.025, 0, false)
  })

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, radius * 1.4, radius * 5]} />
      <Stars radius={radius * 4} depth={radius * 2} count={2600} factor={radius * 0.28} saturation={0.4} fade speed={0} />
      <Links graph={graph} positions={positions} focusId={focusId} />
      {graph.people.map((p) => (
        <PersonNode
          key={p.id}
          person={p}
          position={positions.get(p.id)!}
          tint={tints[graph.generation.get(p.id)!]}
          emphasis={!family ? 'normal' : family.has(p.id) ? 'lit' : 'dim'}
          active={p.id === focusId}
          labelRange={labelRange}
          onHover={setHoverId}
          onSelect={onSelect}
        />
      ))}
      <CameraControls
        ref={controls}
        makeDefault
        minDistance={4}
        maxDistance={radius * 3.2}
        smoothTime={0.35}
        draggingSmoothTime={0.12}
      />
    </>
  )
}

export default function Constellation(props: Props) {
  return (
    <Canvas
      className="sky"
      dpr={[1, 2]}
      camera={{ fov: 45, near: 0.1, far: 2000, position: [0, 0, 60] }}
      gl={{ antialias: true }}
      aria-hidden="true"
    >
      <Scene {...props} />
    </Canvas>
  )
}
