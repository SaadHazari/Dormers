// Builds the PDF atlas from manifest.json + shots/.
//   node build-booklet.mjs [--out=/path/to/out.pdf] [--observations=observations.json] [--only=id1,id2]
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? require('node:child_process').execSync('npm root -g').toString().trim() + '/@playwright/cli/node_modules/playwright')
const sharp = require('sharp')
const { PDFDocument } = require('pdf-lib')   // npm i -D pdf-lib (not a project dependency)

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.ATLAS_OUT ?? join(__dirname, 'atlas-out')
const SHOTS = join(ROOT, 'shots')
const args = process.argv.slice(2)
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const OUT = opt('out', join(ROOT, 'Dormers-Dashboard-Atlas.pdf'))
// Image budget: output pixel width for each viewport's JPEG and its quality. Source PNGs are 2× (2880 / 786 wide).
const DESK_PX = Number(opt('deskpx', '2160')), MOB_PX = Number(opt('mobpx', '786')), QUALITY = Number(opt('quality', '80'))
const JPG_TAG = `${DESK_PX}-${MOB_PX}-q${QUALITY}`
const OBS = opt('observations', join(__dirname, 'observations.json'))
const ONLY = opt('only', '') ? opt('only').split(',') : null
const REUSE = args.includes('--reuse')   // keep already-rendered page PDFs (only the appendix depends on observations)

const JPG = join(ROOT, `jpg-${JPG_TAG}`), PAGES = join(ROOT, `pages-${JPG_TAG}`), PDFS = join(ROOT, `pdf-${JPG_TAG}`)   // per-budget dirs so two builds can run side by side
for (const d of [JPG, PAGES, PDFS]) mkdirSync(d, { recursive: true })
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'))
const observations = existsSync(OBS) ? JSON.parse(readFileSync(OBS, 'utf8')) : []
const GENERATED = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' })

// ── Page geometry (CSS px) ───────────────────────────────────────────────────
const PAGE_W = 2100, MARGIN = 56, GAP = 40
const DESK_W = 1440, MOB_SCALE = 1.25, MOB_W = Math.round(393 * MOB_SCALE)
const MAX_IMG_H = 3600   // taller captures get scaled down to keep pages sane

// ── Images: PNG → JPEG (sharp) ───────────────────────────────────────────────
function meta(id, vp) {
  const p = join(SHOTS, `${id}--${vp}.json`)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}
async function jpgFor(id, vp) {
  const src = join(SHOTS, `${id}--${vp}.png`), dst = join(JPG, `${id}--${vp}.jpg`)
  if (!existsSync(src)) return null
  if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) {
    const px = vp === 'desktop' ? DESK_PX : MOB_PX
    await sharp(src).resize({ width: px, withoutEnlargement: true }).jpeg({ quality: QUALITY, chromaSubsampling: QUALITY >= 85 ? '4:4:4' : '4:2:0', mozjpeg: true }).toFile(dst)
  }
  return dst
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── Page model ───────────────────────────────────────────────────────────────
const entries = manifest.filter(e => !ONLY || ONLY.includes(e.id))
const sections = []
for (const e of entries) {
  let s = sections.find(x => x.title === e.section)
  if (!s) { s = { title: e.section, subs: [] }; sections.push(s) }
  let sub = s.subs.find(x => x.title === (e.sub || ''))
  if (!sub) { sub = { title: e.sub || '', entries: [] }; s.subs.push(sub) }
  sub.entries.push(e)
}
// Pages: cover, guide, toc*, then per section: divider + entries; appendix
const pages = [{ kind: 'cover' }, { kind: 'guide' }]
const tocLines = []
for (const s of sections) {
  tocLines.push({ level: 0, text: s.title, ref: `sec:${s.title}` })
  for (const sub of s.subs) {
    if (sub.title) tocLines.push({ level: 1, text: sub.title, ref: `sub:${s.title}|${sub.title}` })
    for (const e of sub.entries) tocLines.push({ level: 2, text: e.title, ref: e.id })
  }
}
tocLines.push({ level: 0, text: 'Appendix · Observations & open questions', ref: 'appendix' })
const TOC_LINES_PER_PAGE = 128
const tocPageCount = Math.max(1, Math.ceil(tocLines.length / TOC_LINES_PER_PAGE))
for (let i = 0; i < tocPageCount; i++) pages.push({ kind: 'toc', index: i })
const pageOf = {}
for (const s of sections) {
  pages.push({ kind: 'section', section: s }); pageOf[`sec:${s.title}`] = pages.length
  for (const sub of s.subs) {
    let first = true
    for (const e of sub.entries) {
      pages.push({ kind: 'state', entry: e, section: s, sub })
      if (first && sub.title) { pageOf[`sub:${s.title}|${sub.title}`] = pages.length; first = false }
      pageOf[e.id] = pages.length
    }
  }
}
pages.push({ kind: 'appendix' }); pageOf['appendix'] = pages.length
const TOTAL = pages.length

