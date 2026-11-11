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
  /** The household the visit starts on; empty to start on the whole tree. */
  homeIds: string[]
  /** Changes every time the visitor asks to go back to that household. */
  homeRequest: number
  /** Changes when a filter shows other people: the camera then takes in the new tree. */
  filterKey: string
  /** Generations in the complete tree, so a star keeps its colour while others are hidden. */
  generation: Map<string, number>
  generationCount: number
  /** Pixels at the top and bottom of the view taken by the controls, which the tree should stay clear of. */
  inset: () => { top: number; bottom: number }
  /** What is written under each star besides the first name. */
  labels: { surname: boolean; years: boolean }
}

const SKY = '#000000'
// Like real stars: the oldest burn orange, the youngest blue-white.
const OLDEST = new THREE.Color('#ffb98a')
const MIDDLE = new THREE.Color('#fff3e4')
const YOUNGEST = new THREE.Color('#bcd6ff')
const FOCUS_DISTANCE = 13
const CLOSEST_FRAME = 16
const FOV = 45

// The tree is a flat chart: dragging slides it, the wheel or a pinch zooms. It never rotates.
const { ACTION } = CameraControlsImpl
const PAN_WITH_MOUSE = { left: ACTION.TRUCK, middle: ACTION.TRUCK, right: ACTION.TRUCK, wheel: ACTION.DOLLY }
const PAN_WITH_TOUCH = { one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_DOLLY_TRUCK, three: ACTION.TOUCH_DOLLY_TRUCK }

// The controls multiply the distance by 0.95^(-deltaY / 30) for a turn of the wheel (/ 10 on a Mac).
/** The wheel travel that changes the distance by a factor of e. */
const WHEEL_PER_E = -(/Mac/.test(navigator.platform) ? 10 : 30) / Math.log(0.95)
// A pinch arrives in much smaller steps, and should follow the fingers: about e^(deltaY / 100).
const PINCH_BOOST = WHEEL_PER_E / 100

