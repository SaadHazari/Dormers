// Screenshot capture for the dashboard booklet.
//   node capture.mjs <manifest.json> [--only=id1,id2] [--vp=mobile|desktop] [--base=http://localhost:3000]
// Manifest entries: { id, url, kind, viewports?, actions?, clock?, storage?, fullPage?, settleMs?, waitForText? }
// Output: ../shots/<id>--<viewport>.png (+ meta json with dimensions)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE ?? require('node:child_process').execSync('npm root -g').toString().trim() + '/@playwright/cli/node_modules/playwright')

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = join(process.env.ATLAS_OUT ?? join(__dirname, 'atlas-out'), 'shots')
mkdirSync(SHOTS, { recursive: true })

const args = process.argv.slice(2)
const manifestPath = args.find(a => !a.startsWith('--'))
const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d }
const BASE = opt('base', 'http://localhost:3000')
const ONLY = opt('only', '') ? opt('only', '').split(',') : null
const VP_FILTER = opt('vp', '')
const FORCE = args.includes('--force')

const VIEWPORTS = {
  mobile: { ...devices['iPhone 15'], viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(opt('ddpr', '2')), isMobile: false, hasTouch: false },
}
const MAX_DESKTOP_H = 6000
const MAX_MOBILE_H = 12000

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const SECTIONS = opt('sections', '') ? opt('sections').split(',') : null   // section number prefixes, e.g. 5,6,7
let entries = manifest.filter(e => (!ONLY || ONLY.includes(e.id)) && (!SECTIONS || SECTIONS.includes(String(e.section).split(' ')[0])))
if (args.includes('--reverse')) entries = entries.slice().reverse()

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const results = []
const failures = []

