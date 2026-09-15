// Measures where the bowl sits in every dish photo and prints the `frame`
// values for src/contexts/menu/domain/catalog-data.ts. Run after adding or
// re-shooting photos:  node scripts/measure-dish-frames.mjs
//
// Method: the studio backdrop colour is the median of a 40px frame around the
// edges; a pixel is "bowl" when it differs from that by more than 30 (L); the
// frame is the first and last row where at least 5% of pixels are bowl.
// Needs Python 3 with Pillow (the atlas already uses it).
import { execFileSync } from 'node:child_process'
const py = String.raw`
import re, json
from PIL import Image, ImageChops, ImageStat
src = open('src/contexts/menu/domain/catalog-data.ts').read()
imgs = sorted(set(re.findall(r'"image": "([^"]+)"', src)))
out = {}
for img in imgs:
    im = Image.open('public' + img).convert('RGB'); W, H = im.size
    strips = [im.crop((0,0,W,40)), im.crop((0,H-40,W,H)), im.crop((0,0,40,H)).rotate(90, expand=True), im.crop((W-40,0,W,H)).rotate(90, expand=True)]
    edge = Image.new('RGB', (sum(s.width for s in strips), 40)); x = 0
    for s in strips: edge.paste(s, (x, 0)); x += s.width
    bg = tuple(int(v) for v in ImageStat.Stat(edge).median)
    fg = ImageChops.difference(im, Image.new('RGB', (W, H), bg)).convert('L').point(lambda v: 255 if v > 30 else 0)
    px = fg.load()
    ys = [y for y in range(0, H, 2) if sum(1 for x in range(0, W, 3) if px[x, y]) / (W / 3) > 0.05]
    out[img] = [round(ys[0] / H, 3), round(ys[-1] / H, 3)]
print(json.dumps(out, indent=1))
`
process.stdout.write(execFileSync('python3', ['-c', py], { encoding: 'utf8' }))
