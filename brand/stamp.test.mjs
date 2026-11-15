// Run: node --test brand/stamp.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Refused, buildSite, platformStyle, readFrame, readPage, siteStyle, writeSite } from './stamp.mjs';

const BRAND = dirname(fileURLToPath(import.meta.url));
const frameText = readFileSync(join(BRAND, 'frame.txt'), 'utf8');
const PAGE = '<title>A page</title>\n<meta name="description" content="What it is.">\n';
const page = (main) => `${PAGE}<main>${main}</main>\n`;
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof Refused && pattern.test(e.message), `expected a refusal matching ${pattern}`);

// A site in a temporary folder: { 'site.json': {...}, 'pages/index.html': '…' }.
function site(files) {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-'));
  for (const [path, text] of Object.entries({ 'site.json': { base: 'https://one.example' }, ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return dir;
}

test('the frame: ours reads, and it is one the platform accepts', () => {
  const frame = readFrame(frameText);
  assert.equal(frame.brand.name, 'Monaidea');
  assert.ok(frame.menu.length >= 1 && frame.foot.length >= 1);
  assert.deepEqual(readFrame('Brand | A | https://a.example/\nT | https://a.example/t\nFoot | P | https://a.example/p\nNote | n\nShop | S | https://s.example/ | what it sells'), {
    brand: { name: 'A', url: 'https://a.example/' }, menu: [],
    foot: [{ name: 'T', url: 'https://a.example/t' }, { name: 'P', url: 'https://a.example/p' }],
    notes: ['n'], shops: [{ name: 'S', url: 'https://s.example/', text: 'what it sells' }],
  });
});

test('the frame: what the platform would refuse is refused here', () => {
  const brand = 'Brand | A | https://a.example/\n';
  for (const [text, why] of [
    ['Menu | A | https://a.example/', /no Brand line/],
    [brand + brand, /one Brand line/],
    [brand + 'Menu | <b> | https://a.example/', /< > or a double quote/],
    [brand + 'Menu | A | http://a.example/', /https address/],
    [brand + 'Menu | A | https://a.example/ x', /https address/],
    [brand + `Menu | ${'n'.repeat(41)} | https://a.example/`, /1 to 40 characters/],
    [brand + `Note | ${'n'.repeat(201)}`, /1 to 200 characters/],
    [brand + `Shop | S | https://s.example/ | ${'n'.repeat(161)}`, /1 to 160 characters/],
    [brand + 'Link | A | https://a.example/', /not a Brand, Menu, Foot, Note or Shop line/],
    [brand + 'Note | a\nNote | b\nNote | c', /more than 2 notes/],
    [brand + 'Menu | A | https://a.example/\n'.repeat(9), /more than 8 menu/],
    [brand + `Note | ${'é'.repeat(190)}\n`.repeat(12), /longer than 4096 bytes/],
  ]) refused(() => readFrame(text), why);
});

test('a page: what the stamper reads from it', () => {
  const p = readPage(`<title>T &amp; t</title>\n<meta name="description" content="D">\n<meta property="og:type" content="article">\n<script type="application/ld+json">{"a":1}</script>\n<main class="prose" id="top"><!-- a note --><a href="#top">up</a> <a href="/x/?a=1&amp;b=2#y">x</a><form id="contact-form" data-product="P"></form></main>\n`, 'a/index.html');
  assert.equal(p.title, 'T &amp; t');
  assert.equal(p.description, 'D');
  assert.deepEqual(p.og, { type: 'article' });
  assert.equal(p.data, '{"a":1}');
  assert.deepEqual([...p.ids], ['top', 'contact-form']);
  assert.deepEqual(p.links, ['#top', '/x/?a=1&b=2#y']);
  assert.equal(p.form, true);
  assert.equal(readPage(page('<p>plain</p>'), 'b.html').form, false);
});

test('a page: content only, or it is refused', () => {
  for (const [source, why] of [
    ['<main>x</main>', /no <title>/],
    ['<title>T</title><main>x</main>', /no <meta name="description"/],
    [PAGE + '<p>x</p>', /then <main>…<\/main>, and nothing after it/],
    [page('x') + '<p>after</p>', /nothing after it/],
    [PAGE + '<main>a</main><main>b</main>', /one <main>/],
    [PAGE + PAGE + '<main>x</main>', /two titles/],
    ['<title>T</title><meta name="description" content="a"><meta name="description" content="b"><main>x</main>', /two description lines/],
    [PAGE + '<link rel="stylesheet" href="/mine.css"><main>x</main>', /before <main> a page has only/],
    [PAGE + '<link rel="canonical" href="https://one.example/"><main>x</main>', /before <main> a page has only/],
    [PAGE + '<meta property="og:url" content="https://one.example/"><main>x</main>', /before <main> a page has only/],
    [PAGE + '<script>alert(1)</script><main>x</main>', /before <main> a page has only/],
    [PAGE + '<script type="application/ld+json">{not json}</script><main>x</main>', /not valid JSON/],
    [PAGE + '<script type="application/ld+json">{"a":"</b>"}</script><main>x</main>', /no < in it/],
    [page('<script src="https://x.example/a.js"></script>'), /<script> is not a page's to write/],
    [page('<STYLE>p{color:red}</STYLE>'), /<style> is not a page's to write/],
    [page('<link rel="stylesheet" href="/mine.css">'), /<link> is not a page's to write/],
    [page('<iframe src="https://x.example/"></iframe>'), /<iframe> is not a page's to write/],
    [page('<p style="color:red">x</p>'), /attribute style/],
    [page('<p STYLE=color:red>x</p>'), /attribute style/],
    [page('<a href="/" onclick="x()">x</a>'), /attribute onclick/],
    [page('<header data-of="the brand">x</header>'), /attribute data-of/],
    [page('<form action="https://x.example/">x</form>'), /attribute action/],
    [page('<img src="/a.png" srcset="/b.png 2x">'), /attribute srcset/],
    [page('<p class="lede homemade">x</p>'), /class "homemade" is not in the brand's stylesheet/],
    [page('<a href="http://x.example/">x</a>'), /a link is/],
    [page('<a href="//x.example/">x</a>'), /a link is/],
    [page('<a href="guide/">x</a>'), /a link is/],
    [page('<a href="javascript:x()">x</a>'), /a link is/],
    [page('<img src="data:image/png;base64,AAAA">'), /a link is/],
    [page('a < b'), /starts no tag/],
    [page('<p class="lede>x</p>'), /cannot read/],
    [page('<!-- never ends'), /cannot read|never ends/],
  ]) refused(() => readPage(source, 'p.html'), why);
});

test('a site: every page gets the same frame, stylesheet and address', () => {
  const dir = site({
    'site.json': { base: 'https://one.example', notes: ['A note of this site.'], sections: { app: { name: 'App', mark: ['M1 2h3'], pages: [['Overview', '/app/'], ['Guide', '/app/guide/']] } } },
    'pages/index.html': page('<h1 id="top">Home</h1><a href="/app/guide/#steps">guide</a> <a href="/app/media/a.txt">file</a> <a href="#top">up</a>'),
    'pages/404.html': page('<h1>Not here</h1>'),
    'pages/app/index.html': page('<form id="contact-form"></form>'),
    'pages/app/guide/index.html': `<title>Guide</title>\n<meta name="description" content="How.">\n<meta property="og:type" content="article">\n<meta name="robots" content="noindex">\n<main><h2 id="steps">Steps</h2></main>`,
    'pages/app/media/a.txt': 'as it is',
  });
  const out = buildSite(dir);
  const html = [...out].filter(([path]) => path.endsWith('.html'));
  assert.deepEqual(html.map(([path]) => path).sort(), ['404.html', 'app/guide/index.html', 'app/index.html', 'index.html']);
  const frame = readFrame(frameText);
  const menu = frame.menu.map((l) => `<a href="${l.url}">${l.name}</a>`).join('');
  const foot = frame.foot.map((l) => `<a href="${l.url}">${l.name}</a>`).join(' &middot; ');
  for (const [path, text] of html) {
    // The platform's own markup (internal/pages/frame.go), so one stylesheet fits both.
    assert.ok(text.includes(`<header data-of="the brand"><nav><a class="brand" href="${frame.brand.url}">${frame.brand.name}</a>${menu}</nav></header>`), `${path}: the header`);
    assert.ok(text.includes(`<footer data-of="the brand">${foot}${frame.notes.map((n) => `<p>${n}</p>`).join('')}<p>A note of this site.</p></footer>`), `${path}: the footer`);
    for (const once of ['<header data-of=', '<footer data-of=', '<link rel="stylesheet" href="/style.css?v=', '<meta charset="utf-8">', '<main', '<script src="/site.js?v=']) {
      assert.equal(text.split(once).length, 2, `${path}: ${once} once`);
    }
    assert.ok(text.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8">'), `${path}: starts as a page`);
  }
  const home = out.get('index.html');
  assert.ok(home.includes('<link rel="canonical" href="https://one.example/">'));
  assert.ok(home.includes('<meta property="og:type" content="website"><meta property="og:title" content="A page"><meta property="og:description" content="What it is."><meta property="og:url" content="https://one.example/">'));
  assert.ok(!home.includes('contact.js') && !home.includes('subnav'));
  const app = out.get('app/index.html');
  assert.ok(app.includes('<script src="/contact.js?v='), 'the form brings its script');
  assert.ok(app.includes('<nav class="subnav" aria-label="App"><div class="subnav-in"><a class="subnav-name" href="/app/">'), 'a section page has its bar');
  assert.ok(app.includes('<a href="/app/" aria-current="page">Overview</a><a href="/app/guide/">Guide</a>'));
  assert.ok(app.includes('<path d="M1 2h3"/>') && app.includes('%3Cpath%20d%3D%22M1%202h3%22%2F%3E'), "the section's mark, in the bar and as the icon");
  const guide = out.get('app/guide/index.html');
  assert.ok(guide.includes('<a href="/app/">Overview</a><a href="/app/guide/" aria-current="page">Guide</a>'));
  assert.ok(guide.includes('<link rel="canonical" href="https://one.example/app/guide/">') && guide.includes('og:type" content="article"') && guide.includes('<meta name="robots" content="noindex">'));
  const missing = out.get('404.html');
  assert.ok(missing.includes('<meta name="robots" content="noindex">') && !missing.includes('canonical') && !missing.includes('og:url'));
  assert.equal(out.get('sitemap.xml').match(/<loc>[^<]+<\/loc>/g).join(), '<loc>https://one.example/app/</loc>,<loc>https://one.example/</loc>');
  assert.equal(out.get('robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://one.example/sitemap.xml\n');
  assert.equal(out.get('style.css'), siteStyle());
  assert.ok(out.has('site.js') && out.has('contact.js') && out.has('fonts/inter.woff2') && out.has('app/media/a.txt'));
  assert.ok(!out.has('platform/style.css'), 'only the brand\'s own site publishes the platform\'s files');

  const written = join(dir, 'out');
  writeSite(dir, written);
  assert.equal(readFileSync(join(written, 'app/media/a.txt'), 'utf8'), 'as it is');
  assert.equal(readFileSync(join(written, 'app/index.html'), 'utf8'), app);
  assert.ok(readFileSync(join(written, 'fonts/inter.woff2')).length > 10000);
});

test('a site: the menu item of the site itself is marked', () => {
  const frame = readFrame(frameText);
  const out = buildSite(site({ 'site.json': { base: new URL(frame.menu[0].url).origin }, 'pages/index.html': page('x') }));
  assert.ok(out.get('index.html').includes(`<a href="${frame.menu[0].url}" aria-current="true">`));
});

test('a site: nothing is built when one thing is wrong, and every reason is given', () => {
  const ok = { 'pages/index.html': page('<h1 id="top">x</h1>') };
  for (const [files, why] of [
    [{ ...ok, 'pages/a.html': page('<a href="/nowhere/">x</a>') }, /a\.html: \/nowhere\/ leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/index.html">x</a>') }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/#bottom">x</a>') }, /no id="bottom" on that page/],
    [{ ...ok, 'pages/a.html': page('<a href="#bottom">x</a>') }, /no id="bottom"/],
    [{ ...ok, 'pages/a.html': page('<img src="/missing.png">') }, /leads nowhere/],
    [{ ...ok, 'pages/style.css': 'p{}' }, /style\.css: this name is the stamper's/],
    [{ ...ok, 'pages/fonts/mine.woff2': 'x' }, /this name is the stamper's/],
    [{ ...ok, 'pages/platform/index.html': page('x') }, /this name is the stamper's/],
    [{ ...ok, 'pages/a.html': page('<p class="nope">x</p>'), 'pages/b.html': '<main>x</main>' }, /a\.html: the class "nope"[\s\S]*b\.html: no <title>/],
    [{ ...ok, 'site.json': { base: 'http://one.example' } }, /"base" is the site's address/],
    [{ ...ok, 'site.json': { base: 'https://one.example/' } }, /"base" is the site's address/],
    [{ ...ok, 'site.json': '{' }, /site\.json/],
    [{ ...ok, 'site.json': { base: 'https://one.example', notes: ['a', 'b', 'c'] } }, /"notes" is at most 2/],
    [{ ...ok, 'site.json': { base: 'https://one.example', sections: { app: { name: 'App', mark: ['M1 2'], pages: [['Overview', '/app/']] } } } }, /section "app": no page at \/app\//],
    [{ ...ok, 'site.json': { base: 'https://one.example', sections: { app: { name: 'App', mark: ['"><script>'], pages: [['Overview', '/app/']] } } } }, /"mark" is a list of SVG path data/],
    [{ ...ok, 'site.json': { base: 'https://one.example', sections: { app: { name: 'App', mark: ['M1 2'], pages: [['Overview', '/other/']] } } } }, /"pages" is a list/],
    [{ 'pages/readme.txt': 'no pages folder is not the case here, but no page either' }, /^$/],
  ]) {
    if (String(why) === '/^$/') { assert.equal([...buildSite(site(files)).keys()].filter((p) => p.endsWith('.html')).length, 0); continue; }
    refused(() => buildSite(site(files)), why);
  }
  refused(() => buildSite(site({})), /no pages\/ folder/);
});

test('the stylesheets: one source, two outputs', () => {
  const frame = readFrame(frameText);
  const forSites = siteStyle();
  const forPlatform = platformStyle(frame);
  const home = new URL(frame.brand.url).origin;
  assert.ok(forSites.includes('url(/fonts/inter.woff2)') && !forSites.includes(`${home}/fonts/`));
  assert.ok(forPlatform.includes(`url(${home}/fonts/inter.woff2)`) && !forPlatform.includes('url(/fonts/'));
  assert.ok(Buffer.byteLength(forPlatform) <= 65536 && forPlatform === forPlatform.trim(), 'what the platform takes');
  for (const shared of ['--a2:#6366f1', 'header[data-of]{position:sticky', 'footer[data-of]{max-width', '@font-face{font-family:"Space Grotesk"']) {
    assert.ok(forSites.includes(shared) && forPlatform.includes(shared), `both have ${shared}`);
  }
  assert.ok(forSites.includes('.subnav{') && !forPlatform.includes('.subnav'));
  assert.ok(forPlatform.includes('.cards{') && !forSites.includes('.cards{'));
  for (const text of [forSites, forPlatform]) {
    assert.ok(!/@import|googleapis|gstatic/.test(text), 'no page asks another company for anything');
  }
});

test('this repository\'s own site is stamped, with the platform\'s files', () => {
  const out = buildSite(join(BRAND, '..'));
  const frame = readFrame(frameText);
  assert.ok(out.get('index.html').includes('<header data-of="the brand">'));
  assert.equal(out.get('platform/style.css'), platformStyle(frame) + '\n');
  assert.equal(out.get('platform/frame.txt'), frameText);
});