for (const entry of entries) {
  const vps = (entry.viewports ?? ['mobile', 'desktop']).filter(v => !VP_FILTER || v === VP_FILTER)
  for (const vp of vps) {
    const outPng = join(SHOTS, `${entry.id}--${vp}.png`)
    const outMeta = join(SHOTS, `${entry.id}--${vp}.json`)
    if (!FORCE && existsSync(outPng) && existsSync(outMeta)) {
      const m = JSON.parse(readFileSync(outMeta, 'utf8'))
      if (m.manifestHash === hash(entry)) { results.push(m); continue }
    }
    let attempt = 0, ok = false, lastErr = null
    while (attempt < 3 && !ok) {
      attempt++
      const context = await browser.newContext({ ...VIEWPORTS[vp], reducedMotion: 'reduce', locale: 'en-AE', timezoneId: 'Asia/Dubai', colorScheme: 'light' })
      const page = await context.newPage()
      const consoleErrors = []
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`[${m.type()}] ${m.text().slice(0, 1500)}`) })
      page.on('pageerror', e => consoleErrors.push(`[pageerror] ${String(e.message).slice(0, 400)}`))
      try {
        // Storage seeds run before any page script.
        if (entry.storage) {
          await context.addInitScript((s) => {
            try { for (const [k, v] of Object.entries(s.local ?? {})) localStorage.setItem(k, v) } catch {}
            try { for (const [k, v] of Object.entries(s.session ?? {})) sessionStorage.setItem(k, v) } catch {}
          }, entry.storage)
        }
        if (entry.initScript) await context.addInitScript(entry.initScript)   // e.g. neutralise an auto-dismiss timer
        if (entry.clock) {
          // Fake the browser clock (Date/timers); server keeps real time.
          //   'now'         → installed at the real time, flowing (lets clockForward actions jump ahead)
          //   'freeze'      → paused at the real time (timers never fire)
          //   ISO string    → installed at that instant, flowing unless entry.clockPause
          const t = entry.clock === 'now' || entry.clock === 'freeze' ? new Date() : new Date(entry.clock)
          await page.clock.install({ time: t })
          if (entry.clock === 'freeze' || entry.clockPause) await page.clock.pauseAt(t)
        }
        for (const m of (entry.mocks ?? [])) {
          await page.route(m.url, async (route) => {
            if (m.hang) return new Promise(() => {})   // never answers → pending/typing look
            if (m.delayMs) await new Promise(r => setTimeout(r, m.delayMs))
            await route.fulfill({ status: m.status ?? 200, headers: m.headers ?? {}, contentType: m.contentType ?? 'application/json', body: m.body ?? '' })
          })
        }
        const url = entry.url.startsWith('http') ? entry.url : BASE + entry.url
        // With a faked clock installed, 'networkidle' never settles (timer-driven polling keeps the
        // network busy), so those entries wait for 'load' + a longer settle instead.
        await page.goto(url, { waitUntil: entry.clock ? 'load' : 'networkidle', timeout: 120_000 }).catch(async () => {
          await page.waitForLoadState('domcontentloaded')
        })
        if (entry.clock) await page.waitForTimeout(1500)
        if (entry.waitForText) {
          await page.waitForFunction((t) => new RegExp(t).test(document.body?.innerText ?? ''), entry.waitForText, { timeout: 30_000 })
        }
        await page.waitForTimeout(entry.settleMs ?? 1600)
        for (const a of (entry.actions ?? [])) {
          if (a.vp && a.vp !== vp) continue
          await runAction(page, a)
        }
        await page.waitForTimeout(entry.afterActionsMs ?? 900)
        // Belt and braces: hide the text caret and kill any residual CSS animations.
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important} *{caret-color:transparent!important} *,*::before,*::after{animation-play-state:paused!important}' })

        const fullPage = entry.fullPage ?? !['modal', 'sheet', 'overlay', 'dropdown', 'takeover', 'toast', 'flow-step'].includes(entry.kind)
        let dims
        if (fullPage && vp === 'desktop') {
          // Full-page capture WITHOUT resizing the viewport (a 1440-wide viewport taller than 1440
          // becomes 'portrait' and the app switches to its mobile tree). The fixed rail is turned
          // into an absolutely positioned one for the shot so it spans the whole document, which is
          // exactly what a customer sees at every scroll position.
          await page.addStyleTag({ content: '.dash-page{position:relative!important} aside.dash-sidebar{position:absolute!important;top:16px!important;bottom:16px!important;height:auto!important}' })
          await page.waitForTimeout(150)
          const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
          await page.screenshot({ path: outPng, fullPage: true, animations: 'disabled' })
          dims = { width: 1440, height: Math.min(Math.ceil(h), MAX_DESKTOP_H) }
        } else if (fullPage) {
          const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))
          await page.screenshot({ path: outPng, fullPage: true, animations: 'disabled' })
          dims = { width: VIEWPORTS[vp].viewport.width, height: Math.min(Math.ceil(h), MAX_MOBILE_H) }
        } else {
          await page.screenshot({ path: outPng, fullPage: false, animations: 'disabled' })
          dims = { ...VIEWPORTS[vp].viewport }
        }
        const meta = { id: entry.id, vp, file: `${entry.id}--${vp}.png`, url, ...dims, dpr: VIEWPORTS[vp].deviceScaleFactor, manifestHash: hash(entry), capturedAt: new Date().toISOString(), consoleErrors }
        writeFileSync(outMeta, JSON.stringify(meta))
        results.push(meta)
        ok = true
        console.log(`✓ ${entry.id} [${vp}] ${dims.width}x${dims.height}`)
      } catch (err) {
        lastErr = err
        console.log(`  retry ${attempt} ${entry.id} [${vp}]: ${String(err.message).split('\n')[0]}`)
        await page.waitForTimeout(1500).catch(() => {})
      } finally {
        await context.close()
      }
    }
    if (!ok) { failures.push({ id: entry.id, vp, error: String(lastErr?.message) }); console.log(`✗ ${entry.id} [${vp}] — ${String(lastErr?.message).split('\n')[0]}`) }
  }
}

