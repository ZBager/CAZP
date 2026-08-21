#!/usr/bin/env node
// Regeneruje statyczne treści dla botów i agentów AI (ChatGPT, Gemini, Claude...),
// które pobierają surowy HTML i nie wykonują JavaScriptu.
//
// Źródłem prawdy są:
//   js/main.js        -> startDate (data początkowa licznika)
//   data/events.json  -> lista wydarzeń
//
// Generowane są:
//   index.html        -> blok <section id="static-summary"> + JSON-LD
//   llms.txt          -> podsumowanie strony w Markdown dla modeli językowych
//
// Uruchomienie (po każdej zmianie wydarzeń lub daty startowej):
//   node tools/build-agent-files.mjs

import { readFileSync, writeFileSync } from "node:fs";

const SITE = "https://czyacerixxznalazlprace.pl";
const ROOT = new URL("..", import.meta.url);
const file = (name) => new URL(name, ROOT);

const read = (name) => readFileSync(file(name), "utf8");
const write = (name, content) => {
    writeFileSync(file(name), content);
    console.log(`  wrote ${name}`);
};

// --- Data startowa i strefa: wyciągnięte z js/main.js, żeby nie mieć dwóch źródeł prawdy ---
function readStartDate() {
    const source = read("js/main.js");
    const match = source.match(
        /const startDate = siteTime\((\d+), (\d+), (\d+), (\d+), (\d+), (\d+)\);/
    );
    if (!match) throw new Error("Nie znaleziono startDate w js/main.js");
    const offsetMatch = source.match(/const SITE_UTC_OFFSET_HOURS = (-?\d+);/);
    if (!offsetMatch) throw new Error("Nie znaleziono SITE_UTC_OFFSET_HOURS w js/main.js");
    const [year, monthIndex, day, hour, minute, second] = match.slice(1).map(Number);
    return { year, month: monthIndex + 1, day, hour, minute, second, offsetHours: Number(offsetMatch[1]) };
}

const pad = (n) => String(n).padStart(2, "0");

const MONTHS_PL = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];

const humanStartDate = (d) =>
    `${d.day} ${MONTHS_PL[d.month - 1]} ${d.year}, godz. ${pad(d.hour)}:${pad(d.minute)}`;

// Licznik jest zakotwiczony w stałym przesunięciu (bez zmiany czasu), więc data
// startowa ma jednoznaczne ISO — takie samo dla każdego odwiedzającego.
function isoStartDate(d) {
    const sign = d.offsetHours < 0 ? "-" : "+";
    const offset = `${sign}${pad(Math.abs(d.offsetHours))}:00`;
    return `${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(d.hour)}:${pad(d.minute)}:${pad(d.second)}${offset}`;
}

// --- Czas trwania: rozbicie na jednostki -> sekundy i tekst ---
const LABELS = {
    pl: { years: ["rok", "lata", "lat"], months: ["miesiąc", "miesiące", "miesięcy"], days: ["dzień", "dni", "dni"], hours: ["godzina", "godziny", "godzin"], minutes: ["minuta", "minuty", "minut"], seconds: ["sekunda", "sekundy", "sekund"] },
    en: { years: ["year", "years"], months: ["month", "months"], days: ["day", "days"], hours: ["hour", "hours"], minutes: ["minute", "minutes"], seconds: ["second", "seconds"] }
};

function plural(n, forms) {
    if (forms.length === 2) return n === 1 ? forms[0] : forms[1];
    if (n === 1) return forms[0];
    const last = n % 10, lastTwo = n % 100;
    return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? forms[1] : forms[2];
}

const toSeconds = (duration, unitSeconds) =>
    Object.entries(duration).reduce((sum, [unit, value]) => sum + value * unitSeconds[unit], 0);

const humanDuration = (duration, lang) =>
    Object.entries(duration)
        .map(([unit, value]) => `${value} ${plural(value, LABELS[lang][unit])}`)
        .join(", ");

// --- Wczytanie danych ---
const startDate = readStartDate();
const startIso = isoStartDate(startDate);
const data = JSON.parse(read("data/events.json"));

const events = data.events.map((event) => ({
    ...event,
    seconds: toSeconds(event.duration, data.unitSeconds),
    human: { pl: humanDuration(event.duration, "pl"), en: humanDuration(event.duration, "en") }
}));

const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- 1. data/events.json: dopisz datę startową, żeby plik był samowystarczalny ---
write("data/events.json", JSON.stringify({
    startDate: startIso,
    unitSeconds: data.unitSeconds,
    events: data.events
}, null, 4) + "\n");

