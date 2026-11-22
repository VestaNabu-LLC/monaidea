#!/usr/bin/env node
// The stamper: writes a site's finished pages from pages that hold content only.
//
//   node brand/stamp.mjs <site folder>            writes the site
//   node brand/stamp.mjs <site folder> --check    writes nothing; fails when the
//                                                 files there are not what it would write
//
// GitHub Pages serves a site's repository as it is, so the finished pages are
// committed: run the stamper before every commit that touches pages/, site.json
// or the brand, and commit what it wrote. The check runs on every push.
//
// A site's folder:
//
//   site.json        its address and settings (below)
//   pages/           one .html file per page, content only (below); nothing else
//   everything else  published as it is, at its own path: pictures, videos, PDFs,
//                    CNAME. The stamper writes the finished pages here too, each
//                    at its page's path, with style.css, site.js, contact.js,
//                    fonts/, sitemap.xml, robots.txt and _config.yml.
//
// A page under pages/ is written like this and no other way:
//
//   <title>What the page is</title>
//   <meta name="description" content="One or two sentences.">
//   <main>
//     …the content, using the classes of brand/css/site.css…
//   </main>
//
// Before <main> a page may also have <meta name="robots" …>, og:type, og:title,
// og:description and og:image ("/…", a picture of the site) lines, and one
// block of structured data (ld+json). The
// stamper adds everything else from this folder: the stylesheet, the fonts,
// the header and footer (brand/frame.txt), the scripts, the page's address
// and its icon. So every page of every Monaidea site looks and behaves the
// same, and a page cannot bring a look, a script or a frame of its own: no
// <script>, <style>, <link> or <iframe>, no style or on… attribute, no class
// the stylesheet does not know. Links are "#…", "/…" (checked: the page or
// file, and the id after a #, must exist), "https://…" or "mailto:…".
//
// When one page breaks a rule nothing is written, and every reason is printed.
// A finished page whose source is gone is removed.
//
// site.json: "base" (the site's address), "notes" (up to 2 more footer lines),
// "sections" (a product's own pages get a bar under the header: its name, its
// mark as SVG path data in a 32 by 32 box, and its pages), "private" (other
// top-level names GitHub Pages must not publish; pages/, brand/, site.json,
// README.md and CLAUDE.md never are), and "platform": true on the brand's own
// site, which also publishes the platform's files.
//
// Nothing in this file is about one site.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BRAND = dirname(fileURLToPath(import.meta.url));
const brandText = (name) => readFileSync(join(BRAND, name), 'utf8');

const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

export class Refused extends Error {}
const refuse = (why) => { throw new Refused(why); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------- the frame

// The same rules as the platform's own reader (pages.ReadFrame in
// standalone-harnessed): a frame that stamps here is one the platform accepts.
const LINK = /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?$/;
const words = (s, most) => [...s].length > 0 && [...s].length <= most && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]/u.test(s);
const MOST = { menu: 8, foot: 12, notes: 2, shops: 12, bytes: 4096 };

