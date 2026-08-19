# CLAUDE.md

Guidance for Claude Code when working in this repository. See `README.md` for what the site is
and how the comparison logic behaves.

## Stack

Plain HTML, CSS, and vanilla JavaScript. **No build step, no package manager, no dependencies.**
Bootstrap 5.3 and Google Fonts come from a CDN at runtime. The repo deploys exactly as it sits.

The one script, `tools/build-agent-files.mjs`, is a hand-run maintenance task (plain Node, no
deps) — not a build step. Deployment never invokes it.

Do not introduce a bundler, a framework, TypeScript, or a `package.json` unless explicitly
asked. Keeping this a drop-on-a-server static site is the point.

## Running and verifying

The page fetches `data/events.json`, so `file://` will not work — always serve over HTTP:

```sh
python3 -m http.server 8000
```

To check a change actually renders (chromium is available locally):

```sh
chromium --headless --no-sandbox --virtual-time-budget=6000 --dump-dom http://127.0.0.1:8000/
```

Useful assertions on that DOM dump: 24 occurrences of `class="card fade-up"` (one per event),
non-empty `tile-*-val` spans, `class="js"` on `<html>`, and a populated `#global-medals`.

To check what a JS-less agent sees, `curl http://127.0.0.1:8000/` and read the raw HTML — it
should contain the full static summary. Chromium's `--disable-javascript` flag is ignored in
headless mode, and `--blink-settings=scriptEnabled=false` breaks `--screenshot`; to render the
no-JS view for real, serve the directory with a `Content-Security-Policy: script-src 'none'`
response header instead.

There is no test suite; a headless render plus `node --check js/main.js` is the verification
bar.

## Generated content — regenerate, never hand-edit

The site must stay readable to clients that do not run JavaScript (AI assistants, crawlers,
`curl`). That is handled by generated artifacts, all produced by:

```sh
node tools/build-agent-files.mjs
```

Sources of truth: `startDate` in `js/main.js`, and the event list in `data/events.json`.
Generated from them: the `BEGIN/END GENERATED static-summary` block in `index.html` (static
summary + JSON-LD), `llms.txt`, and the `startDate` field written into `data/events.json`.

**Run it after changing any event or the start date**, and never edit inside those markers by
hand — the next run overwrites the edit. The script is idempotent, so running it when nothing
changed is safe and produces no diff.

`robots.txt` and `sitemap.xml` are maintained by hand.

## How the no-JS fallback works

`<html>` is served with `class="no-js"`; an inline script at the top of `<head>` swaps it to
`js` before first paint. `css/styles.css` then hides `#static-summary` under `html.js`, and
hides the JS-populated regions (`#counter`, `#game-streaks`, `#global-medals`, `#comparisons`,
`.lang-btn`) under `html.no-js`. If the `data/events.json` fetch fails, `main.js` flips the
class back to `no-js`, which reveals the static summary instead of leaving a blank section.

Keep both halves in mind: anything added to the live UI that would render empty without JS
should be hidden under `html.no-js`, and any new data shown to users should reach the static
summary via the generator.

## Conventions

- **4-space indentation everywhere, no tabs, no trailing whitespace.** All seven source files
  are currently clean — keep them that way. One apparent exception: the continuation lines in
  the `#global-medals` template literal near the end of `updateCounter()` are indented to align
  as *string content*, not code. Leave them alone.
- **UI copy and code comments are in Polish.** Match the surrounding language when editing; do
  not translate existing Polish comments to English.
- **Every user-facing string needs both `pl` and `en`**, either in the `translations` object in
  `js/main.js` or as a `{ "pl": ..., "en": ... }` pair in `data/events.json`.

## Things that will bite you

- **`toggleLanguage()` must stay a global function declaration.** `index.html` calls it from an
  inline `onclick`. Do not convert `js/main.js` to a module, add `defer`, or wrap it in an IIFE
  without also rewiring that handler.
- **`updateCounter()` runs once per second.** It mutates the text of existing nodes on purpose.
  Do not rebuild `#comparisons` markup inside it — regenerating `innerHTML` every tick used to
  restart the card entry animations. `buildComparisons()` is called only on first load and on
  language change (guarded by `builtLang`).
- **Event data belongs in `data/events.json` only.** `getEvents(lang)` just flattens that data
  to one language. Never hardcode an event back into `js/main.js`.
- **`duration` in the JSON is a unit breakdown, not seconds.** `durationToSeconds()` multiplies
  it out using the file's own `unitSeconds` map (365-day years, 30-day months). If you change
  `unitSeconds`, every event's duration changes with it.
- **Comparisons render asynchronously.** `updateCounter()` returns early while `eventsData` is
  still `null`, so the counter and streaks paint before the JSON lands. Anything added below
  that early return will not run until the fetch resolves.
- **Time is anchored to a fixed UTC+02:00 offset, not to the visitor's clock.** `js/main.js`
  defines `SITE_UTC_OFFSET_HOURS` plus `siteTime()` / `sitePartsOf()` helpers, and all calendar
  math goes through them. Do not "simplify" these back to `new Date(y, m, d, ...)`: local-time
  arithmetic reintroduces a daylight-saving bug where a whole number of days after an
  anniversary displays as `5d 23h` or `6d 1h` instead of `6d 0h`. Leap years and real month
  lengths are handled correctly by this code — that part is not approximate.
- **`tools/build-agent-files.mjs` parses two lines of `js/main.js` by regex**:
  `const startDate = siteTime(...)` and `const SITE_UTC_OFFSET_HOURS = N;`. Changing the shape
  of either line breaks the generator (loudly — it throws).
- **The comparison percentages are deliberately imprecise, and this is documented, not a bug.**
  Elapsed time is exact, but `unitSeconds` models a year as 365 days and a month as 30 days, so
  year- and month-based events hit their medal thresholds a few days early. This was reviewed
  and intentionally kept. If you ever do change it, update the caveat text in
  `tools/build-agent-files.mjs` (it feeds `llms.txt`, the static summary, and the JSON-LD) and
  the "percentages are approximate" section of `README.md`.
- **The daily-streak numbers are fabricated.** They are hardcoded baselines (816 and 674) that
  auto-increment from `streakBaseDate` in `js/main.js`. They are not read from any API — don't
  try to "fix" them by adding one.
- **Language choice is not persisted.** There is no `localStorage`; a reload returns to Polish.
  That is the current behavior, not a bug to fix silently.
- **`dlc/` is deliberately self-contained**, with its own `css/` and `js/`. Its stylesheet
  repeats some custom properties from the main one. Do not merge the two stylesheets or hoist
  shared assets — the pages are independent.

## Styling notes

- The palette lives in `:root` custom properties at the top of `css/styles.css` (`--bg-0`,
  `--ink`, `--red`, `--violet`, …). Use those tokens rather than new literal colors.
- Section-level `/* --- ... --- */` comments organize the stylesheet; add new rules to the
  matching section instead of appending at the end.
- `@media (prefers-reduced-motion: reduce)` near the bottom disables the animations. Any new
  animation should be disabled there too.
- The page is dark-only (`data-bs-theme="dark"` on `<html>`). There is no light theme.
