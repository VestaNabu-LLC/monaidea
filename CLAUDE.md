# Read this first (every Claude session in this repo)

This repo is two things:

1. **www.monaidea.com**, Monaidea's landing page and legal pages (`pages/`).
2. **The Monaidea brand** (`brand/`): the one source of the look, the header and
   the footer of every Monaidea page, wherever it is published.

Decisions live in the owner's claude.ai Project "StandAloneHarnessed"
(`claude/decision-log.md` and its dated addenda; the plan is
`claude/plan-owner-projects.md`). A session that cannot read the Project has
this file.

## Who publishes what

| Site | Pages written in | Published by | The brand reaches it |
|---|---|---|---|
| www.monaidea.com | this repo, `pages/` | GitHub Pages, serving `main` as it is | the stamper writes the finished pages here; they are committed |
| atlapps.monaidea.com/`<app>` | repo `VestaNabu-LLC/atlapps-site`, `pages/` | GitHub Pages, serving its `main` as it is | this repo's stamper, run there, writes the finished pages and a copy of the stylesheet, fonts and scripts; they are committed |
| shops.monaidea.com and each category's host | the platform's agents (repo `standalone-harnessed`) | the platform | the owner pastes `/platform/style.css` and `/platform/frame.txt` (published by this repo) into the platform's dashboard, Products |
| www.vestanabullc.com | repo `webforvestanabullc` | itself | never: another brand |

## The owner

Seb, for VestaNabu LLC (public name **Monaidea**). He talks to Claude only
through claude.ai.

- Mandate: the most accurate code, the least over-engineered solution, the
  least token usage. Be honest; never say things to please.
- Write to him short, direct, table-first. What he must do or decide: a
  numbered list, at most 3 steps, exact enough for a non-technical person (what,
  why, exact clicks or one single-line command, what he should see).
- Claude has no browser access to his accounts: he does browser steps himself;
  everything else goes through APIs and pull requests.
- Never ask for, type, show or store a password, key or token. Never paste a
  secret in chat.

## Rules

- **The brand is applied by code, never by hand.** A page under `pages/` is
  content only: a `<title>`, a description, then `<main>…</main>` (the exact
  form is at the top of `brand/stamp.mjs`). The stamper writes the finished
  page from it, with the stylesheet, fonts, header, footer, scripts, address
  and icon, and writes nothing when one page breaks a rule.
- **Run `node brand/stamp.mjs .` before every commit** that touches `pages/`,
  `site.json` or `brand/`, and commit what it wrote. GitHub Pages serves `main`
  as it is, so what is committed is what is live. The `check` workflow fails
  when the committed files are not what the stamper writes: a red check on
  `main` means a stale or off-brand page is live, so fix it at once. (The owner
  chose this over publishing through GitHub Actions, 2026-11-15: "I don't care
  if something does not look right... we can fix it.")
- **Never edit a finished file by hand**: every `.html` outside `pages/`,
  `style.css`, `site.js`, `contact.js`, `fonts/`, `platform/`, `sitemap.xml`,
  `robots.txt` and `_config.yml` are the stamper's. Edit the source and run it.
- **Never weaken the stamper or its tests to get a page through.** Fix the page.
  A page needs a look the brand does not have: add it to `brand/css/site.css`
  first, then use it.
- **One source.** Colours and fonts: `brand/css/tokens.css` and `font.css`.
  Header and footer rules: `brand/css/chrome.css`. Menu, footer links and notes:
  `brand/frame.txt`, in the platform's own line format (`pages.ReadFrame` in
  `standalone-harnessed`), so the platform takes the same file. No other file,
  here or in another repo, repeats any of it.
- **After a change to `brand/`** (merged here): (1) in `atlapps-site`, run
  `node ../monaidea/brand/stamp.mjs .`, commit what it wrote and push, in the
  same session; and (2) when `platform/style.css` or `platform/frame.txt`
  changed, tell the owner to paste them again on the platform's Products page.
- **No other company on a page**: no fonts, scripts, analytics or embeds from
  elsewhere (the privacy policy says no cookies, no analytics, no tracking).
  The contact form's Cloudflare Turnstile is the one exception, and it loads
  only when someone starts using the form.
- **Legal texts** (`pages/privacy/`, `pages/terms/`, `pages/refunds/`): no
  wording change without the owner's yes.
- **Monaidea and VestaNabu stay separate** (Cloudflare accounts, domains,
  brands). VestaNabu LLC appears only where it is legally responsible: the
  copyright note and the legal texts.
- No secrets in the repo. The contact Worker's two secrets live in Cloudflare;
  the Turnstile site key in `brand/contact.js` is public by design.
- Changes go by pull request with the `check` green; merging publishes, a
  minute or two later (the owner gave a standing OK to merge). Commit messages and PR descriptions
  end with the attribution lines the session provides.
- Never say something is done without evidence: say which of planned, built,
  tested, published or seen working it is.

## Where things are

| What | Where |
|---|---|
| The stamper and its tests | `brand/stamp.mjs`, `brand/stamp.test.mjs` |
| The stylesheets' parts | `brand/css/`: `font`, `tokens`, `chrome` (all pages), `site` (hand-built pages), `platform` (the platform's pages) |
| Fonts (served by us, with their licences) | `brand/fonts/` |
| Menu, footer, notes, the owner's other shops | `brand/frame.txt` |
| Scripts on every page / on pages with the form | `brand/site.js` / `brand/contact.js` |
| This site's address, footer note, and what is not published | `site.json` |
| This site's pages, as written | `pages/` |
| This site's pages, as published | the repository's root, written by the stamper |
| The contact Worker (`forms.monaidea.com`) | `worker/`; the owner deploys it by pasting `worker/src/index.js` in the Cloudflare dashboard |
| Publishing | GitHub Pages, "Deploy from a branch", `main`, `/ (root)`; `_config.yml` (the stamper's) keeps `pages/`, `brand/`, `worker/` and the notes out of the site |
| The check on every push | `.github/workflows/check.yml` |

## Commands

```sh
node --test brand/stamp.test.mjs worker/test/index.test.mjs
node brand/stamp.mjs .            # write the finished pages; then commit them
node brand/stamp.mjs . --check    # what the check on every push runs
```
