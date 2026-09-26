// Renders each Part (src/partNN-*.html) to its own PDF with Chromium,
// then merge.py stitches them into one bookmarked volume.
//   node build.mjs && python3 merge.py
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const srcDir = resolve('src');
const outDir = resolve('pdf');
const parts = readdirSync(srcDir).filter(f => /^part\d\d-.*\.html$/.test(f)).sort();

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const page = await browser.newPage();

for (const file of parts) {
  await page.goto('file://' + resolve(srcDir, file), { waitUntil: 'load' });
  const label = await page.evaluate(() => document.body.dataset.footer || document.title);
  const out = resolve(outDir, basename(file, '.html') + '.pdf');
  await page.pdf({
    path: out,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font-family:DejaVu Sans,Arial;font-size:7.5px;color:#7b8794;padding:0 17mm;display:flex;justify-content:space-between;">
      <span>Rail Animator · Track It Framework — Concept Guide</span>
      <span>${label} · page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '18mm', bottom: '20mm', left: '17mm', right: '17mm' },
  });
  console.log('rendered', out);
}
await browser.close();
