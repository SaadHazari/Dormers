// Regenerates src/app/admin/labels/fonts/montserrat.ts from
// @fontsource/montserrat (devDependency). Run after bumping the font package:
//   node scripts/generate-label-fonts.mjs
import fs from 'node:fs'

const dir = 'node_modules/@fontsource/montserrat/files'
const weights = [300, 500, 600, 700, 800]

let out = '// Auto-generated from @fontsource/montserrat (latin subset, woff).\n'
out += '// Regenerate: node scripts/generate-label-fonts.mjs\n'
out += '// Embedded as base64 so the PDF engine works identically in dev,\n'
out += '// serverless, and scripts with zero filesystem/bundler concerns.\n\n'
for (const w of weights) {
  const b64 = fs.readFileSync(`${dir}/montserrat-latin-${w}-normal.woff`).toString('base64')
  out += `const W${w} = '${b64}'\n\n`
}
out += 'export const MONTSERRAT_WOFF2_B64: Record<300 | 500 | 600 | 700 | 800, string> = {\n'
out += weights.map(w => `  ${w}: W${w},`).join('\n')
out += '\n}\n\n'
out += 'export function montserratBuffer(weight: 300 | 500 | 600 | 700 | 800): Buffer {\n'
out += "  return Buffer.from(MONTSERRAT_WOFF2_B64[weight], 'base64')\n"
out += '}\n'

fs.mkdirSync('src/app/admin/labels/fonts', { recursive: true })
fs.writeFileSync('src/app/admin/labels/fonts/montserrat.ts', out)
console.log('written src/app/admin/labels/fonts/montserrat.ts')
