/**
 * Chromium for the rendered checks (scripts/check-season-planner.mjs and
 * scripts/check-season-customer.mjs), so both agree on where a browser lives.
 * Any real Chrome will do: installed, puppeteer's cache, or Playwright's. It is
 * driven by the playwright bundled with the global @playwright/cli unless
 * PLAYWRIGHT_MODULE points at another copy.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)

function findUnder(root, names) {
  if (!existsSync(root)) return null
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (names.includes(e.name)) return p
    }
  }
  return null
}

/** Any real Chrome will do: installed, puppeteer's cache, or Playwright's. */
function resolveChrome() {
  const direct = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean)
  for (const c of direct) if (existsSync(c)) return c
  return findUnder(join(homedir(), '.cache', 'puppeteer'),
      ['Google Chrome for Testing', 'chrome', 'chrome-headless-shell', 'Chromium', 'chromium'])
    ?? findUnder(join(homedir(), 'Library', 'Caches', 'ms-playwright'),
      ['chrome-headless-shell', 'Chromium'])
}

/** Launches Playwright's Chromium driver against whatever Chrome resolveChrome() finds; exits when there is none. */
export async function launchChromium() {
  const executablePath = resolveChrome()
  if (!executablePath) {
    console.error('✗ No Chrome/Chromium found for playwright.\n' +
      '  Install once with:  npx @puppeteer/browsers install chrome@stable\n' +
      '  (or set PUPPETEER_EXECUTABLE_PATH/CHROME_PATH to a Chrome binary).')
    process.exit(1)
  }
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE ?? execSync('npm root -g').toString().trim() + '/@playwright/cli/node_modules/playwright',
  )
  return chromium.launch({ headless: true, executablePath })
}