await browser.close()
writeFileSync(join(SHOTS, '_capture-report.json'), JSON.stringify({ results, failures }, null, 1))
console.log(`\n${results.length} captured, ${failures.length} failed`)
if (failures.length) process.exitCode = 1

async function runAction(page, a) {
  switch (a.type) {
    case 'click': {
      const loc = locatorFor(page, a)
      if (a.js) { await loc.first().evaluate(el => el.click()); break }   // bypass pointer/stability checks (animating chrome)
      await loc.first().click({ timeout: a.timeout ?? 9_000, force: a.force ?? false })
      break
    }
    case 'clickAll': {
      const loc = locatorFor(page, a)
      const n = await loc.count()
      for (let i = 0; i < n; i++) await loc.nth(i).click({ timeout: 15_000 }).catch(() => {})
      break
    }
    case 'hover': {
      const loc = locatorFor(page, a)
      await loc.first().hover({ timeout: 15_000 })
      break
    }
    case 'fill': {
      const loc = locatorFor(page, a)
      await loc.first().fill(a.value, { timeout: 15_000 })
      break
    }
    case 'type': {
      await page.keyboard.type(a.value, { delay: 10 })
      break
    }
    case 'press': await page.keyboard.press(a.key); break
    case 'wait': await page.waitForTimeout(a.ms ?? 500); break
    case 'waitFor': await page.waitForFunction((t) => new RegExp(t).test(document.body?.innerText ?? ''), a.text, { timeout: 30_000 }); break
    case 'eval': await page.evaluate(a.js); break
    case 'scroll': await page.evaluate((y) => window.scrollTo(0, y), a.y ?? 0); break
    case 'scrollIntoView': { const loc = locatorFor(page, a); await loc.first().scrollIntoViewIfNeeded(); break }
    case 'setViewport': await page.setViewportSize(a.size); break
    case 'clockForward': await page.clock.fastForward(a.ms); break
    case 'clockRun': await page.clock.runFor(a.ms); break
    case 'blur': await page.evaluate(() => { const el = document.activeElement; if (el && 'blur' in el) el.blur() }); break
    case 'mouseMove': await page.mouse.move(a.x ?? 0, a.y ?? 0); break
    default: throw new Error(`unknown action ${a.type}`)
  }
  if (a.settleMs) await page.waitForTimeout(a.settleMs)
}

function locatorFor(page, a) {
  let loc
  if (a.selector) {
    // Both breakpoint trees are mounted; an nth= index must count VISIBLE matches only.
    const sel = a.visible !== false && a.selector.includes('>> nth=') ? a.selector.replace('>> nth=', '>> visible=true >> nth=') : a.selector
    loc = page.locator(sel)
  }
  else if (a.role) loc = page.getByRole(a.role, { name: a.name ? new RegExp(a.name, 'i') : undefined, exact: false })
  else if (a.text) loc = textLocator(page, a.text)
  else throw new Error('action needs selector|role|text')
  // Only visible elements — both breakpoint trees are mounted; the hidden one must not be targeted.
  if (a.visible !== false) loc = loc.locator('visible=true')
  if (a.within) loc = page.locator(a.within).locator(loc)
  return loc
}

// Text matching that survives icon+text buttons (a leading-space text node defeats regex getByText):
// anchored patterns → exact :text-is(); alternations → comma-joined; substrings → the text= engine.
function textLocator(page, pattern) {
  const alts = pattern.split('|').map(p => p.trim()).filter(Boolean)
  const anchored = alts.every(p => p.startsWith('^') && p.endsWith('$'))
  if (anchored) return page.locator(alts.map(p => `:text-is("${p.slice(1, -1).replace(/\\/g, '')}")`).join(', '))
  return page.locator(`text=/${pattern}/i`)
}

function hash(o) {
  const s = JSON.stringify({ ...o, description: undefined, title: undefined, section: undefined, notes: undefined })
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return String(h)
}
