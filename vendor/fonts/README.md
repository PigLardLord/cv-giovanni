# Vendored fonts

Two uses, two formats.

- **The PDF** embeds `inter/Inter-Regular.ttf` and `inter/Inter-Bold.ttf` through pdfmake.
- **The page** loads `fonts.css`, which declares the faces below in `woff2`, latin and latin-ext
  subsets, with `unicode-range` so a browser fetches a subset only when the page uses a character in it.

The page's faces used to come from Google Fonts. That request hands every visitor's IP address to
Google before any consent (#61), so they are served from here instead.

| Family | Weights | File | Source | Licence |
|---|---|---|---|---|
| Inter | 300, 400, 500, 600, 700 | variable, one per subset | `@fontsource-variable/inter@5.3.0` | SIL OFL 1.1 — `inter/LICENSE-Inter.txt` |
| JetBrains Mono | 400, 500, 700 | variable, one per subset | `@fontsource-variable/jetbrains-mono@5.3.0` | SIL OFL 1.1 — `jetbrains-mono/LICENSE-JetBrainsMono.txt` |
| Instrument Serif | 400 | static | `@fontsource/instrument-serif@5.3.0` | SIL OFL 1.1 — `instrument-serif/LICENSE-InstrumentSerif.txt` |

The weights are exactly the ones the page requested from Google, so nothing renders in a face it did
not render in before. `tests/FontsAreSelfHosted.test.js` holds that set and fails if a reference to
Google Fonts comes back.

**Why variable.** Google served Inter as a variable font, one file for every weight. Served as one
static file per weight instead, a printed page was laid out before the weights it asked for late had
arrived, and those lines came out in a system fallback. One file per subset removes the race.

**Updating.** `npm pack` the package at the new version, copy its
`<family>-latin{,-ext}-wght-normal.woff2` (static: `-<weight>-normal.woff2`) files, and take each
subset's `unicode-range` from the package's `index.css` (static: `<weight>.css`). Package integrity at
the time of vendoring:

- `@fontsource-variable/inter@5.3.0` — `sha512-OupL48va4JNofb97w6NYeF9S7W/kHNKM0Er8Dem5nqi4jeOLrVJDoE8tZEpnMJmtkvNbB1EIPPwHcdkF6b1oUA==`
- `@fontsource-variable/jetbrains-mono@5.3.0` — `sha512-F32xpS2NsGYoQi2ADSkKTgpJj7ozajsGgDJ8woTnqjmIB+dxDIqImjl4pXZVEExu8UFZ2ndhmX18EBS/hdz3Lw==`
- `@fontsource/instrument-serif@5.3.0` — `sha512-mDiaIg0u67sYV59fie92Wz4sM8UiVlbL7fLxnFPCKkX15DMASEnQTREbaP5S5/3DCcsoAOcQ0sV9E4AeY4QqYQ==`