// ── HTML ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
:root { --nv:#091825; --nv2:#1e3a4f; --og:#f57f20; --cream:#f5f0e8; --beige:#ede8da; --ink:#1a1a1a; --mute:#6b6a66; --line:rgba(9,24,37,0.12); }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; }
body { width:${PAGE_W}px; font-family: Montserrat, Arial, Helvetica, sans-serif; color:var(--ink); background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.page { width:${PAGE_W}px; padding:${MARGIN}px; position:relative; }
.crumb { font-size:15px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--og); }
.crumb .sep { color:var(--mute); margin:0 10px; }
h1.t { font-size:38px; font-weight:800; letter-spacing:-.02em; margin:10px 0 14px; color:var(--nv); line-height:1.15; }
.desc { font-size:18px; line-height:1.55; max-width:1500px; color:#2a2a2a; }
.meta { margin-top:14px; display:flex; gap:28px; flex-wrap:wrap; font-size:14.5px; color:var(--mute); }
.meta b { color:var(--nv); font-weight:700; }
.meta code { font-family: ui-monospace, Menlo, monospace; font-size:13.5px; background:var(--beige); padding:3px 8px; border-radius:6px; color:var(--nv); }
.shots { display:flex; gap:${GAP}px; align-items:flex-start; margin-top:26px; }
.shot { flex:0 0 auto; }
.shot .cap { font-size:13px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin-bottom:10px; display:flex; justify-content:space-between; }
.shot img { display:block; border:1px solid rgba(9,24,37,0.22); border-radius:10px; }   /* no box-shadow: Chrome rasterises shadows into grey blobs in some PDF viewers */
.missing { display:flex; align-items:center; justify-content:center; height:300px; border:2px dashed var(--line); border-radius:12px; color:var(--mute); font-size:16px; text-align:center; padding:20px; }
.foot { position:absolute; left:${MARGIN}px; right:${MARGIN}px; bottom:22px; display:flex; justify-content:space-between; font-size:13px; color:var(--mute); }
.foot b { color:var(--nv); }
.badge { display:inline-block; font-size:12px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; padding:4px 10px; border-radius:999px; background:var(--beige); color:var(--nv); margin-left:10px; vertical-align:middle; }
.note { margin-top:18px; padding:14px 18px; border-left:4px solid var(--og); background:#fff7ef; font-size:15px; line-height:1.5; max-width:1500px; }
`
const foot = (n, section = '') => `<div class="foot"><span>Dormers · Customer Dashboard Atlas · ${esc(GENERATED)}</span><span>${esc(section)}</span><span>Page <b>${n}</b> / ${TOTAL}</span></div>`
const wrap = (body, minH = 1200) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page" style="min-height:${minH}px">${body}</div></body></html>`

function coverHtml() {
  const counts = { states: entries.length, shots: entries.reduce((a, e) => a + ['mobile', 'desktop'].filter(v => (e.viewports ?? ['mobile', 'desktop']).includes(v) && existsSync(join(SHOTS, `${e.id}--${v}.png`))).length, 0), sections: sections.length }
  return wrap(`
  <div style="min-height:1250px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(160deg,#091825 0%,#1e3a4f 70%,#24475f 100%);margin:-${MARGIN}px;padding:120px 140px;color:var(--cream);border-radius:0">
    <div>
      <div style="font-size:18px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:var(--og)">Dormers · Ohio</div>
      <div style="font-size:96px;font-weight:800;letter-spacing:-.03em;line-height:1.02;margin-top:28px">Customer Dashboard<br>Screen &amp; State Atlas<span style="color:var(--og)">.</span></div>
      <div style="font-size:26px;line-height:1.5;margin-top:36px;max-width:1300px;color:rgba(245,240,232,.82)">Every screen a signed-in customer can reach under <code style="font-family:Menlo,monospace;color:#fff">/dashboard</code>, in every state the product can put it in — captured on a phone and on a desktop, side by side, and organised by surface.</div>
    </div>
    <div style="display:flex;gap:64px;font-size:20px;color:rgba(245,240,232,.85)">
      <div><div style="font-size:64px;font-weight:800;color:#fff;line-height:1">${counts.sections}</div>surfaces</div>
      <div><div style="font-size:64px;font-weight:800;color:#fff;line-height:1">${counts.states}</div>states</div>
      <div><div style="font-size:64px;font-weight:800;color:#fff;line-height:1">${counts.shots}</div>screenshots</div>
      <div style="margin-left:auto;text-align:right"><div style="font-size:22px;font-weight:700;color:#fff">Generated ${esc(GENERATED)}</div><div style="margin-top:6px">from the development preview harness · main branch</div></div>
    </div>
  </div>`, 1250)
}

function guideHtml(n) {
  return wrap(`
  <div class="crumb">How to read this atlas</div>
  <h1 class="t">One page per state. Desktop on the left, phone on the right.</h1>
  <div class="desc" style="max-width:1700px">
    <p>The atlas is organised by <b>surface</b> (the sidebar destinations plus the takeovers that interrupt them), then by <b>state</b>: a distinct look the product can put that surface in. Each state page names the look, says what the customer sees, and states the exact <b>conditions</b> that produce it (subscription status, dates, profile completeness, time of day, what was tapped). The preview URL underneath is the development fixture that rendered it, so any page can be reproduced or re-shot on demand.</p>
    <p>Both breakpoint trees of the dashboard are shown for every state. The app switches trees at <b>1024px landscape</b>: below that (and on any portrait tablet) it renders the dedicated mobile tree; above it, the desktop tree with the rail. Where a state only exists on one tree, the page says so.</p>
  </div>
  <div class="shots" style="margin-top:36px">
    <div style="flex:1;padding:26px 30px;border:1px solid var(--line);border-radius:14px">
      <div class="crumb">Desktop capture</div>
      <div style="font-size:20px;font-weight:700;margin-top:8px">1440 × 900 viewport · captured at 2×</div>
      <div style="font-size:15.5px;color:var(--mute);line-height:1.55;margin-top:8px">Full-page: the viewport is grown to the page height before shooting so the fixed rail and floating chrome appear exactly as a customer would see them at that height. Dialogs, dropdowns and takeovers are shot at the natural 1440 × 900 viewport.</div>
    </div>
    <div style="flex:1;padding:26px 30px;border:1px solid var(--line);border-radius:14px">
      <div class="crumb">Mobile capture</div>
      <div style="font-size:20px;font-weight:700;margin-top:8px">iPhone 15 · 393 × 852 viewport · captured at 2×</div>
      <div style="font-size:15.5px;color:var(--mute);line-height:1.55;margin-top:8px">Full-page scroll captures for page states (the burger and any sticky bars are shown once, at their resting position); bottom sheets and overlays are shot at the phone viewport. Rendered here at 1.25× for legibility.</div>
    </div>
    <div style="flex:1;padding:26px 30px;border:1px solid var(--line);border-radius:14px">
      <div class="crumb">Fixtures &amp; time</div>
      <div style="font-size:20px;font-weight:700;margin-top:8px">Dev preview harness, Asia/Dubai clock</div>
      <div style="font-size:15.5px;color:var(--mute);line-height:1.55;margin-top:8px">No accounts were created and no production data was used: each state renders from dev-only fixture props (<code>?preview=1</code>). Time-of-day states use a faked browser clock (Dubai time); dates in fixtures are relative to the capture day. Reduced-motion was enabled so animations rest at their final frame.</div>
    </div>
  </div>
  <div class="note" style="max-width:1700px"><b>Reading the pages.</b> The preview customer is always “Saad Hazari”, YUGO, ID YUG6750, on a Monthly Premium plan unless the page says otherwise. Copy such as dish names and countdowns depends on the capture day and hour. Pages in section 14 show the loading skeletons and error boundaries; the appendix lists everything that looked wrong or inconsistent while the atlas was assembled.</div>
  ${foot(n)}`)
}

function tocHtml(n, index) {
  const lines = tocLines.slice(index * TOC_LINES_PER_PAGE, (index + 1) * TOC_LINES_PER_PAGE)
  const half = Math.ceil(lines.length / 2)
  const col = (ls) => `<div style="flex:1;min-width:0">${ls.map(l => {
    const pg = pageOf[l.ref] ?? ''
    const style = l.level === 0 ? 'font-weight:800;font-size:17px;margin-top:16px;color:var(--nv)' : l.level === 1 ? 'font-weight:700;font-size:14.5px;margin-top:8px;color:var(--og);padding-left:14px' : 'font-size:13.5px;padding-left:32px;color:#2a2a2a'
    return `<div style="display:flex;align-items:baseline;gap:8px;${style};line-height:1.45"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.text)}</span><span style="flex:0 0 auto;border-bottom:1px dotted var(--line);flex-basis:20px;flex-grow:1;max-width:120px;height:.7em"></span><span style="flex:0 0 auto;font-variant-numeric:tabular-nums;color:var(--mute)">${pg}</span></div>`
  }).join('')}</div>`
  return wrap(`<div class="crumb">Contents${tocPageCount > 1 ? ` · ${index + 1} of ${tocPageCount}` : ''}</div><h1 class="t">${index === 0 ? 'Table of contents' : 'Table of contents (continued)'}</h1>
  <div style="display:flex;gap:56px;margin-top:10px">${col(lines.slice(0, half))}${col(lines.slice(half))}</div>${foot(n)}`, 1300)
}

function sectionHtml(n, s) {
  const count = s.subs.reduce((a, x) => a + x.entries.length, 0)
  return wrap(`
  <div style="min-height:1000px;margin:-${MARGIN}px;padding:120px 140px;background:var(--beige);display:flex;flex-direction:column;justify-content:center">
    <div class="crumb">Section</div>
    <div style="font-size:84px;font-weight:800;letter-spacing:-.03em;color:var(--nv);line-height:1.05;margin-top:16px">${esc(s.title)}<span style="color:var(--og)">.</span></div>
    <div style="font-size:22px;color:var(--mute);margin-top:22px">${count} state${count === 1 ? '' : 's'}</div>
    <div style="margin-top:44px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 48px;max-width:1500px">
      ${s.subs.map(sub => `<div style="font-size:18px;line-height:1.5"><span style="font-weight:800;color:var(--og)">${esc(sub.title || '')}</span>${sub.title ? '<br>' : ''}<span style="color:#2a2a2a">${sub.entries.map(e => esc(e.title)).join(' · ')}</span></div>`).join('')}
    </div>
  </div>${foot(n, s.title)}`, 1000)
}

async function stateHtml(n, p) {
  const e = p.entry
  const vps = e.viewports ?? ['mobile', 'desktop']
  const img = async (vp) => {
    if (!vps.includes(vp)) return { html: `<div class="missing" style="width:${vp === 'desktop' ? DESK_W : MOB_W}px">Not applicable on ${vp}<br><span style="font-size:13px">this state only exists on the ${vp === 'desktop' ? 'mobile' : 'desktop'} tree</span></div>`, h: 300 }
    const m = meta(e.id, vp)
    const file = await jpgFor(e.id, vp)
    if (!m || !file) return { html: `<div class="missing" style="width:${vp === 'desktop' ? DESK_W : MOB_W}px">Capture unavailable</div>`, h: 300 }
    const cssW = vp === 'desktop' ? DESK_W : MOB_W
    let cssH = Math.round(m.height * (cssW / m.width))
    let w = cssW
    if (cssH > MAX_IMG_H) { const k = MAX_IMG_H / cssH; cssH = MAX_IMG_H; w = Math.round(cssW * k) }
    const cap = vp === 'desktop' ? `Desktop · ${m.width} × ${m.height}` : `Mobile · ${m.width} × ${m.height}`
    return { html: `<div class="shot"><div class="cap"><span>${cap}</span><span>${m.dpr}×</span></div><img src="${pathToFileURL(file).href}" width="${w}" height="${cssH}"></div>`, h: cssH + 30 }
  }
  const d = await img('desktop'), mo = await img('mobile')
  const kindBadge = e.kind && e.kind !== 'page' ? `<span class="badge">${esc(e.kind)}</span>` : ''
  const body = `
  <div class="crumb">${esc(p.section.title)}<span class="sep">›</span>${esc(p.sub.title || '')}</div>
  <h1 class="t">${esc(e.title)}${kindBadge}</h1>
  <div class="desc">${esc(e.description)}</div>
  <div class="meta"><span><b>When:</b> ${esc(e.conditions)}</span><span><b>Preview:</b> <code>${esc(e.url)}</code></span>${e.actions?.length ? `<span><b>Then:</b> ${esc(e.actions.filter(a => !['wait', 'eval', 'blur', 'mouseMove'].includes(a.type)).map(a => a.type === 'clockForward' ? `jump clock +${Math.round(a.ms / 60000)} min` : `${a.type} ${a.text ?? a.selector ?? a.key ?? ''}`.trim()).join(' → '))}</span>` : ''}${e.clock ? `<span><b>Clock:</b> ${esc(e.clock)}</span>` : ''}</div>
  <div class="shots">${d.html}${mo.html}</div>
  ${foot(n, p.section.title)}`
  return wrap(body, 500 + Math.max(d.h, mo.h))
}

function appendixHtml(n) {
  const groups = {}
  for (const o of observations) (groups[o.area ?? 'General'] ??= []).push(o)
  const sev = s => s === 'bug' ? 'background:#fde8e6;color:#8f2a24' : s === 'inconsistency' ? 'background:#fff1e0;color:#8c4214' : 'background:var(--beige);color:var(--nv)'
  const verTag = v => v === 'code' ? '<span class="badge" style="background:#e6f4ea;color:#1d6b30">verified in code</span>' : v === 'screenshot' ? '<span class="badge" style="background:#e8f0fb;color:#1d4f8f">seen in capture</span>' : '<span class="badge" style="background:#f3f3f3;color:#555">reviewer-reported · not independently verified</span>'
  return wrap(`<div class="crumb">Appendix</div><h1 class="t">Observations &amp; open questions</h1>
  <div class="desc">Everything that looked broken, inconsistent between the two trees, or unreachable while this atlas was assembled. Each item names the surface, what was seen, and where in the code it comes from. Severity: <span class="badge" style="${sev('bug')}">bug</span> something a customer would experience as wrong · <span class="badge" style="${sev('inconsistency')}">inconsistency</span> the two trees or two surfaces disagree · <span class="badge" style="${sev('note')}">note</span> worth a decision, not urgent. Each item also says how it was established: <span class="badge" style="background:#e6f4ea;color:#1d6b30">verified in code</span> traced to the source line · <span class="badge" style="background:#e8f0fb;color:#1d4f8f">seen in capture</span> confirmed on the screenshot · <span class="badge" style="background:#f3f3f3;color:#555">reviewer-reported</span> raised by the automated screenshot review and plausible from the code, but not independently confirmed.</div>
  ${Object.entries(groups).map(([area, os]) => `<div style="margin-top:34px"><div class="crumb">${esc(area)}</div>${os.map(o => `<div style="margin-top:14px;padding:16px 20px;border:1px solid var(--line);border-radius:12px;max-width:1900px"><div style="display:flex;align-items:center;gap:12px"><span class="badge" style="margin:0;${sev(o.severity)}">${esc(o.severity)}</span><b style="font-size:17px;color:var(--nv)">${esc(o.title)}</b>${verTag(o.verified)}${o.page && pageOf[o.page] ? `<span style="margin-left:auto;font-size:13px;color:var(--mute)">see page ${pageOf[o.page]}</span>` : ''}</div><div style="font-size:15px;line-height:1.55;margin-top:8px;color:#2a2a2a">${esc(o.detail)}</div>${o.where ? `<div style="font-size:13px;color:var(--mute);margin-top:6px;font-family:Menlo,monospace">${esc(o.where)}</div>` : ''}</div>`).join('')}</div>`).join('')}
  ${foot(n)}`)
}

// ── Render ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const ctx = await browser.newContext({ viewport: { width: PAGE_W, height: 1200 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const pdfFiles = []
let html = ''
for (let i = 0; i < pages.length; i++) {
  const p = pages[i], n = i + 1
  html = p.kind === 'cover' ? coverHtml() : p.kind === 'guide' ? guideHtml(n) : p.kind === 'toc' ? tocHtml(n, p.index) : p.kind === 'section' ? sectionHtml(n, p.section) : p.kind === 'state' ? await stateHtml(n, p) : appendixHtml(n)
  const f = join(PAGES, `${String(n).padStart(3, '0')}.html`)
  const outPdf = join(PDFS, `${String(n).padStart(3, '0')}.pdf`)
  if (REUSE && p.kind !== 'appendix' && existsSync(outPdf)) { pdfFiles.push(outPdf); continue }
  writeFileSync(f, html)
  await page.goto(pathToFileURL(f).href, { waitUntil: 'networkidle' })
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })
  const h = await page.evaluate(() => Math.ceil(document.querySelector('.page').getBoundingClientRect().height))
  const out = join(PDFS, `${String(n).padStart(3, '0')}.pdf`)
  await page.pdf({ path: out, width: `${PAGE_W}px`, height: `${h + 2}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, pageRanges: '1' })
  pdfFiles.push(out)
  if (n % 25 === 0 || n === pages.length) console.log(`rendered ${n}/${pages.length}`)
}
await browser.close()

// ── Merge ────────────────────────────────────────────────────────────────────
const merged = await PDFDocument.create()
merged.setTitle('Dormers — Customer Dashboard Screen & State Atlas')
merged.setAuthor('Dormers')
merged.setCreationDate(new Date())
for (const f of pdfFiles) {
  const doc = await PDFDocument.load(readFileSync(f))
  const [pg] = await merged.copyPages(doc, [0])
  merged.addPage(pg)
}
writeFileSync(OUT, await merged.save())
const mb = (statSync(OUT).size / 1048576).toFixed(1)
console.log(`✓ ${OUT} — ${pages.length} pages, ${mb} MB`)

// ── Standalone HTML index (bonus) ───────────────────────────────────────────
const idx = `<!doctype html><html><head><meta charset="utf-8"><title>Dormers Dashboard Atlas</title><style>${CSS} body{width:auto;max-width:2100px;margin:0 auto} .page{width:auto} img{max-width:100%;height:auto} .shots{flex-wrap:wrap}</style></head><body>
${sections.map(s => `<div class="page"><h1 class="t" id="${esc(s.title)}">${esc(s.title)}</h1>${s.subs.map(sub => `<h2 style="color:var(--og)">${esc(sub.title)}</h2>${sub.entries.map(e => `<div style="margin:30px 0 60px"><div class="crumb">${esc(e.kind)}</div><h3 style="font-size:26px;margin:6px 0">${esc(e.title)}</h3><div class="desc">${esc(e.description)}</div><div class="meta"><span><b>When:</b> ${esc(e.conditions)}</span><span><code>${esc(e.url)}</code></span></div><div class="shots">${['desktop', 'mobile'].map(vp => existsSync(join(JPG, `${e.id}--${vp}.jpg`)) ? `<div class="shot"><div class="cap">${vp}</div><img src="jpg-${JPG_TAG}/${e.id}--${vp}.jpg" style="width:${vp === 'desktop' ? 1440 : MOB_W}px"></div>` : '').join('')}</div></div>`).join('')}`).join('')}</div>`).join('')}
</body></html>`
writeFileSync(join(ROOT, 'atlas.html'), idx)
