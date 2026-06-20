export interface DormMapping {
  displayName: string
  number: number
  shape: DormShape
}

export type DormShape =
  | 'circle' | 'square' | 'triangle' | 'diamond' | 'pentagon'
  | 'hexagon' | 'octagon' | 'star' | 'shield' | 'plus'
  | 'oval' | 'arrow'

export const DORM_SHAPE_MAP: Record<string, DormMapping> = {
  'The Myriad':     { displayName: 'MYRIAD',      number: 1, shape: 'circle' },
  'KSK Homes':     { displayName: 'KSK HOMES',   number: 2, shape: 'square' },
  'Yugo':           { displayName: 'YUGO',         number: 3, shape: 'triangle' },
  'DSOA Residence': { displayName: 'DSOA',         number: 4, shape: 'hexagon' },
  'Study World':    { displayName: 'STUDY WORLD',  number: 5, shape: 'star' },
  'Other':          { displayName: 'OTHER',        number: 6, shape: 'plus' },
}

const SHAPE_PATHS: Record<DormShape, string> = {
  circle:   '<circle cx="50" cy="50" r="44" />',
  square:   '<rect x="6" y="6" width="88" height="88" rx="6" />',
  triangle: '<polygon points="50,6 94,90 6,90" />',
  diamond:  '<polygon points="50,4 96,50 50,96 4,50" />',
  pentagon: '<polygon points="50,4 95,38 77,94 23,94 5,38" />',
  hexagon:  '<polygon points="50,4 91,27 91,73 50,96 9,73 9,27" />',
  octagon:  '<polygon points="33,4 67,4 96,33 96,67 67,96 33,96 4,67 4,33" />',
  star:     '<polygon points="50,4 61,36 96,36 68,58 79,92 50,72 21,92 32,58 4,36 39,36" />',
  shield:   '<path d="M50,4 L90,20 L90,50 Q90,82 50,96 Q10,82 10,50 L10,20 Z" />',
  plus:     '<path d="M34,6 h32 v28 h28 v32 h-28 v28 h-32 v-28 h-28 v-32 h28 z" />',
  oval:     '<ellipse cx="50" cy="50" rx="46" ry="34" />',
  arrow:    '<polygon points="50,4 92,52 70,52 70,96 30,96 30,52 8,52" />',
}

const SHAPE_TEXT_TWEAK: Record<DormShape, { fontScale: number; dy: number }> = {
  circle:   { fontScale: 1,    dy: 0 },
  square:   { fontScale: 1,    dy: 0 },
  triangle: { fontScale: 0.82, dy: 4 },
  diamond:  { fontScale: 0.80, dy: 0 },
  pentagon: { fontScale: 1,    dy: 2 },
  hexagon:  { fontScale: 1,    dy: 0 },
  octagon:  { fontScale: 1,    dy: 0 },
  star:     { fontScale: 0.60, dy: 3 },
  shield:   { fontScale: 0.90, dy: 2 },
  plus:     { fontScale: 0.78, dy: 0 },
  oval:     { fontScale: 0.85, dy: 0 },
  arrow:    { fontScale: 0.70, dy: 6 },
}

export function dormShapeSvg(
  shape: DormShape,
  number: number,
  size: number,
  variant: 'light' | 'dark',
  options?: { hideNumber?: boolean },
): string {
  const fill = variant === 'light' ? '#ede8da' : '#091825'
  const textFill = variant === 'light' ? '#091825' : '#ede8da'
  const tweak = SHAPE_TEXT_TWEAK[shape]
  const fontSize = size * 0.44 * tweak.fontScale
  const textY = 54 + tweak.dy

  const numberEl = options?.hideNumber
    ? ''
    : `<text x="50" y="${textY}" text-anchor="middle" dominant-baseline="central"
      fill="${textFill}" font-family="Montserrat,sans-serif" font-weight="600"
      font-size="${fontSize}px">${number}</text>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
    <g fill="${fill}">${SHAPE_PATHS[shape]}</g>
    ${numberEl}
  </svg>`
}

export function getDormMapping(dormName: string | null): DormMapping {
  if (!dormName) return DORM_SHAPE_MAP['Other']
  return DORM_SHAPE_MAP[dormName] ?? DORM_SHAPE_MAP['Other']
}

export { SHAPE_PATHS }

export const AVAILABLE_SHAPES: DormShape[] = [
  'circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'star', 'shield', 'plus', 'oval', 'arrow',
]
