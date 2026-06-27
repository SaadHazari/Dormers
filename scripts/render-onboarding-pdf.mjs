// Renders docs/onboarding/onboarding-flow.html → a print-quality A4 PDF, and
// emits a self-contained single-file HTML (fonts + logo inlined as base64).
//
// Uses the already-installed puppeteer-core (no new deps). It needs a Chromium/
// Chrome binary; the resolver below checks env, a system Chrome, and the
// @puppeteer/browsers cache (~/.cache/puppeteer). If none is found it prints the
// one-line install command and exits.
//
//   node scripts/render-onboarding-pdf.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOC_DIR = join(ROOT, 'docs', 'onboarding');
const SRC_HTML = join(DOC_DIR, 'onboarding-flow.html');
const STANDALONE_HTML = join(DOC_DIR, 'onboarding-flow.standalone.html');
const OUT_PDF = join(DOC_DIR, 'Dormers-Onboarding-Flow.pdf');

// ── Locate a Chrome/Chromium executable ──────────────────────────────────────
function findUnder(dir, names, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return null;
  let entries;
  try { entries = readdirSync(dir); } catch { return null; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      const hit = findUnder(full, names, depth + 1);
      if (hit) return hit;
    } else if (names.includes(name)) {
      return full;
    }
  }
  return null;
}

function resolveChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;

  // @puppeteer/browsers cache (chrome / chrome-headless-shell / chromium)
  const cache = join(homedir(), '.cache', 'puppeteer');
  return findUnder(cache, [
    'Google Chrome for Testing',
    'chrome',
    'chrome-headless-shell',
    'Chromium',
    'chromium',
  ]);
}

// ── Build the self-contained HTML (inline fonts + logo as base64) ────────────
function mime(file) {
  if (file.endsWith('.woff2')) return 'font/woff2';
  if (file.endsWith('.ttf')) return 'font/ttf';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
function asDataUri(relPath) {
  const abs = join(DOC_DIR, relPath);
  const buf = readFileSync(abs);
  return `data:${mime(relPath)};base64,${buf.toString('base64')}`;
}
function buildStandalone(html) {
  // @font-face url('assets/Foo.ttf') / url("assets/Foo.woff2") / url(assets/Foo)
  let out = html.replace(/url\((['"]?)(assets\/[^)'"]+)\1\)/g, (_m, _q, p) => `url('${asDataUri(p)}')`);
  // <img src="assets/logo-dark.svg">
  out = out.replace(/src="(assets\/[^"]+)"/g, (_m, p) => `src="${asDataUri(p)}"`);
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const exe = resolveChrome();
if (!exe) {
  console.error('✗ No Chrome/Chromium found for puppeteer-core.\n' +
    '  Install once with:  npx @puppeteer/browsers install chrome@stable\n' +
    '  (or set PUPPETEER_EXECUTABLE_PATH to a Chrome binary).');
  process.exit(1);
}
console.log('• Chrome:', exe);

const srcHtml = readFileSync(SRC_HTML, 'utf8');
writeFileSync(STANDALONE_HTML, buildStandalone(srcHtml));
console.log('• Wrote self-contained HTML:', STANDALONE_HTML);

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage();
  // Load the source file so ./assets resolve from disk (fonts embed into the PDF).
  await page.goto(pathToFileURL(SRC_HTML).href, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.pdf({
    path: OUT_PDF,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  console.log('✓ Wrote PDF:', OUT_PDF);
} finally {
  await browser.close();
}
