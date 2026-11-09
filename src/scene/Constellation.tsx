import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { type Graph, lineage } from '../data/graph'
import { Links } from './Links'
import type { Layout } from './layout'
import { PersonNode } from './PersonNode'

interface Props {
  graph: Graph
  layout: Layout
  selectedId: string | null
  onSelect: (id: string) => void
  reducedMotion: boolean
  /** True when the person panel covers the right side of a wide screen. */
  panelBeside: boolean
  /** Changes every time the visitor asks to see the whole tree again. */
  overviewRequest: number
}

const SKY = '#000000'
// Like real stars: the oldest burn orange, the youngest blue-white.
const OLDEST = new THREE.Color('#ffb98a')
const MIDDLE = new THREE.Color('#fff3e4')
const YOUNGEST = new THREE.Color('#bcd6ff')
const FOCUS_DISTANCE = 13
const FOV = 45

// The tree is a flat chart: dragging slides it, the wheel or a pinch zooms. It never rotates.
const { ACTION } = CameraControlsImpl
const PAN_WITH_MOUSE = { left: ACTION.TRUCK, middle: ACTION.TRUCK, right: ACTION.TRUCK, wheel: ACTION.DOLLY }
const PAN_WITH_TOUCH = { one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_DOLLY_TRUCK, three: ACTION.TOUCH_DOLLY_TRUCK }

function Scene({ graph, layout, selectedId, onSelect, reducedMotion, panelBeside, overviewRequest }: Props) {
  const controls = useRef<CameraControlsImpl>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const started = useRef(false)
  const lastOverview = useRef(overviewRequest)
  const aspect = useThree((s) => s.size.width / s.size.height)
  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  const { positions } = layout

  const radius = useMemo(() => {
    let r = 8
    for (const [x, y, z] of positions.values()) r = Math.max(r, Math.hypot(x, y, z))
    return r + 4
  }, [positions])

  /** How far back the camera must be, on the z axis, to see everybody. */
  const overviewDistance = (aspect: number) => {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    let distance = 12
    for (const [x, y, z] of positions.values())
      distance = Math.max(distance, z + (Math.abs(x) + 3.5) / (tan * aspect), z + (Math.abs(y) + 4) / tan)
    return distance
  }

  const tints = useMemo(() => {
    const last = Math.max(1, graph.generationCount - 1)
    return Array.from({ length: graph.generationCount }, (_, g) => {
      const t = g / last
      return t < 0.5 ? OLDEST.clone().lerp(MIDDLE, t * 2) : MIDDLE.clone().lerp(YOUNGEST, t * 2 - 1)
    })
  }, [graph.generationCount])

  const focusId = hoverId ?? selectedId
  const focus = useMemo(() => (focusId ? lineage(graph, focusId) : null), [graph, focusId])

  useEffect(() => {
    document.body.style.cursor = hoverId ? 'pointer' : ''
    return () => void (document.body.style.cursor = '')
  }, [hoverId])

  // Camera: the whole tree from the front on arrival and on request, otherwise fly to whoever is selected.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const animate = started.current && !reducedMotion
    const asked = lastOverview.current !== overviewRequest
    lastOverview.current = overviewRequest
    const target = selectedId && positions.get(selectedId)

    if (!started.current || (asked && !target)) {
      void c.setLookAt(0, 0, overviewDistance(aspectRef.current), 0, 0, 0, animate)
    }
    started.current = true

    if (target) {
      // Face the person straight on.
      const [x, y, z] = target
      void c.setLookAt(x, y + 0.8, z + FOCUS_DISTANCE, x, y - 0.6, z, animate)
      void c.setFocalOffset(panelBeside ? 3 : 0, 0, 0, animate)
    } else {
      void c.setFocalOffset(0, 0, 0, animate)
    }
  }, [selectedId, positions, reducedMotion, panelBeside, overviewRequest])

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, radius * 2.2, radius * 7]} />
      <Links segments={layout.segments} line={focus?.line ?? null} shown={focus?.shown ?? null} />
      {graph.people.map((p) => (
        <PersonNode
          key={p.id}
          person={p}
          position={positions.get(p.id)!}
          tint={tints[graph.generation.get(p.id)!]}
          emphasis={!focus ? 'normal' : focus.shown.has(p.id) ? 'lit' : 'dim'}
          active={p.id === focusId}
          onHover={setHoverId}
          onSelect={onSelect}
        />
      ))}
      <CameraControls
        ref={controls}
        makeDefault
        minDistance={4}
        maxDistance={radius * 4}
        smoothTime={0.35}
        draggingSmoothTime={0.08}
        dollyToCursor
        mouseButtons={PAN_WITH_MOUSE}
        touches={PAN_WITH_TOUCH}
      />
    </>
  )
}

export default function Constellation(props: Props) {
  return (
    <Canvas
      className="sky"
      dpr={[1, 2]}
      camera={{ fov: FOV, near: 0.1, far: 4000, position: [0, 0, 60] }}
      gl={{ antialias: true }}
      aria-hidden="true"
    >
      <Scene {...props} />
    </Canvas>
  )
}
