// Run: node --test brand/stamp.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Refused, buildSite, difference, platformStyle, readFrame, readPage, siteStyle, writeSite } from './stamp.mjs';

const BRAND = dirname(fileURLToPath(import.meta.url));
const frameText = readFileSync(join(BRAND, 'frame.txt'), 'utf8');
const PAGE = '<title>A page</title>\n<meta name="description" content="What it is.">\n';
const page = (main) => `${PAGE}<main>${main}</main>\n`;
const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof Refused && pattern.test(e.message), `expected a refusal matching ${pattern}`);

// A site in a temporary folder: { 'site.json': {...}, 'pages/index.html': '…', 'a/picture.png': '…' }.
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
    [PAGE + '<meta property="og:image" content="https://other.example/a.png"><main>x</main>', /og:image is a picture of this site/],
    [PAGE + '<meta property="og:image" content="//other.example/a.png"><main>x</main>', /og:image is a picture of this site/],
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
    'site.json': { base: 'https://one.example', notes: ['A note of this site.'], private: ['tools'], sections: { app: { name: 'App', mark: ['M1 2h3'], pages: [['Overview', '/app/'], ['Guide', '/app/guide/']] } } },
    'pages/index.html': page('<h1 id="top">Home</h1><a href="/app/guide/#steps">guide</a> <a href="/app/media/a%20b.txt?x=1">file</a> <a href="/fonts/inter.woff2">font</a> <a href="#top">up</a>'),
    'pages/404.html': page('<h1>Not here</h1>'),
    'pages/app/index.html': page('<form id="contact-form"></form>'),
    'pages/app/guide/index.html': `<title>Guide</title>\n<meta name="description" content="How.">\n<meta property="og:type" content="article">\n<meta property="og:image" content="/app/media/a%20b.txt">\n<meta name="robots" content="noindex">\n<main><h2 id="steps">Steps</h2></main>`,
    'app/media/a b.txt': 'as it is',
    'tools/notes.html': 'not published, so not a page',
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
  assert.ok(guide.includes('<meta property="og:image" content="https://one.example/app/media/a%20b.txt"><meta name="twitter:card" content="summary_large_image">'), 'a picture for sharing, by its full address');
  assert.ok(!home.includes('og:image') && !home.includes('twitter:card'));
  const missing = out.get('404.html');
  assert.ok(missing.includes('<meta name="robots" content="noindex">') && !missing.includes('canonical') && !missing.includes('og:url'));
  assert.equal(out.get('sitemap.xml').match(/<loc>[^<]+<\/loc>/g).join(), '<loc>https://one.example/app/</loc>,<loc>https://one.example/</loc>');
  assert.equal(out.get('robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://one.example/sitemap.xml\n');
  assert.ok(out.get('_config.yml').endsWith('\nexclude: [pages, brand, site.json, README.md, CLAUDE.md, tools]\n'), 'GitHub Pages is told what not to publish');
  assert.equal(out.get('style.css'), siteStyle());
  assert.ok(out.has('site.js') && out.has('contact.js') && out.get('fonts/inter.woff2').length > 10000);
  assert.ok(!out.has('platform/style.css'), 'only the brand\'s own site publishes the platform\'s files');
  assert.ok(!out.has('app/media/a b.txt'), 'a file that is published as it is stays as it is');
});

