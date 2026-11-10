import type { Relation } from '../data/graph'

const UP = ['', 'pai/mãe', 'avô/avó', 'bisavô/bisavó', 'trisavô/trisavó']
const DEGREE = ['', '', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo']
const DOWN = ['', 'filho(a)', 'neto(a)', 'bisneto(a)', 'trineto(a)']

/**
 * What the second person is to the first ("sobrinho(a)"), or null when there is no
 * short name for it. Nobody's gender is recorded, so both forms are given.
 */
export function kinshipName({ steps, partners }: Relation): string | null {
  if (partners) return 'companheiro(a)'
  if (!steps) return null
  const { up, down, half } = steps
  if (down === 0) return UP[up] ?? null
  if (up === 0) return DOWN[down] ?? null
  if (up === 1 && down === 1) return half ? 'meio-irmão/meia-irmã' : 'irmão/irmã'
  if (down === 1) return up === 2 ? 'tio(a)' : up === 3 ? 'tio(a)-avô(ó)' : null
  if (up === 1) return down === 2 ? 'sobrinho(a)' : down === 3 ? 'sobrinho(a)-neto(a)' : null
  // Cousins: children of brothers and sisters are "direitos"; each generation further away,
  // on either side, adds a degree (a first cousin's child is "em segundo grau", as are the
  // children of two first cousins).
  const degree = Math.max(up, down) - 1
  return degree === 1 ? 'primo(a) direito(a)' : `primo(a) em ${DEGREE[degree] ?? `${degree}.º`} grau`
}
