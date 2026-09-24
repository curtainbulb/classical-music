# Canon — 101 essential classical works, heard in order

A chronological listening companion, not a database browse. One hundred works from
Pachelbel to Steve Reich, arranged as a single walk through musical history rather
than a grid of cards. Read the concept and design rationale below before touching
the code — several choices (no cards, no fabricated links) are load-bearing.

## Concept

The site is one continuous vertical timeline ("the river"). Scroll through eras;
the background tint and accent colour shift to match whichever era is in view.
Works are listed as a dense chronological index and expand in place into a full
editorial spread — no modal, no separate page. A command palette (`/`) searches
by composer, title, form, or era. A "Start Here" toggle filters to the 34 works
flagged as `gateway: true` — the best first hearing of each era. "Surprise" jumps
to a random work.

No build step is required. It's plain HTML/CSS/JS, deployable to GitHub Pages by
serving the repository root.

## Structure

```
index.html              markup shell (hero, rail, palette, footer)
css/style.css            all styling — one stylesheet, CSS custom properties
                          for era theming, no framework
js/app.js                 rendering, scroll-linked theming, search, filters
data/eras.js              6 era definitions (name, period, colour palette, blurb)
data/works.js             the 101 works — see schema below
data/apple-music-resolved.json   build-time-resolved Apple Music links (see below)
scripts/resolve-apple-music.mjs  the resolver pipeline (see below)
.github/workflows/
  resolve-apple-music.yml        runs the resolver in CI, commits results
  deploy.yml                     deploys to GitHub Pages on push to main
```

### `data/works.js` schema

Each work: `id, era, phase, gateway, composer, title, form, duration, born, died,
nationality, when, why, context, best, alt, apple` — and optionally `appleUrl` /
`appleVerified` for hand-confirmed recordings. `apple` is always present as a
plain-text search string (composer + title + performer), used both as the input
to the resolver script and as the fallback search query if nothing more precise
is available.

## The Apple Music problem, and how this actually solves it

The brief for this project was explicit that Apple Music links must point at the
*correct* recording, not a plausible-looking guessed URL. Guessed
`music.apple.com/.../id123456` URLs are indistinguishable from real ones until
clicked, and are frequently wrong — so this project never generates one.

Three tiers, in order of preference, implemented in `appleMusicFor()` in `js/app.js`:

1. **`data/apple-music-resolved.json`** — build-time resolved links, each carrying
   a confidence score and the matched album/artist, produced by
   `scripts/resolve-apple-music.mjs` against Apple's public, unauthenticated
   iTunes Search API (`itunes.apple.com/search`). This is the CI-refreshed,
   scalable path (see workflow below).
2. **`appleUrl` / `appleVerified: true` on the work itself** — a small,
   hand-verified batch (currently the four highest-traffic gateway works:
   Vivaldi's *Four Seasons*, Bach's *Cello Suites*, and Beethoven's 5th and 9th
   symphonies) confirmed by directly searching Apple Music and checking the
   result matches the named recording before storing the URL.
3. **Honest search fallback** — for everything not yet resolved, the site links
   to `music.apple.com/us/search?term=...` with the specific recording name.
   This is a real, always-working Apple Music destination — it is not a guess
   at a specific album's ID, just a search for it — and the UI marks it
   distinctly ("Find on Apple Music", outlined rather than filled, with a
   one-line note) so nobody mistakes it for a confirmed link.

### Why the resolver didn't run against all 101 during development

The sandbox this project was built in has an outbound-network allowlist that
does not include Apple's domains, so `scripts/resolve-apple-music.mjs` could be
written and unit-tested (including a mocked-fetch run verifying the scoring
logic correctly rejects mismatched candidates) but not run end-to-end here. It's
designed to run anywhere with normal internet access — most straightforwardly in
GitHub Actions (`.github/workflows/resolve-apple-music.yml`), which resolves
against the live API and commits `data/apple-music-resolved.json` back to the
repo. Trigger it manually (`workflow_dispatch`) after first pushing this repo to
GitHub, or let it run on the monthly schedule / on any change to `data/works.js`.

The resolver is deliberately conservative: it requires the composer's surname to
appear in the candidate result at all (hard requirement, not scored), then scores
title and performer-name token overlap, and only accepts a match above a 0.62
confidence threshold. Anything below that is left `unresolved` rather than
forced — matching the brief's requirement to handle low-confidence cases
explicitly rather than silently linking to the wrong recording.

## Content

The 101 works are the list at
`classicalmusiconly.com/list/100-essential-classical-music-works-515c86c8`
("100+ Essential Classical Music Works"), transcribed from a full-page capture of
that page (the page itself is a client-rendered app that could not be fetched
directly). Selection, rank order, composers, and forms come from that capture.
The list spans medieval to contemporary, so `data/eras.js` starts with a
Medieval & Renaissance era.

Prose (`why`, `context`) for 50 works was kept from the earlier build where the
work matched; the other 51 have shorter, newly written notes. Recording
recommendations (`best`, `alt`) are given only where the recommendation is
well established; 15 works have none yet and the UI omits the recording block for
them rather than showing a guess. Where the source list names a whole work but the
kept prose focuses on a part (Figaro overture, Vltava, Well-Tempered Clavier
Book I, Tristan prelude), the row says so.
Note: the source list prints Purcell's *Dido and Aeneas* as Z. 636; the standard
Zimmerman number is Z. 626, which this site uses.

## Local development

No build step. Serve the directory with any static file server and open it:

```
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploying

Push to `main` on GitHub with Pages enabled ("GitHub Actions" as the source) —
`.github/workflows/deploy.yml` handles the rest. No build artifacts, no
dependencies to install.