export function readFrame(text) {
  if (Buffer.byteLength(text) > MOST.bytes) refuse(`frame.txt: longer than ${MOST.bytes} bytes`);
  const frame = { brand: null, menu: [], foot: [], notes: [], shops: [] };
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (line.trim() === '') continue;
    const bad = (why) => refuse(`frame.txt: ${why}: ${line}`);
    if ([...line].length > 400 || /[<>"]/.test(line)) bad('too long, or it has < > or a double quote');
    const parts = line.split('|').map((part) => part.trim());
    const link = (name, url) => {
      if (!words(name, 40)) bad('a name is 1 to 40 characters');
      if (url.length > 300 || !LINK.test(url)) bad('a link is an https address');
      return { name, url };
    };
    if (parts.length === 2 && parts[0] === 'Note') {
      if (!words(parts[1], 200)) bad('a note is 1 to 200 characters');
      frame.notes.push(parts[1]);
    } else if (parts.length === 2) {
      frame.foot.push(link(parts[0], parts[1]));
    } else if (parts.length === 3 && ['Brand', 'Menu', 'Foot'].includes(parts[0])) {
      const l = link(parts[1], parts[2]);
      if (parts[0] === 'Brand') {
        if (frame.brand) bad('there is one Brand line');
        frame.brand = l;
      } else {
        frame[parts[0].toLowerCase()].push(l);
      }
    } else if (parts.length === 4 && parts[0] === 'Shop') {
      if (!words(parts[3], 160)) bad("a shop's text is 1 to 160 characters");
      frame.shops.push({ ...link(parts[1], parts[2]), text: parts[3] });
    } else {
      bad('not a Brand, Menu, Foot, Note or Shop line');
    }
  }
  for (const list of ['menu', 'foot', 'notes', 'shops']) {
    if (frame[list].length > MOST[list]) refuse(`frame.txt: more than ${MOST[list]} ${list} lines`);
  }
  if (!frame.brand) refuse('frame.txt: no Brand line');
  return frame;
}

// The header and the footer, in the platform's own markup (its templates in
// internal/pages/frame.go), so brand/css/chrome.css styles both alike.
const MARK = 'the brand';
function header(frame, home) {
  const item = (l) => `<a href="${esc(l.url)}"${l.url === home ? ' aria-current="true"' : ''}>${esc(l.name)}</a>`;
  return `<header data-of="${MARK}"><nav><a class="brand" href="${esc(frame.brand.url)}">${esc(frame.brand.name)}</a>${frame.menu.map(item).join('')}</nav></header>`;
}
function footer(frame, notes) {
  const links = frame.foot.map((l) => `<a href="${esc(l.url)}">${esc(l.name)}</a>`).join(' &middot; ');
  return `<footer data-of="${MARK}">${links}${[...frame.notes, ...notes].map((n) => `<p>${esc(n)}</p>`).join('')}</footer>`;
}

// ---------------------------------------------------------------- the stylesheets

const css = (...names) => names.map((name) => brandText(`css/${name}.css`).trim()).join('\n') + '\n';

// What a hand-built site serves at /style.css.
export const siteStyle = () => css('font', 'tokens', 'chrome', 'site');

// What the owner pastes into the platform (Products > How the sites look). The
// platform writes it into each page, and its database refuses a stylesheet
// that loads anything from another host (standalone-harnessed, migration
// 0043: a page gives nothing away about who reads it). So the display
// typeface travels inside the stylesheet, and the text and code typefaces,
// which would not fit in the 64 KB the platform takes, fall back to the
// reader's own.
const PLATFORM_FONTS = ['barlow-condensed-700.woff2'];
const PLATFORM_REFUSES = /<\/|<script|javascript:|expression\(|@import|url\s*\(\s*["']?\s*(https?:)?\/\//i;
export function platformStyle() {
  const faces = brandText('css/font.css').match(/@font-face\{[^}]*\}/g) ?? [];
  const inside = PLATFORM_FONTS.map((file) => {
    const face = faces.find((rule) => rule.includes(`url(/fonts/${file})`));
    if (!face) refuse(`brand/css/font.css: no @font-face for /fonts/${file}`);
    return face.replace(`url(/fonts/${file})`, `url(data:font/woff2;base64,${readFileSync(join(BRAND, 'fonts', file)).toString('base64')})`);
  });
  const rules = [...inside, css('tokens', 'chrome', 'platform')].join('\n').trim();
  // Its first line names its version, so whoever pastes it can see that it is
  // the new one and not a copy a browser kept.
  const text = `/* The Monaidea brand for the pages the platform publishes. Version ${hash(rules)}. Written by brand/stamp.mjs: change brand/css, not this. */\n${rules}`;
  if (Buffer.byteLength(text) > 65536 || PLATFORM_REFUSES.test(text)) {
    refuse('the platform stylesheet is not one the platform takes: at most 65536 bytes, nothing that runs, nothing loaded from another host');
  }
  return text;
}

// Every class a hand-built page may use.
function knownClasses() {
  const text = css('chrome', 'site').replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '');
  return new Set([...text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

// ---------------------------------------------------------------- one page

const TAG = /^<\/?([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/;
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const NOT_A_PAGES = ['script', 'style', 'link', 'meta', 'base', 'iframe', 'frame', 'object', 'embed', 'html', 'head', 'body', 'title'];
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;

// Reads one page's source and says what it is, or refuses it. `file` is its
// path under pages/, with forward slashes.
export function readPage(source, file, classes = knownClasses()) {
  const no = (why) => refuse(`${file}: ${why}`);
  const cut = source.match(/^([\s\S]*?)(<main(?:\s[^>]*)?>[\s\S]*<\/main>)\s*$/);
  if (!cut) no('a page is a title and a description, then <main>…</main>, and nothing after it');
  const main = cut[2];
  if (main.split(/<main[\s>]/).length !== 2 || main.split('</main>').length !== 2) no('a page has one <main>');

  const page = { file, main, title: '', description: '', robots: '', og: {}, data: '', ids: new Set(), links: [], form: false };
  let head = cut[1].trim();
  const take = (pattern) => {
    const m = head.match(pattern);
    if (m) head = head.slice(m[0].length).trim();
    return m;
  };
  while (head !== '') {
    let m;
    if ((m = take(/^<title>([^<]+)<\/title>/))) {
      if (page.title) no('two titles');
      page.title = m[1].trim();
    } else if ((m = take(/^<meta name="(description|robots)" content="([^"<>]+)">/))) {
      if (page[m[1]]) no(`two ${m[1]} lines`);
      page[m[1]] = m[2];
    } else if ((m = take(/^<meta property="og:(type|title|description|image)" content="([^"<>]+)">/))) {
      if (m[1] === 'image' && !/^\/(?!\/)/.test(m[2])) no('og:image is a picture of this site, written from the root: "/…"');
      if (m[1] === 'image') page.links.push(m[2]);
      page.og[m[1]] = m[2];
    } else if ((m = take(/^<script type="application\/ld\+json">([\s\S]*?)<\/script>/))) {
      try { JSON.parse(m[1]); } catch { no('the structured data is not valid JSON'); }
      if (page.data || m[1].includes('<')) no('one block of structured data, with no < in it');
      page.data = m[1].trim();
    } else {
      no(`before <main> a page has only a title, a description, og: lines and structured data; the stamper adds the rest. Found: ${head.slice(0, 80)}`);
    }
  }
  if (!page.title) no('no <title>');
  if (!page.description) no('no <meta name="description" content="…">');

  // Every tag in <main>: no code, no look of its own, no frame of its own.
  for (let at = main.indexOf('<'); at >= 0; at = main.indexOf('<', at + 1)) {
    const rest = main.slice(at);
    if (rest.startsWith('<!--')) {
      const end = rest.indexOf('-->');
      if (end < 0) no('a comment that never ends');
      at += end;
      continue;
    }
    if (!/^<\/?[a-zA-Z]/.test(rest)) no(`a "<" that starts no tag (write &lt;): ${rest.slice(0, 40)}`);
    const tag = rest.match(TAG);
    if (!tag) no(`a tag the stamper cannot read: ${rest.slice(0, 60)}`);
    const name = tag[1].toLowerCase();
    if (NOT_A_PAGES.includes(name)) no(`<${name}> is not a page's to write: the stamper brings the stylesheet, the scripts and the frame`);
    for (const [, rawKey, a, b, c] of tag[2].matchAll(ATTR)) {
      const key = rawKey.toLowerCase();
      const value = a ?? b ?? c ?? '';
      if (key === 'style' || key.startsWith('on') || key === 'data-of' || key === 'action' || key === 'formaction' || key === 'srcdoc' || key === 'srcset') {
        no(`the attribute ${key} is not a page's to write (in <${name}>)`);
      }
      if (key === 'id') page.ids.add(value);
      if (key === 'id' && value === 'contact-form') page.form = true;
      if (key === 'class') {
        for (const cls of value.split(/\s+/).filter(Boolean)) {
          if (!classes.has(cls)) no(`the class "${cls}" is not in the brand's stylesheet (brand/css/site.css)`);
        }
      }
      if (key === 'href' || key === 'src' || key === 'poster' || key === 'xlink:href') {
        const url = value.replace(/&amp;/g, '&');
        if (/^(#|\/(?!\/)|https:\/\/|mailto:)/.test(url)) page.links.push(url);
        else no(`a link is "#…", "/…", "https://…" or "mailto:…", not ${value}`);
      }
    }
    at += tag[0].length - 1;
  }
  return page;
}

// ---------------------------------------------------------------- the site

const walk = (dir, under = '') => readdirSync(join(dir, under), { withFileTypes: true }).flatMap((entry) => {
  const path = under ? `${under}/${entry.name}` : entry.name;
  return entry.isDirectory() ? walk(dir, path) : [path];
});
// The address of a page: its folder for index.html, else the file.
const pathOf = (file) => '/' + file.replace(/(^|\/)index\.html$/, '$1');
const isFile = (path) => existsSync(path) && statSync(path).isFile();
// Names the stamper writes itself, and names GitHub Pages never publishes.
const RESERVED = /^(style\.css|site\.js|contact\.js|sitemap\.xml|robots\.txt|_config\.yml|fonts\/|platform\/)/;
const PRIVATE = ['pages', 'brand', 'site.json', 'README.md', 'CLAUDE.md'];
const hidden = (name) => name.startsWith('.') || name.startsWith('_') || name === 'node_modules';

function readSite(siteDir) {
  let site;
  try { site = JSON.parse(readFileSync(join(siteDir, 'site.json'), 'utf8')); } catch (e) { refuse(`site.json: ${e.message}`); }
  if (!/^https:\/\/[a-z0-9.-]+$/.test(site.base ?? '')) refuse('site.json: "base" is the site\'s address, like https://www.example.com');
  site.notes ??= [];
  if (!Array.isArray(site.notes) || site.notes.length > 2 || !site.notes.every((n) => typeof n === 'string' && words(n, 200))) {
    refuse('site.json: "notes" is at most 2 lines of 1 to 200 characters');
  }
  site.private ??= [];
  if (!Array.isArray(site.private) || !site.private.every((name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))) {
    refuse('site.json: "private" is a list of top-level file or folder names');
  }
  site.private = [...PRIVATE, ...site.private];
  site.sections ??= {};
  for (const [key, s] of Object.entries(site.sections)) {
    const bad = (why) => refuse(`site.json: section "${key}": ${why}`);
    if (!/^[a-z0-9-]+$/.test(key)) bad('its key is the folder name');
    if (typeof s.name !== 'string' || !words(s.name, 40)) bad('"name" is 1 to 40 characters');
    if (!Array.isArray(s.mark) || !s.mark.length || !s.mark.every((d) => typeof d === 'string' && PATH_DATA.test(d))) bad('"mark" is a list of SVG path data, drawn in a 32 by 32 box');
    if (!Array.isArray(s.pages) || !s.pages.length || !s.pages.every((p) => Array.isArray(p) && p.length === 2 && words(String(p[0]), 40) && String(p[1]).startsWith(`/${key}/`))) {
      bad(`"pages" is a list of ["Name", "/${key}/…"]`);
    }
  }
  return site;
}

const icon = (paths) => 'data:image/svg+xml,' + encodeURIComponent(paths).replace(/'/g, '%27');
const BRAND_ICON = icon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#2b4cc4"/><rect x="3" y="8.5" width="18" height="7" rx="1.2" fill="#ffd23f" transform="rotate(-6 12 12)"/></svg>');
const markPaths = (section) => section.mark.map((d) => `<path d="${d}"/>`).join('');
const sectionIcon = (section) => icon(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#000"/><g fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" transform="translate(4 4) scale(.75)">${markPaths(section)}</g></svg>`);

function subBar(section, path) {
  const [, home] = section.pages[0];
  const item = ([name, to]) => `<a href="${esc(to)}"${to === path ? ' aria-current="page"' : ''}>${esc(name)}</a>`;
  return `<nav class="subnav" aria-label="${esc(section.name)}"><div class="subnav-in"><a class="subnav-name" href="${esc(home)}"><span class="mark"><svg viewBox="0 0 32 32" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${markPaths(section)}</svg></span>${esc(section.name)}</a>${section.pages.map(item).join('')}</div></nav>\n`;
}

// Everything the stamper writes for a site: a Map of path to text or bytes.
// Refuses with every reason at once, so one run tells a page's writer all
// there is to fix.
export function buildSite(siteDir) {
  const site = readSite(siteDir);
  const frame = readFrame(brandText('frame.txt'));
  const classes = knownClasses();
  const pagesDir = join(siteDir, 'pages');
  if (!existsSync(pagesDir)) refuse(`${siteDir}: no pages/ folder`);
  const isPrivate = (path) => { const top = path.split('/')[0]; return hidden(top) || site.private.includes(top); };

  const reasons = [];
  const pages = [];
  for (const file of walk(pagesDir).sort()) {
    if (!file.endsWith('.html')) reasons.push(`pages/${file}: pages/ holds pages only; a picture or another file goes at the path it is published at`);
    else if (RESERVED.test(file) || isPrivate(file)) reasons.push(`pages/${file}: this name is the stamper's, or one that is not published`);
    else {
      try {
        pages.push(readPage(readFileSync(join(pagesDir, file), 'utf8'), file, classes));
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        reasons.push(`pages/${e.message}`);
      }
    }
  }

  const out = new Map();
  const assets = { 'style.css': siteStyle(), 'site.js': brandText('site.js'), 'contact.js': brandText('contact.js') };
  for (const [name, text] of Object.entries(assets)) out.set(name, text);
  for (const file of walk(join(BRAND, 'fonts'))) out.set(`fonts/${file}`, readFileSync(join(BRAND, 'fonts', file)));
  if (site.platform) {
    out.set('platform/style.css', platformStyle() + '\n');
    out.set('platform/frame.txt', brandText('frame.txt'));
  }
  const v = Object.fromEntries(Object.entries(assets).map(([name, text]) => [name, `/${name}?v=${hash(text)}`]));
  const byPath = new Map(pages.map((page) => [pathOf(page.file), page]));
  const sectionOf = (path) => Object.entries(site.sections).find(([key]) => path.startsWith(`/${key}/`))?.[1];

  // Every link inside the site leads somewhere, to the letter: a page, a file
  // the stamper writes, or a file that is published as it is.
  const published = (path) => out.has(path) || (!isPrivate(path) && !path.endsWith('.html') && isFile(join(siteDir, path)));
  const plain = (path) => { try { return decodeURIComponent(path); } catch { return '\0'; } };
  const leads = (url, from) => {
    const [address, fragment] = url.split('#');
    const path = address.split('?')[0];
    const to = address === '' ? from : byPath.get(path);
    if (address !== '' && !to && !published(plain(path.slice(1)))) return `${url} leads nowhere on this site`;
    if (fragment && to && !to.ids.has(fragment)) return `${url}: no id="${fragment}" on that page`;
    return '';
  };
  for (const page of pages) {
    for (const url of page.links.filter((u) => u.startsWith('#') || u.startsWith('/'))) {
      const why = leads(url, page);
      if (why) reasons.push(`pages/${page.file}: ${why}`);
    }
  }
  for (const [key, section] of Object.entries(site.sections)) {
    for (const [, to] of section.pages) {
      if (!byPath.has(to)) reasons.push(`site.json: section "${key}": no page at ${to}`);
    }
  }
  if (reasons.length) refuse(reasons.join('\n'));

  const home = site.base + '/';
  for (const page of pages) {
    const path = pathOf(page.file);
    const missing = page.file === '404.html';
    const section = sectionOf(path);
    const address = site.base + path;
    const og = { type: 'website', title: page.title, description: page.description, ...page.og };
    out.set(page.file, [
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>${page.title}</title><meta name="description" content="${page.description}"><meta name="theme-color" content="#2b4cc4">`,
      missing || page.robots ? `<meta name="robots" content="${page.robots || 'noindex'}">` : '',
      missing ? '' : `<link rel="canonical" href="${address}">`,
      missing ? '' : `<meta property="og:site_name" content="${esc(frame.brand.name)}"><meta property="og:type" content="${og.type}"><meta property="og:title" content="${og.title}"><meta property="og:description" content="${og.description}"><meta property="og:url" content="${address}">${og.image ? `<meta property="og:image" content="${site.base}${og.image}"><meta name="twitter:card" content="summary_large_image">` : ''}`,
      `<link rel="icon" href="${section ? sectionIcon(section) : BRAND_ICON}">`,
      `<link rel="stylesheet" href="${v['style.css']}">`,
      page.data ? `<script type="application/ld+json">${page.data}</script>` : '',
      '</head><body>',
      '<div class="sky" aria-hidden="true"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div></div>',
      header(frame, home),
      (section ? subBar(section, path) : '') + page.main,
      footer(frame, site.notes),
      `<script src="${v['site.js']}" defer></script>${page.form ? `<script src="${v['contact.js']}" defer></script>` : ''}`,
      '</body></html>',
    ].filter(Boolean).join('\n') + '\n');
  }

  const listed = pages.filter((page) => page.file !== '404.html' && !/noindex/.test(page.robots)).map((page) => site.base + pathOf(page.file));
  out.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
  out.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.base}/sitemap.xml\n`);
  out.set('_config.yml', `# Written by the stamper (brand/stamp.mjs in the monaidea repository).\n# GitHub Pages serves this repository as it is, except these: the sources.\nexclude: [${site.private.join(', ')}]\n`);
  return out;
}

// What separates the site's folder from what the stamper would write: the
// files to write (missing or different) and the finished pages to remove
// (their source is gone; every published .html comes from pages/).
export function difference(siteDir, out = buildSite(siteDir)) {
  const unpublished = readSite(siteDir).private;
  const same = (path, what) => isFile(join(siteDir, path)) && Buffer.from(what).equals(readFileSync(join(siteDir, path)));
  const write = [...out.keys()].filter((path) => !same(path, out.get(path)));
  const scan = (under = '') => readdirSync(join(siteDir, under), { withFileTypes: true }).flatMap((entry) => {
    const path = under ? `${under}/${entry.name}` : entry.name;
    if (hidden(entry.name) || (!under && unpublished.includes(entry.name))) return [];
    return entry.isDirectory() ? scan(path) : [path];
  });
  const remove = scan().filter((path) => path.endsWith('.html') && !out.has(path));
  return { write, remove };
}

export function writeSite(siteDir) {
  const out = buildSite(siteDir);
  const { write, remove } = difference(siteDir, out);
  for (const path of write) {
    mkdirSync(dirname(join(siteDir, path)), { recursive: true });
    writeFileSync(join(siteDir, path), out.get(path));
  }
  for (const path of remove) rmSync(join(siteDir, path));
  return { out, write, remove };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [siteDir, flag] = process.argv.slice(2);
  if (!siteDir || (flag && flag !== '--check')) {
    console.error('usage: node brand/stamp.mjs <site folder> [--check]');
    process.exit(2);
  }
  try {
    if (flag === '--check') {
      const { write, remove } = difference(siteDir);
      if (write.length || remove.length) {
        console.error('The files here are not what the stamper writes. Run it without --check and commit the result.');
        for (const path of write) console.error(`  to write:  ${path}`);
        for (const path of remove) console.error(`  to remove: ${path} (no page under pages/ makes it)`);
        process.exit(1);
      }
      console.log('The site is what the stamper writes.');
    } else {
      const { out, write, remove } = writeSite(siteDir);
      const pages = [...out.keys()].filter((path) => path.endsWith('.html')).length;
      console.log(`${pages} pages stamped: ${write.length} files written, ${remove.length} removed`);
    }
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    console.error(`Nothing written. The stamper refuses:\n${e.message}`);
    process.exit(1);
  }
}