test('a site: written in place, checked, and kept in step with its sources', () => {
  const dir = site({
    'pages/index.html': page('<h1>Home</h1><a href="/a/">a</a>'),
    'pages/a/index.html': page('<h1>A</h1>'),
    'picture.png': 'as it is',
  });
  const all = [...buildSite(dir).keys()].sort();
  assert.deepEqual(difference(dir), { write: [...buildSite(dir).keys()], remove: [] }, 'nothing is written yet');
  assert.deepEqual(writeSite(dir).write.sort(), all);
  assert.equal(readFileSync(join(dir, 'a/index.html'), 'utf8'), buildSite(dir).get('a/index.html'));
  assert.ok(readFileSync(join(dir, 'fonts/inter.woff2')).equals(readFileSync(join(BRAND, 'fonts/inter.woff2'))));
  assert.equal(readFileSync(join(dir, 'picture.png'), 'utf8'), 'as it is');
  assert.deepEqual(difference(dir), { write: [], remove: [] }, 'written: the check passes');
  assert.deepEqual(writeSite(dir).write, [], 'a second run writes nothing');

  // A finished page edited by hand, a page nobody stamped, a source that is gone.
  writeFileSync(join(dir, 'a/index.html'), 'edited by hand');
  writeFileSync(join(dir, 'stray.html'), '<p>not from pages/</p>');
  rmSync(join(dir, 'style.css'));
  assert.deepEqual(difference(dir), { write: ['style.css', 'a/index.html'], remove: ['stray.html'] });
  writeFileSync(join(dir, 'pages/index.html'), page('<h1>Home</h1>'));
  rmSync(join(dir, 'pages/a/index.html'));
  const second = writeSite(dir);
  assert.deepEqual([second.write.sort(), second.remove.sort()], [['index.html', 'sitemap.xml', 'style.css'], ['a/index.html', 'stray.html']]);
  assert.ok(!existsSync(join(dir, 'a/index.html')) && !existsSync(join(dir, 'stray.html')) && existsSync(join(dir, 'picture.png')));
  assert.deepEqual(difference(dir), { write: [], remove: [] });

  // The command line: what the check on every push runs.
  const run = (...args) => spawnSync(process.execPath, [join(BRAND, 'stamp.mjs'), ...args], { encoding: 'utf8' });
  assert.equal(run(dir, '--check').status, 0);
  writeFileSync(join(dir, 'stray.html'), 'x');
  assert.equal(run(dir, '--check').status, 1, 'a page nobody stamped fails the check by itself');
  writeFileSync(join(dir, 'index.html'), 'edited by hand');
  const failed = run(dir, '--check');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /to write: {2}index\.html\n {2}to remove: stray\.html/);
  assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), 'edited by hand', '--check writes nothing');
  assert.equal(run(dir).status, 0);
  assert.equal(run(dir, '--check').status, 0);
  assert.equal(run().status, 2);
  assert.equal(run(dir, '--chek').status, 2);

  // A refusal writes nothing at all.
  writeFileSync(join(dir, 'pages/index.html'), page('<h1 class="nope">Home</h1>'));
  const before = readFileSync(join(dir, 'index.html'), 'utf8');
  refused(() => writeSite(dir), /class "nope"/);
  assert.equal(readFileSync(join(dir, 'index.html'), 'utf8'), before);
  assert.equal(run(dir).status, 1);
  assert.match(run(dir, '--check').stderr, /Nothing written\. The stamper refuses:\npages\/index\.html: the class "nope"/);
});

test('a site: the menu item of the site itself is marked', () => {
  const frame = readFrame(frameText);
  const out = buildSite(site({ 'site.json': { base: new URL(frame.menu[0].url).origin }, 'pages/index.html': page('x') }));
  assert.ok(out.get('index.html').includes(`<a href="${frame.menu[0].url}" aria-current="true">`));
});

