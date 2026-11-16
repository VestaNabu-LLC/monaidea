// Prints the Ledgerstone guide page to its PDF: A4, page numbers, the site's
// own fonts. Needs Playwright with Chromium (Claude's cloud sessions have it).
//
//   node ../monaidea/brand/stamp.mjs . _site
//   node tools/guide-pdf.mjs _site pages/ledgerstone/guide/Ledgerstone-Guide.pdf
//
// Run it from the repository's root (it reads site.json for the site's
// address). Then build again, so the site carries the new PDF. The script
// refuses to print when a picture is missing (the PDF of 2026-10-16 lacked
// three of its five), and it gives every link inside the site its public
// address (the PDFs before 2026-11-15 linked to the computer that printed them).
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const [site, out] = process.argv.slice(2);
if (!site || !out) {
  console.error('usage: node tools/guide-pdf.mjs <built site folder> <PDF to write>');
  process.exit(2);
}
const PAGE = '/ledgerstone/guide/';
const BASE = JSON.parse(readFileSync('site.json', 'utf8')).base;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let file = join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0, '127.0.0.1');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  await page.goto(`http://127.0.0.1:${server.address().port}${PAGE}`, { waitUntil: 'networkidle' });
  // The pictures are loading="lazy": load every one before printing.
  await page.evaluate(async () => {
    document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
    window.scrollTo(0, document.body.scrollHeight);
    await Promise.all([...document.images].map((i) => (i.complete && i.naturalWidth) ? null
      : new Promise((done) => { i.addEventListener('load', done); i.addEventListener('error', done); })));
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });
  const missing = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
  if (missing.length) throw new Error('pictures not loaded: ' + missing.join(', '));
  // A link inside the site would point at this computer: give it its public address.
  await page.evaluate((base) => document.querySelectorAll('a[href^="/"]').forEach((a) => a.setAttribute('href', base + a.getAttribute('href'))), BASE);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: out, format: 'A4', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font:8px Inter,sans-serif;color:#6b7280;width:100%;padding:0 14mm;display:flex;justify-content:space-between"><span>Ledgerstone guide · atlapps.monaidea.com${PAGE}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
  console.log(`${out}: written, ${await page.evaluate(() => document.images.length)} pictures`);
} finally {
  await browser.close();
  server.close();
}
