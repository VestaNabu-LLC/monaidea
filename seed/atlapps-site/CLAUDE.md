# Read this first (every Claude session in this repo)

**atlapps.monaidea.com**: the pages of Monaidea's Atlassian apps. `/` lists the
apps; each app's own pages are under `/<app>/` (`/ledgerstone/`, `/flagstone/`).
The business rules of the apps are in `CLAUDE.md` of `VestaNabu-LLC/ledgerstone`
(it wins business-wide) and of `VestaNabu-LLC/flagstone`; they bind here too.
Decisions about the brand and the sites live in the owner's claude.ai Project
"StandAloneHarnessed" (`claude/decision-log.md` and its addenda).

## Who writes what

| What | Who | Where |
|---|---|---|
| The words, pictures and videos of an app's pages | the apps' own workers (the weekly planner; its instructions are `docs/PLANNER-TASK.md` in `ledgerstone`) | `pages/<app>/` here |
| The family page `/` and the 404 page | the owner's Project | `pages/index.html`, `pages/404.html` |
| The look, the header, the footer, the fonts, the scripts | the owner's Project | repo `VestaNabu-LLC/monaidea`, folder `brand/`. **Not here: never copy them in** |
| An app's bar (its name, its mark, its pages) and the footer note | whoever adds a page or an app | `site.json` |

## A page is content only

```html
<title>What the page is</title>
<meta name="description" content="One or two sentences.">
<main>
  …the content, with the classes of the brand's stylesheet (monaidea: brand/css/site.css)…
</main>
```

Nothing else. The stamper (`brand/stamp.mjs` in `monaidea`; the exact rules are
at the top of that file) adds the stylesheet, the fonts, the header and footer,
the scripts, the page's address and its icon, and **refuses to build the site**
when a page has a `<script>`, `<style>`, `<link>` or `<iframe>`, a `style` or
`on…` attribute, a class the stylesheet does not know, a link that is not
`#…`, `/…`, `https://…` or `mailto:…`, or a link inside the site that leads
nowhere (the page, the file, or the `id` after a `#`). Then nothing is
published and the site stays as it was.

- **Never work around a refusal.** Fix the page. If a page needs a look the
  brand does not have, ask in the owner's Project: it goes into the brand
  first, then every site has it.
- Links inside the site are written from the root: `/ledgerstone/guide/`, never
  `guide/` or `https://atlapps.monaidea.com/…`.
- Before pushing: `node ../monaidea/brand/stamp.mjs . _site` (clone `monaidea`
  next to this repo once). After pushing: check the run
  (`gh run list -R VestaNabu-LLC/atlapps-site -L 1`); a failed run published
  nothing, and its log lists every reason.

## Rules

- **Every page keeps its address.** Marketplace listings, the released apps,
  the Forge console and search engines link to them: `/<app>/`,
  `/<app>/guide/`, `/<app>/support/`, `/<app>/privacy/`, `/<app>/security/`,
  and Ledgerstone's `/ledgerstone/jira-permission-audit-checklist/` and
  `/ledgerstone/jira-access-review-soc2-iso27001/`. Never rename or remove a
  page's folder. Each support page keeps `id="contact"` on its form section,
  and Flagstone's keeps the topic "Reminders request": the released Flagstone
  app links to `/support/?topic=reminders-request#contact` on its old host,
  which forwards here with the path kept.
- **Legal texts** (each app's `privacy/` and `security/`): no wording change
  without the owner's yes. The two `security/` pages are one text, Monaidea's
  security policy: change both or neither. Keep it in step with
  `docs/SECURITY.md` in `ledgerstone`, without lab internals.
- What a page says about an app (price, permissions, what is stored, what it
  cannot do) must be true of the released app. Prices and scopes are the
  owner's decisions.
- Screenshots must not show the company name or people's names (owner,
  2026-10-17): blur them and say so in the caption.
- The guide's PDF (`pages/ledgerstone/guide/Ledgerstone-Guide.pdf`) is printed
  from the guide's page: after changing the guide, run `tools/guide-pdf.mjs`
  (how: the top of that file) and commit the new PDF with the page.
- No other company on a page: no fonts, scripts, analytics or embeds from
  elsewhere. The contact form (Monaidea's Worker at forms.monaidea.com, with
  Cloudflare Turnstile) is the one exception.
- Never commit secrets, tokens, email addresses of people or personal data.
- Content goes to `main` directly or by pull request; either way the `publish`
  run is the gate. Commit messages end with the attribution lines the session
  provides.
- Never say something is done without evidence: say which of written, built,
  published or seen working it is.

## The owner

Seb, for VestaNabu LLC (public name **Monaidea**). He talks to Claude only
through claude.ai. Write to him short, direct, table-first; what he must do as
a numbered list of at most 3 steps, exact enough for a non-technical person.
Claude has no browser access to his accounts: he does the browser steps
(GitHub settings, DNS, the Atlassian consoles) himself.
