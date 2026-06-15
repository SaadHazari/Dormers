export interface DormMapping {
  displayName: string
  number: number
  shape: DormShape
}

export type DormShape = 'circle' | 'square' | 'triangle' | 'hexagon' | 'star' | 'plus'

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
  hexagon:  '<polygon points="50,4 91,27 91,73 50,96 9,73 9,27" />',
  star:     '<polygon points="50,4 61,36 96,36 68,58 79,92 50,72 21,92 32,58 4,36 39,36" />',
  plus:     '<path d="M34,6 h32 v28 h28 v32 h-28 v28 h-32 v-28 h-28 v-32 h28 z" />',
}

export function dormShapeSvg(
  shape: DormShape,
  number: number,
  size: number,
  variant: 'light' | 'dark',
): string {
  const fill = variant === 'light' ? '#ede8da' : '#091825'
  const textFill = variant === 'light' ? '#091825' : '#ede8da'
  const fontSize = shape === 'triangle' ? size * 0.38 : size * 0.44
  const textY = shape === 'triangle' ? '58' : '54'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">
    <g fill="${fill}">${SHAPE_PATHS[shape]}</g>
    <text x="50" y="${textY}" text-anchor="middle" dominant-baseline="central"
      fill="${textFill}" font-family="Montserrat,sans-serif" font-weight="600"
      font-size="${fontSize}px">${number}</text>
  </svg>`
}

export function getDormMapping(dormName: string | null): DormMapping {
  if (!dormName) return DORM_SHAPE_MAP['Other']
  return DORM_SHAPE_MAP[dormName] ?? DORM_SHAPE_MAP['Other']
}
