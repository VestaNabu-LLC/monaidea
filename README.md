# www.monaidea.com and the Monaidea brand

Monaidea is the public name of VestaNabu LLC's software products (owner,
2026-10-21). This repository holds its landing page and, in `brand/`, the one
source of the look, header and footer of every Monaidea page. Rules for anyone
changing it: `CLAUDE.md`.

## How a page gets published

A page under `pages/` holds content only. `brand/stamp.mjs` writes the finished
page from it into the repository's root: it adds the stylesheet, fonts, header,
footer, scripts, address and icon to every page, and writes nothing if one page
breaks a rule. The finished pages are committed, and GitHub Pages serves `main`
as it is. A check on every push fails when the committed files are not what
the stamper writes. `atlapps-site` is written the same way with this
repository's `brand/`.

```sh
node --test brand/stamp.test.mjs worker/test/index.test.mjs
node brand/stamp.mjs .            # then commit what it wrote
node brand/stamp.mjs . --check
```

The stamper also writes `/platform/style.css` and `/platform/frame.txt`: the
same brand for the pages the platform publishes (shops.monaidea.com and each
category's host). The owner pastes them into the platform's dashboard.

## Contact form

The `#contact` section of the home page and `brand/contact.js` (owner request,
2026-11-02; working since his test the same day). The form posts to Monaidea's
own contact Worker, `monaidea-contact` in Monaidea's Cloudflare account at
https://forms.monaidea.com (source, tests and settings in `worker/`; the owner
creates and deploys it in the dashboard, and `GET https://forms.monaidea.com/`
shows whether its two secrets are set). It checks Cloudflare Turnstile
(Monaidea's widget, in the same account, allowed on `monaidea.com` and so on
every host under it; its public site key is `SITEKEY` in `brand/contact.js`)
and emails the message from noreply@monaidea.com to support@monaidea.com
through Postmark. Turnstile loads only once someone starts using the form. The
Worker accepts any `https://*.monaidea.com` page, so every Monaidea site uses
the same form.