function Scene({
  graph,
  layout,
  selectedId,
  onSelect,
  reducedMotion,
  panelBeside,
  overviewRequest,
  homeIds,
  homeRequest,
  filterKey,
  generation,
  generationCount,
  inset,
  labels,
}: Props) {
  const controls = useRef<CameraControlsImpl>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const started = useRef(false)
  const lastOverview = useRef(overviewRequest)
  const lastHome = useRef(homeRequest)
  const lastFilter = useRef(filterKey)
  /** The people last framed, until the visitor moves the view or opens somebody. */
  const framed = useRef<string[] | null>(null)
  const size = useThree((s) => s.size)
  const sizeRef = useRef(size)
  sizeRef.current = size
  const { positions } = layout

  const radius = useMemo(() => {
    let r = 8
    for (const [x, y, z] of positions.values()) r = Math.max(r, Math.hypot(x, y, z))
    return r + 4
  }, [positions])

  /** Faces these people (everybody when none are given) from just far enough to see them all. */
  const frame = (ids: string[], animate: boolean) => {
    framed.current = ids
    const spots = ids.map((id) => positions.get(id)).filter((p) => !!p)
    const all = spots.length ? spots : [...positions.values()]
    if (!all.length) return
    const xs = all.map((p) => p[0])
    const ys = all.map((p) => p[1])
    const [left, right, bottom, top] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    // The people go in the part of the view that the controls leave free.
    const { width, height } = sizeRef.current
    const covered = inset()
    const free = Math.max(0.4, 1 - (covered.top + covered.bottom) / height)
    const distance = Math.max(
      CLOSEST_FRAME,
      ((right - left) / 2 + 3.5) / (tan * (width / height)),
      ((top - bottom) / 2 + 3.2) / (tan * free),
    )
    const x = (left + right) / 2
    const y = (top + bottom) / 2 + ((covered.top - covered.bottom) / height) * distance * tan
    void controls.current?.setLookAt(x, y, distance, x, y, 0, animate)
  }

  const tints = useMemo(() => {
    const last = Math.max(1, generationCount - 1)
    return Array.from({ length: generationCount }, (_, g) => {
      const t = g / last
      return t < 0.5 ? OLDEST.clone().lerp(MIDDLE, t * 2) : MIDDLE.clone().lerp(YOUNGEST, t * 2 - 1)
    })
  }, [generationCount])

  const focusId = hoverId ?? selectedId
  const focus = useMemo(() => (focusId ? lineage(graph, focusId) : null), [graph, focusId])

  useEffect(() => {
    document.body.style.cursor = hoverId ? 'pointer' : ''
    return () => void (document.body.style.cursor = '')
  }, [hoverId])

  // Camera: the home household on arrival, the whole tree or that household on request,
  // the new tree when a filter changes it; otherwise fly to whoever is selected.
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const animate = started.current && !reducedMotion
    const askedAll = lastOverview.current !== overviewRequest
    const askedHome = lastHome.current !== homeRequest
    const filtered = lastFilter.current !== filterKey
    lastOverview.current = overviewRequest
    lastHome.current = homeRequest
    lastFilter.current = filterKey
    const target = selectedId && positions.get(selectedId)

    if (!target) {
      if (!started.current || askedHome) frame(homeIds, animate)
      else if (askedAll || filtered) frame([], animate)
    }
    started.current = true

    if (target) {
      framed.current = null
      // Face the person straight on.
      const [x, y, z] = target
      void c.setLookAt(x, y + 0.8, z + FOCUS_DISTANCE, x, y - 0.6, z, animate)
      void c.setFocalOffset(panelBeside ? 3 : 0, 0, 0, animate)
    } else {
      void c.setFocalOffset(0, 0, 0, animate)
    }
  }, [selectedId, positions, reducedMotion, panelBeside, overviewRequest, homeRequest, filterKey])

  // The framing depends on the size of the window (measured a moment after arrival, and on every resize).
  useEffect(() => {
    if (framed.current) frame(framed.current, false)
  }, [size.width, size.height])

  // A pinch on a trackpad: the controls would narrow the lens, and far too slowly. It is handed
  // back to them as a turn of the wheel of the same strength, so it moves the camera like one.
  const canvas = useThree((s) => s.gl.domElement)
  useEffect(() => {
    let relaying = false
    const relay = (at: { clientX: number; clientY: number }, deltaY: number) => {
      relaying = true
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: at.clientX, clientY: at.clientY, bubbles: true, cancelable: true }))
      relaying = false
    }
    // If the browser has magnified the page itself, pinches are left to it so the visitor can get back out.
    const pageZoomed = () => (window.visualViewport?.scale ?? 1) > 1.01
    // Chrome, Firefox and Edge report a pinch as a wheel turned with Ctrl held. It is caught anywhere on
    // the page: over the controls the browser would otherwise magnify the page and push them off screen.
    const onWheel = (e: WheelEvent) => {
      if (relaying || !e.ctrlKey || pageZoomed()) return
      // A real wheel turned with Ctrl held comes in whole notches (or in lines): no boost for that,
      // and away from the tree it keeps its usual meaning of making the page bigger.
      const notches = e.deltaMode !== 0 || (Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)
      if (notches && e.target !== canvas) return
      e.preventDefault()
      e.stopImmediatePropagation()
      relay(e, notches ? e.deltaY * (e.deltaMode === 1 ? 33 : 1) : e.deltaY * PINCH_BOOST)
    }
    // Safari on a Mac reports it as a gesture with a scale. (On a touch screen the fingers already zoom.)
    let scale = 1
    const onGestureStart = (e: Event) => {
      if (pageZoomed()) return
      e.preventDefault()
      scale = 1
    }
    const onGestureChange = (e: Event) => {
      if (pageZoomed()) return
      e.preventDefault()
      const g = e as Event & { scale: number; clientX: number; clientY: number }
      if (!(g.scale > 0)) return
      relay(g, -Math.log(g.scale / scale) * WHEEL_PER_E)
      scale = g.scale
    }
    const trackpadGestures = navigator.maxTouchPoints === 0
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    if (trackpadGestures) {
      window.addEventListener('gesturestart', onGestureStart)
      window.addEventListener('gesturechange', onGestureChange)
    }
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true })
      window.removeEventListener('gesturestart', onGestureStart)
      window.removeEventListener('gesturechange', onGestureChange)
    }
  }, [canvas])

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
          tint={tints[generation.get(p.id) ?? 0]}
          emphasis={!focus ? 'normal' : focus.shown.has(p.id) ? 'lit' : 'dim'}
          active={p.id === focusId}
          onHover={setHoverId}
          onSelect={onSelect}
          showSurname={labels.surname}
          showYears={labels.years}
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
        onControlStart={() => (framed.current = null)}
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