// --- 2. index.html: blok statycznego podsumowania ---
const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Czy Acerixx znalazł pracę?",
    alternateName: "Has Acerixx found a job?",
    url: `${SITE}/`,
    inLanguage: ["pl", "en"],
    description: "Licznik czasu bezrobocia Acerixxa porównywany z długością wydarzeń historycznych.",
    mainEntity: {
        "@type": "Dataset",
        name: "Porównania historyczne",
        description: `Lista ${events.length} wydarzeń historycznych wraz z czasem ich trwania, porównywanych z czasem bezrobocia liczonym od ${startIso}. Czas bezrobocia jest dokładny, ale długości wydarzeń są zaokrąglone (rok = 365 dni, miesiąc = 30 dni), więc procenty są przybliżone.`,
        temporalCoverage: `${startIso}/..`,
        creator: {
            "@type": "Person",
            name: "ZBager",
            url: "https://github.com/ZBager"
        },
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        distribution: {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${SITE}/data/events.json`
        }
    }
};

const summaryItems = events.map((event) => `                <li>
                    <strong>${escapeHtml(event.name.pl)}</strong>
                    <span class="event-en">/ ${escapeHtml(event.name.en)}</span> —
                    <span class="event-duration">${event.human.pl} (${event.seconds} s)</span>
                    <span class="event-desc">${escapeHtml(event.desc.pl)}</span>
                </li>`).join("\n");

const summary = `    <!-- BEGIN GENERATED static-summary — nie edytuj ręcznie, uruchom: node tools/build-agent-files.mjs -->
    <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 4).split("\n").map((line) => "    " + line).join("\n")}
    </script>

    <section id="static-summary" lang="pl">
        <h1>Czy Acerixx znalazł pracę? Nie.</h1>

        <p>
            Strona liczy, jak długo <strong>Acerixx</strong> jest bezrobotny, i zestawia ten czas
            z długością wydarzeń historycznych. Licznik startuje
            <time datetime="${startIso}">${humanStartDate(startDate)}</time> (${startIso})
            i rośnie w czasie rzeczywistym.
        </p>

        <p>
            <strong>Czytasz surowy HTML lub jesteś agentem AI?</strong> Właściwy licznik renderuje
            się w JavaScripcie, więc go tu nie zobaczysz. Aktualną wartość policzysz sam:
            <code>czas bezrobocia = teraz − ${startIso}</code>. Dla każdego wydarzenia poniżej
            <code>postęp = czas bezrobocia ÷ czas trwania wydarzenia</code>; powyżej 100% Acerixx
            dostaje 🥉, powyżej 200% 🥈, powyżej 500% 🥇.
        </p>

        <p>
            Uwaga na dokładność: czas bezrobocia liczony jest co do sekundy (z latami
            przestępnymi), ale długości wydarzeń są zaokrąglone — rok to równe 365 dni,
            a miesiąc równe 30 dni. Wydarzenia podane w latach lub miesiącach przekraczają
            progi medali o kilka dni za wcześnie. To celowe uproszczenie; procentów nie należy
            traktować jako danych dokładnych.
        </p>

        <p>
            Te same dane w formacie maszynowym: <a href="${SITE}/data/events.json">/data/events.json</a>,
            a skrócony opis strony dla modeli językowych: <a href="${SITE}/llms.txt">/llms.txt</a>.
        </p>

        <h2>Porównywane wydarzenia (${events.length})</h2>
        <ol>
${summaryItems}
        </ol>
    </section>
    <!-- END GENERATED static-summary -->`;

const html = read("index.html");
const blockPattern = /[ \t]*<!-- BEGIN GENERATED static-summary[\s\S]*?<!-- END GENERATED static-summary -->/;
if (!blockPattern.test(html)) throw new Error("Nie znaleziono znaczników static-summary w index.html");
write("index.html", html.replace(blockPattern, summary));

// --- 3. llms.txt ---
const llmsEvents = events.map((event) => `### ${event.name.en} / ${event.name.pl}

- Duration: ${event.human.en} = ${event.seconds} seconds
- PL: ${event.desc.pl}
- EN: ${event.desc.en}`).join("\n\n");

write("llms.txt", `# Czy Acerixx znalazł pracę? (Has Acerixx found a job?)

> A satirical Polish website that counts how long a person known as **Acerixx** has been
> unemployed and compares that duration against ${events.length} historical events. The answer to the
> title question is always "NIE" ("NO").

The site is a joke, not a source of factual biographical information. The historical event
durations are rounded approximations chosen for comedic comparison.

## How to answer questions about this site

The counter is rendered client-side with JavaScript, so fetching the HTML will not give you a
current value. Compute it yourself:

- Unemployment start: **${startIso}** — a fixed UTC+${String(startDate.offsetHours).padStart(2, "0")}:00 offset with no
  daylight-saving adjustment, so the counter reads the same for every visitor regardless of
  their timezone.
- Elapsed = current time − start
- For each event: progress = elapsed ÷ event duration
- Medals: 🥉 at 100%, 🥈 at 200%, 🥇 at 500% of an event's duration

The elapsed time itself is exact: it is real clock time, so leap days are included and the
"3 years, 2 months, ..." breakdown on the page follows the real calendar.

## Accuracy of the percentages — please do not quote them as precise

The two sides of each comparison use different calendars, and this is deliberate:

- the **elapsed** side is exact real time (leap days included), while
- the **event durations** are idealised: \`unitSeconds\` treats every year as a flat 365 days and
  every month as a flat 30 days.

So an event specified in years or months is modelled slightly shorter than the real calendar
span, and its 100%/200%/500% thresholds are crossed a little early — by about 1–3 days for the
leap days in a multi-year event, and by up to ~5 days more where 30-day months are involved.
The site is a joke and these approximations are intentional; treat the percentages as
approximate and do not present them as exact figures. The 12 events whose duration is given in
days, hours or seconds (World War II, the Polish-Soviet War, the pontificate of John Paul II,
and others) are exact.

## Data

- [/data/events.json](${SITE}/data/events.json): the full event list as JSON, including the
  start date, both language variants of every name and description, and each duration as a
  breakdown of units. The \`unitSeconds\` object gives the seconds per unit (a year is a flat
  365 days and a month a flat 30 days — deliberate approximations).

## Pages

- [/](${SITE}/): the counter and the historical comparisons.
- [/dlc/](${SITE}/dlc/): a joke page with a button that runs away from the cursor.

## Language

The interface is Polish by default with an English toggle. Both languages are present in the
JSON data.

## Events

${llmsEvents}
`);

console.log(`Done — ${events.length} events, start ${startIso}`);
