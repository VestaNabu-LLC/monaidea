# Seed of atlapps-site (temporary; delete this branch once atlapps-site holds its first commit)

On 2026-11-15 Claude's GitHub app could not yet push to the new repository
`VestaNabu-LLC/atlapps-site`, so what cannot be regenerated is kept here.
To rebuild the repository's first commit:

1. Copy `seed/atlapps-site/` (hidden files too) into an empty clone of `atlapps-site`.
2. `python3 seed/convert_app.py <clone of ledgerstone-site> ledgerstone <atlapps-site>` and the same with
   `<clone of flagstone-site> flagstone`: each old page becomes a content-only page under `pages/<app>/`,
   links rewritten, pictures and videos copied.
3. In atlapps-site: `node ../monaidea/brand/stamp.mjs . _site`, then
   `node tools/guide-pdf.mjs _site pages/ledgerstone/guide/Ledgerstone-Guide.pdf`, then stamp again.
4. Check: the visible text of all 12 app pages is unchanged (only link addresses differ).
