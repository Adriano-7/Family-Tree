import * as THREE from 'three'

export const DISPLAY_FONT = 'Fraunces'
export const TEXT_FONT = 'Figtree'

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return [c, c.getContext('2d')!] as const
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

let halo: THREE.Texture | undefined
/** Soft round glow shared by every star. */
export function haloTexture() {
  if (halo) return halo
  const [c, ctx] = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.28)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return (halo = toTexture(c))
}

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

/** Stands in for the portrait of someone without a photo. */
export function initialsTexture(name: string, tint: THREE.Color) {
  const [c, ctx] = canvas(256, 256)
  const dark = tint.clone().multiplyScalar(0.3)
  const g = ctx.createRadialGradient(128, 90, 10, 128, 128, 150)
  g.addColorStop(0, `#${tint.clone().multiplyScalar(0.55).getHexString()}`)
  g.addColorStop(1, `#${dark.getHexString()}`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = `#${tint.clone().lerp(new THREE.Color('#ffffff'), 0.6).getHexString()}`
  ctx.font = `500 104px ${DISPLAY_FONT}, Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initialsOf(name), 128, 136)
  return toTexture(c)
}

export const LABEL_ASPECT = 512 / 80

export function labelTexture(name: string) {
  const [c, ctx] = canvas(512, 80)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = 40
  do {
    ctx.font = `500 ${size}px ${TEXT_FONT}, system-ui, sans-serif`
    size -= 2
  } while (ctx.measureText(name).width > 496 && size > 18)
  ctx.shadowColor = 'rgba(5,8,26,0.95)'
  ctx.shadowBlur = 8
  ctx.fillStyle = '#ece7db'
  ctx.fillText(name, 256, 42)
  ctx.fillText(name, 256, 42)
  return toTexture(c)
}
