# czyacerixxznalazlprace.pl

A static joke site that counts how long **Acerixx** has been unemployed, and compares that
duration against historical events — wars, construction projects, presidencies, and Forrest
Gump's run. The longer the counter runs, the more medals it collects.

Live at <https://czyacerixxznalazlprace.pl/>.

The UI is bilingual (Polish by default, English via the toggle in the top-right corner).

## Pages

| Path         | What it is                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| `/`          | The main counter and the historical comparison cards.                       |
| `/dlc/`      | A standalone gag page: a button that runs away from the cursor. Not linked from the main page — you have to know it's there. |

## Project layout

```
.
├── index.html          # Main page markup (incl. a generated static summary — see below)
├── css/styles.css      # Main page styles (glassmorphism, aurora background, animations)
├── js/main.js          # Counter, i18n, comparison rendering
├── data/events.json    # The historical events being compared against
├── llms.txt            # Generated site summary for AI assistants
├── robots.txt          # Explicitly allows search and AI crawlers
├── sitemap.xml
├── tools/
│   └── build-agent-files.mjs   # Regenerates llms.txt + the static summary
├── DEPLOYMENT.md       # Server setup and the deploy workflow
├── .github/workflows/
│   └── deploy.yml      # Verify + rsync to the server on every push to main
└── dlc/
    ├── index.html      # "Kliknij, żeby Acerixx się umył!" page
    ├── css/styles.css
    └── js/main.js
```

Nothing is compiled and there are no dependencies to install — the repo deploys exactly as it
sits. `tools/build-agent-files.mjs` is a maintenance script you run by hand when the data
changes, not a build step. Bootstrap 5.3 and Google Fonts are pulled from a CDN at runtime.

## Running locally

`js/main.js` loads the event data with `fetch()`, which browsers block on `file://` URLs. Opening
`index.html` directly from disk will show the counter but leave the comparison section empty, so
serve the folder over HTTP instead:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static file server works.

## Adding or editing an event

All comparison data lives in `data/events.json` — no code changes needed.

```json
{
    "name": { "pl": "Budowa Wieży Eiffla", "en": "Construction of the Eiffel Tower" },
    "duration": { "years": 2, "months": 2 },
    "desc": {
        "pl": "Budowa Wieży Eiffla trwała 2 lata i 2 miesiące.",
        "en": "The construction of the Eiffel Tower took 2 years and 2 months."
    }
}
```

- **`name`** and **`desc`** both require a `pl` and an `en` string.
- **`duration`** is a breakdown into units rather than a raw number of seconds, so the
  arithmetic stays readable. Any combination of `years`, `months`, `days`, `hours`, `minutes`,
  and `seconds` is allowed; the values are summed.

After editing the file, regenerate the machine-readable copies so they don't drift:

```sh
node tools/build-agent-files.mjs
```

The `unitSeconds` block at the top of the file defines what each unit is worth:

```json
"unitSeconds": { "years": 31536000, "months": 2592000, "days": 86400, "hours": 3600, "minutes": 60, "seconds": 1 }
```

Note that a year is a flat 365 days and a month a flat 30 days. These are deliberate
approximations — the comparisons are a joke, not a calendar. If an event needs to be exact to
the second, give it a plain `{ "seconds": N }` duration instead (the John Paul II entry does
exactly this).

Cards render in the order they appear in the file.

## How the comparison works

The counter starts at **26 July 2023, 17:00** (`startDate` in `js/main.js`). That moment is
anchored to a **fixed UTC+02:00 offset**, not to the visitor's clock — so everyone sees the same
numbers, and the spring/autumn daylight-saving switch doesn't shift the hours tile by an hour.
Years and months are still counted on the real calendar, so leap days are handled correctly.

Every second, each event's progress is recomputed as `elapsed / event.duration`:

| Progress   | Progress bar                            | Medal |
| ---------- | --------------------------------------- | ----- |
| under 100% | green, filling toward 100%              | —     |
| 100–200%   | amber, refilling from the 100% mark     | 🥉    |
| over 200%  | red, refilling until 500%               | 🥈    |
| over 500%  | red, full                               | 🥇    |

A card shows every medal it has earned, so a long-surpassed event reads 🥉🥈🥇. The tally in the
bar under the counter instead credits each event once, at its highest medal.

### The percentages are approximate on purpose

The two sides of that division use different calendars. Elapsed time is exact real time, leap
days included. Event durations are idealised — a flat 365-day year and a flat 30-day month. So
any event specified in years or months is modelled a little shorter than its real calendar
span, and crosses its medal thresholds early: roughly 1–3 days from the missing leap days, plus
up to ~5 more where 30-day months are involved. Half the events are specified in days, hours or
seconds and are exact.

This is a joke site, so the drift is left in deliberately — a couple of days on an eight-year
bar is invisible. It is documented in `llms.txt` and in the page's static summary so that AI
assistants don't repeat the percentages as precise figures.

## Machine-readable output (AI assistants, crawlers)

The counter is drawn by JavaScript, so anything that fetches the page without running scripts —
ChatGPT, Gemini, Claude, search crawlers, `curl` — would otherwise see empty tiles and an empty
comparison list. Three things fix that:

- **A static summary inside `index.html`.** `<html>` ships with `class="no-js"` and an inline
  script immediately swaps it to `js`; CSS hides the summary whenever that swap happened. Real
  visitors never see it (no flash), while anything that does not execute scripts gets the start
  date, the medal thresholds, and all 24 events with durations and descriptions. It is also the
  fallback if `data/events.json` fails to load.
- **[`/llms.txt`](llms.txt)** — a Markdown summary aimed at language models, including how to
  compute the current value from the start date.
- **[`/data/events.json`](data/events.json)** — the raw data, self-contained: it carries the
  `startDate` alongside the events.

`index.html` also embeds schema.org JSON-LD describing the site and pointing at the JSON, and
`robots.txt` explicitly allows the major search and AI user agents.

All of the generated pieces come from one command:

```sh
node tools/build-agent-files.mjs
```

It reads `startDate` out of `js/main.js` and the events out of `data/events.json`, then rewrites
the block between the `BEGIN/END GENERATED static-summary` markers in `index.html`, plus
`llms.txt` and the `startDate` field in `data/events.json`. It is idempotent — running it twice
changes nothing.

## Deploying

Pushing to `main` deploys automatically: a GitHub Actions workflow verifies the repo and
`rsync`s it to the server over SSH. Setup, secrets and troubleshooting are in
[`DEPLOYMENT.md`](DEPLOYMENT.md).

There is nothing to compile, so deploying by hand is just copying the files to any static host.
The paths in `index.html` and `dlc/index.html` are relative, so the site also works from a
subdirectory.

## A note on language

The site's copy and the in-code comments are in Polish; this README and `CLAUDE.md` are in
English. Any new user-facing string needs both a Polish and an English version, or the language
toggle will show blanks.