test('a site: nothing is built when one thing is wrong, and every reason is given', () => {
  const ok = { 'pages/index.html': page('<h1 id="top">x</h1>') };
  for (const [files, why] of [
    [{ ...ok, 'pages/a.html': page('<a href="/nowhere/">x</a>') }, /pages\/a\.html: \/nowhere\/ leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/index.html">x</a>') }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/#bottom">x</a>') }, /no id="bottom" on that page/],
    [{ ...ok, 'pages/a.html': page('<a href="#bottom">x</a>') }, /no id="bottom"/],
    [{ ...ok, 'pages/a.html': page('<img src="/missing.png">') }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': PAGE + '<meta property="og:image" content="/missing.png"><main>x</main>' }, /pages\/a\.html: \/missing\.png leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/%E0%A4%A">x</a>') }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/stray.html">x</a>'), 'stray.html': 'x' }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/pages/index.html">x</a>') }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/site.json">x</a>') }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/.hidden/x.txt">x</a>'), '.hidden/x.txt': 'x' }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/_drafts/x.txt">x</a>'), '_drafts/x.txt': 'x' }, /leads nowhere/],
    [{ ...ok, 'site.json': { base: 'https://one.example', private: ['worker'] }, 'pages/a.html': page('<a href="/worker/x.js">x</a>'), 'worker/x.js': 'x' }, /leads nowhere/],
    [{ ...ok, 'pages/a.html': page('<a href="/media">x</a>'), 'media/x.txt': 'x' }, /leads nowhere/],
    [{ ...ok, 'pages/picture.png': 'x' }, /pages\/picture\.png: pages\/ holds pages only/],
    [{ ...ok, 'pages/platform/index.html': page('x') }, /pages\/platform\/index\.html: this name is the stamper's, or one that is not published/],
    [{ ...ok, 'pages/fonts/index.html': page('x') }, /this name is the stamper's/],
    [{ ...ok, 'pages/brand/index.html': page('x') }, /not published/],
    [{ ...ok, 'pages/_x/index.html': page('x') }, /not published/],
    [{ ...ok, 'site.json': { base: 'https://one.example', private: ['worker'] }, 'pages/worker/index.html': page('x') }, /not published/],
    [{ ...ok, 'site.json': { base: 'https://one.example', private: ['../x'] } }, /"private" is a list/],
    [{ ...ok, 'pages/a.html': page('<p class="nope">x</p>'), 'pages/b.html': '<main>x</main>' }, /pages\/a\.html: the class "nope"[\s\S]*pages\/b\.html: no <title>/],
    [{ ...ok, 'site.json': { base: 'http://one.example' } }, /"base" is the site's address/],
    [{ ...ok, 'site.json': { base: 'https://one.example/' } }, /"base" is the site's address/],
    [{ ...ok, 'site.json': '{' }, /site\.json/],
    [{ ...ok, 'site.json': { base: 'https://one.example', notes: ['a', 'b', 'c'] } }, /"notes" is at most 2/],
    [{ ...ok, 'site.json': { base: 'https://one.example', sections: { app: { name: 'App', mark: ['M1 2'], pages: [['Overview', '/app/']] } } } }, /section "app": no page at \/app\//],
    [{ ...ok, 'site.json': { base: 'https://one.example', sections: { app: { name: 'App', mark: ['"><script>'], pages: [['Overview', '/app/']] } } } }, /"mark" is a list of SVG path data/],
    [{ ...ok, 'site.json': { base: 'https://one.example', sections: { app: { name: 'App', mark: ['M1 2'], pages: [['Overview', '/other/']] } } } }, /"pages" is a list/],
  ]) refused(() => buildSite(site(files)), why);
  refused(() => buildSite(site({})), /no pages\/ folder/);
});

test('the stylesheets: one source, two outputs', () => {
  const forSites = siteStyle();
  const forPlatform = platformStyle();
  assert.ok(forSites.includes('url(/fonts/inter.woff2)') && forSites.includes('url(/fonts/space-grotesk.woff2)') && forSites.includes('url(/fonts/jetbrains-mono.woff2)'));
  for (const shared of ['--a2:#6366f1', 'header[data-of]{position:sticky', 'footer[data-of]{max-width', '@font-face{font-family:"Space Grotesk"']) {
    assert.ok(forSites.includes(shared) && forPlatform.includes(shared), `both have ${shared}`);
  }
  assert.ok(forSites.includes('.subnav{') && !forPlatform.includes('.subnav'));
  assert.ok(forPlatform.includes('.cards{') && !forSites.includes('.cards{'));
  assert.ok(!/@import|googleapis|gstatic/.test(forSites), 'no page asks another company for a font');

  // What the platform takes (standalone-harnessed, migration 0043, word for
  // word): at most 64 KB, trimmed, nothing that runs, nothing from another host.
  const refusedByThePlatform = /<\/|<script|javascript:|expression\(|@import|url\s*\(\s*["']?\s*(https?:)?\/\//i;
  assert.ok(!refusedByThePlatform.test(forPlatform), 'nothing loaded from another host');
  assert.ok(Buffer.byteLength(forPlatform) <= 65536 && forPlatform === forPlatform.trim());
  assert.ok(!forPlatform.includes('url(/fonts/'), 'a page of the platform has no /fonts/ to ask');
  const embedded = readFileSync(join(BRAND, 'fonts/space-grotesk.woff2')).toString('base64');
  assert.ok(forPlatform.includes(`font-weight:300 700;font-display:swap;src:url(data:font/woff2;base64,${embedded}) format("woff2")}`), 'the display typeface travels inside');
  assert.equal(forPlatform.split('@font-face').length, 2, 'and only that one');
});

test('this repository\'s own site is stamped, with the platform\'s files', () => {
  const out = buildSite(join(BRAND, '..'));
  assert.ok(out.get('index.html').includes('<header data-of="the brand">'));
  assert.equal(out.get('platform/style.css'), platformStyle() + '\n');
  assert.equal(out.get('platform/frame.txt'), frameText);
  assert.deepEqual(difference(join(BRAND, '..')), { write: [], remove: [] }, 'run `node brand/stamp.mjs .` and commit what it writes');
});
