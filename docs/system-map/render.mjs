// render.mjs — render dormers-system-map.html to a PDF, optionally
// capturing per-section screenshots for visual review.
//
//   node render.mjs                # produces dormers-system-map.pdf
//   node render.mjs --screenshots  # ALSO writes _screenshots/<id>.png per section
//
// Uses puppeteer-core + the system Chrome at the macOS default install path,
// so no Chromium download is needed.

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH    = path.join(__dirname, 'dormers-system-map.html');
const PDF_PATH     = path.join(__dirname, 'dormers-system-map.pdf');
const SHOTS_DIR    = path.join(__dirname, '_screenshots');
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const wantScreenshots = process.argv.includes('--screenshots');

function findChrome() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    'No Chrome/Chromium/Edge install found. Install Google Chrome from https://google.com/chrome.',
  );
}

(async () => {
  if (!fs.existsSync(HTML_PATH)) throw new Error(`Missing ${HTML_PATH}`);
  if (wantScreenshots) {
    fs.rmSync(SHOTS_DIR, { recursive: true, force: true });
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    // Force a narrow desktop width so layout matches print width (A4 portrait
    // ≈ 794px at 96 dpi, but we render slightly wider for headroom).
    await page.setViewport({ width: 880, height: 1240, deviceScaleFactor: 2 });
    await page.goto('file://' + HTML_PATH, { waitUntil: 'networkidle0' });

    // Wait for Mermaid to finish rendering all diagrams. The HTML sets
    // window.__mermaidReady = true once Mermaid signals all diagrams done.
    await page.waitForFunction('window.__mermaidReady === true', { timeout: 30000 });

    // Per-section screenshots for the inspection loop.
    if (wantScreenshots) {
      const sections = await page.$$eval('section[id]', els =>
        els.map(el => ({
          id: el.id,
          title: el.querySelector('h2')?.textContent?.trim() ?? el.id,
        })),
      );
      console.log(`→ capturing ${sections.length} section screenshots`);
      for (const { id, title } of sections) {
        const handle = await page.$(`#${id}`);
        if (!handle) continue;
        await handle.screenshot({
          path: path.join(SHOTS_DIR, `${id}.png`),
          captureBeyondViewport: true,
        });
        console.log(`  ✓ ${id} — ${title}`);
      }
    }

    // Final: render the full document to a PDF.
    await page.pdf({
      path: PDF_PATH,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    const sizeKb = (fs.statSync(PDF_PATH).size / 1024).toFixed(1);
    console.log(`✓ ${path.basename(PDF_PATH)} — ${sizeKb} KB`);
  } finally {
    await browser.close();
  }
})();
