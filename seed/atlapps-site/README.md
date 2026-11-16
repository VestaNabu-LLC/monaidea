# atlapps.monaidea.com

The pages of Monaidea's Atlassian apps: `/` lists them, and each app's own
pages are under `/<app>/` (`/ledgerstone/`, `/flagstone/`). Rules for anyone
changing it: `CLAUDE.md`.

A page under `pages/` holds content only. On every push to `main` the `publish`
workflow checks out the Monaidea brand (repository `VestaNabu-LLC/monaidea`,
folder `brand/`) and its stamper builds the site: it adds the stylesheet,
fonts, header, footer and scripts to every page, checks every link inside the
site, and refuses to build if one page cannot be stamped. GitHub Pages serves
the result.

```sh
git clone --depth 1 https://github.com/VestaNabu-LLC/monaidea ../monaidea   # once
node ../monaidea/brand/stamp.mjs . _site                                   # the site as it will be published
```

Until 2026-11-15 the two apps had a site each, `ledgerstone.monaidea.com`
(repository `ledgerstone-site`) and `flagstone.monaidea.com` (`flagstone-site`).
Every page kept its path: `https://ledgerstone.monaidea.com/guide/` is now
`https://atlapps.monaidea.com/ledgerstone/guide/`.
