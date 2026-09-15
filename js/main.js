// --- Strefa czasowa strony ---
// Stałe UTC+02:00, nie czas lokalny: wszyscy widzą tę samą wartość, a doba po
// zmianie czasu nie ma 23/25 godzin i nie robi z "6d 0h" — "5d 23h".
const SITE_UTC_OFFSET_HOURS = 2;
const SITE_OFFSET_MS = SITE_UTC_OFFSET_HOURS * 3600000;

// Argumenty to czas strony, nie UTC.
function siteTime(year, month, day, hours = 0, minutes = 0, seconds = 0) {
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds) - SITE_OFFSET_MS);
}

function sitePartsOf(date) {
    const shifted = new Date(date.getTime() + SITE_OFFSET_MS);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth(),
        day: shifted.getUTCDate(),
        hours: shifted.getUTCHours(),
        minutes: shifted.getUTCMinutes(),
        seconds: shifted.getUTCSeconds()
    };
}

const startDate = siteTime(2023, 6, 26, 17, 0, 0);
let currentLang = 'pl';

// --- Konfiguracja języków ---
const translations = {
    pl: {
        mainTitle: "NIE",
        pageTitle: "Czy Acerixx znalazł pracę?",
        counterPrefix: "Bezrobotny od",
        counterAnd: "i",
        medalBronze: "Brąz",
        medalSilver: "Srebro",
        medalGold: "Złoto",
        repoLabel: "Kod źródłowy na GitHubie",
        sortLabel: "Sortuj",
        sortAria: "Sortuj porównania",
        sortOptions: {
            default: "Domyślnie",
            lengthDesc: "Najdłuższe",
            lengthAsc: "Najkrótsze",
            nameAsc: "A → Z",
            nameDesc: "Z → A",
            medalAsc: "Blisko medalu",
            medalDesc: "Daleko od medalu"
        },
        labelSurpassed: (ratio, time) => `Acerixx jest bezrobotny <span class="text-danger fw-bold">${ratio}x dłużej</span> niż trwało to wydarzenie. Wyprzedza je o ok. ${time}.`,
        labelPending: (time, percent) => `To wydarzenie trwało jeszcze <span class="text-success fw-bold">${time}</span> dłużej. Acerixx osiągnął ${percent}% jego długości.`,
        forms: {
            years: (n) => n === 1 ? "roku" : "lat",
            months: (n) => n === 1 ? "miesiąca" : "miesięcy",
            days: (n) => n === 1 ? "dzień" : "dni",
            hours: (n) => n === 1 ? "godziny" : "godzin",
            minutes: (n) => n === 1 ? "minuty" : "minut",
            seconds: (n) => n === 1 ? "sekundy" : "sekund"
        },
        // Biernik — do opisów różnic.
        daysAcc: (n) => n === 1 ? "dzień" : "dni",
        hoursAcc: (n) => {
            if (n === 1) return "godzinę";
            const d = n % 10, dd = n % 100;
            return (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? "godziny" : "godzin";
        },
        minutesAcc: (n) => {
            if (n === 1) return "minutę";
            const d = n % 10, dd = n % 100;
            return (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? "minuty" : "minut";
        },
        moment: "chwilę"
    },
    en: {
        mainTitle: "NO",
        pageTitle: "Has Acerixx found a job?",
        counterPrefix: "Unemployed for",
        counterAnd: "and",
        medalBronze: "Bronze",
        medalSilver: "Silver",
        medalGold: "Gold",
        repoLabel: "Source code on GitHub",
        sortLabel: "Sort",
        sortAria: "Sort comparisons",
        sortOptions: {
            default: "Default",
            lengthDesc: "Longest first",
            lengthAsc: "Shortest first",
            nameAsc: "A → Z",
            nameDesc: "Z → A",
            medalAsc: "Medal soonest",
            medalDesc: "Medal latest"
        },
        labelSurpassed: (ratio, time) => `Acerixx has been unemployed <span class="text-danger fw-bold">${ratio}x longer</span> than this event lasted. He surpassed it by approx. ${time}.`,
        labelPending: (time, percent) => `This event lasted <span class="text-success fw-bold">${time}</span> longer. Acerixx reached ${percent}% of its duration.`,
        forms: {
            years: (n) => n === 1 ? "year" : "years",
            months: (n) => n === 1 ? "month" : "months",
            days: (n) => n === 1 ? "day" : "days",
            hours: (n) => n === 1 ? "hour" : "hours",
            minutes: (n) => n === 1 ? "minute" : "minutes",
            seconds: (n) => n === 1 ? "second" : "seconds"
        },
        // Angielski nie odmienia — formy jak wyżej.
        daysAcc: (n) => n === 1 ? "day" : "days",
        hoursAcc: (n) => n === 1 ? "hour" : "hours",
        minutesAcc: (n) => n === 1 ? "minute" : "minutes",
        moment: "a moment"
    }
};

// --- Dane wydarzeń (wczytywane z data/events.json) ---
// "duration" w JSON-ie to rozbicie na jednostki, nie sekundy — przelicza je
// "unitSeconds" z tego samego pliku.
let eventsData = null;

function durationToSeconds(duration, unitSeconds) {
    return Object.entries(duration).reduce((sum, [unit, value]) => sum + value * unitSeconds[unit], 0);
}

async function loadEvents() {
    const response = await fetch("data/events.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    eventsData = data.events.map((event) => ({
        name: event.name,
        desc: event.desc,
        duration: durationToSeconds(event.duration, data.unitSeconds)
    }));
}

function getEvents(lang) {
    return eventsData.map((event) => ({
        name: event.name[lang],
        duration: event.duration,
        desc: event.desc[lang]
    }));
}

// --- Logika formatowania czasu ---
function formatDuration(totalSeconds, lang) {
    const t = translations[lang];
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    let result = [];
    if (days > 0) result.push(`${days} ${t.daysAcc(days)}`);
    if (hours > 0) result.push(`${hours} ${t.hoursAcc(hours)}`);
    if (minutes > 0 && days < 10) result.push(`${minutes} ${t.minutesAcc(minutes)}`);
    return result.join(" ") || t.moment;
}

// --- Sortowanie porównań ---
// Progi medali jako wielokrotności długości wydarzenia: 🥉 100%, 🥈 200%, 🥇 500%.
const MEDAL_THRESHOLDS = [1, 2, 5];

// Infinity dla wydarzenia po złocie — odejmowanie dałoby NaN, więc porównanie
// przez < zamiast różnicy.
function secondsToNextMedal(event, elapsed) {
    const next = MEDAL_THRESHOLDS.map((multiple) => multiple * event.duration).find((threshold) => threshold > elapsed);
    return next === undefined ? Infinity : next - elapsed;
}

function byNextMedal(a, b) {
    if (a.toNextMedal === b.toNextMedal) return 0;
    return a.toNextMedal < b.toNextMedal ? -1 : 1;
}

const sortComparators = {
    default: null,
    lengthDesc: (a, b) => b.duration - a.duration,
    lengthAsc: (a, b) => a.duration - b.duration,
    nameAsc: (a, b) => a.name.localeCompare(b.name, currentLang),
    nameDesc: (a, b) => b.name.localeCompare(a.name, currentLang),
    medalAsc: byNextMedal,
    medalDesc: (a, b) => byNextMedal(b, a)
};

let sortMode = "default";
let sortMenuLang = null;

function sortEvents(events, elapsed) {
    const comparator = sortComparators[sortMode];
    if (!comparator) return events;
    return events
        .map((event) => ({ ...event, toNextMedal: secondsToNextMedal(event, elapsed) }))
        .sort(comparator);
}

function buildSortMenu() {
    const menu = document.getElementById("sort-menu");
    menu.innerHTML = "";
    Object.keys(sortComparators).forEach((mode) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "dropdown-item";
        item.dataset.sort = mode;
        item.textContent = translations[currentLang].sortOptions[mode];
        item.addEventListener("click", () => setSortMode(mode));
        const li = document.createElement("li");
        li.appendChild(item);
        menu.appendChild(li);
    });
    sortMenuLang = currentLang;
}

function updateSortUi() {
    const t = translations[currentLang];
    const toggle = document.getElementById("sort-toggle");
    document.getElementById("sort-label").textContent = sortMode === "default" ? t.sortLabel : t.sortOptions[sortMode];
    toggle.setAttribute("aria-label", `${t.sortAria}: ${t.sortOptions[sortMode]}`);
    document.querySelectorAll("#sort-menu .dropdown-item").forEach((item) => {
        const active = item.dataset.sort === sortMode;
        item.classList.toggle("active", active);
        if (active) {
            item.setAttribute("aria-current", "true");
        } else {
            item.removeAttribute("aria-current");
        }
    });
}

function setSortMode(mode) {
    if (mode === sortMode) return;
    sortMode = mode;
    updateSortUi();
    updateCounter();
}

// --- Budowa struktury porównań ---
// Markup karty mieszka w <template id="comparison-card"> w index.html.
let comparisonEls = null;
let builtLang = null;
let builtSort = null;
let orderedEvents = null;

function buildComparisons(events) {
    const container = document.getElementById("comparisons");
    const template = document.getElementById("comparison-card");
    container.innerHTML = "";
    comparisonEls = events.map((event, i) => {
        const card = template.content.firstElementChild.cloneNode(true);
        card.style.animationDelay = `${Math.min(i * 60, 600)}ms`;
        // textContent, nie innerHTML — events.json nie jest traktowany jak HTML.
        card.querySelector(".event-name").textContent = event.name;
        card.querySelector(".event-desc").textContent = event.desc;
        container.appendChild(card);
        return {
            badge: card.querySelector(".percent-chip"),
            bar: card.querySelector(".progress-bar"),
            medals: card.querySelector(".medals-box"),
            desc: card.querySelector(".card-text"),
        };
    });
    builtLang = currentLang;
    builtSort = sortMode;
}

// --- Główna logika ---
function updateCounter() {
    const t = translations[currentLang];
    const now = new Date();

    document.getElementById("main-header").textContent = t.mainTitle;
    document.getElementById("hero-tagline").textContent = t.pageTitle;
    document.getElementById("comparisons-eyebrow").textContent = currentLang === 'pl' ? "Porównania historyczne" : "Historical comparisons";
    document.getElementById("repo-link").setAttribute("aria-label", t.repoLabel);
    if (sortMenuLang !== currentLang) {
        buildSortMenu();
        updateSortUi();
    }
    document.title = t.pageTitle;

    const grid = document.getElementById("counter");
    const msg = document.getElementById("counter-msg");
    if (now < startDate) {
        grid.hidden = true;
        msg.hidden = false;
        msg.textContent = currentLang === 'pl' ? "Jeszcze się nie zaczęło" : "Has not started yet";
        return;
    }
    grid.hidden = false;
    msg.hidden = true;

    // Rocznice liczone w kalendarzu strefy strony — lata przestępne i różne
    // długości miesięcy wychodzą z tego same.
    const from = sitePartsOf(startDate);
    let years = 0, months = 0;
    let anniversary = startDate;

    for (;;) {
        const next = siteTime(from.year + years + 1, from.month, from.day, from.hours, from.minutes, from.seconds);
        if (next > now) break;
        anniversary = next;
        years++;
    }
    for (;;) {
        const next = siteTime(from.year + years, from.month + months + 1, from.day, from.hours, from.minutes, from.seconds);
        if (next > now) break;
        anniversary = next;
        months++;
    }

    const diffMs = now - anniversary;
    const totalSecondsRemaining = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSecondsRemaining / 86400);
    const hours = Math.floor((totalSecondsRemaining % 86400) / 3600);
    const minutes = Math.floor((totalSecondsRemaining % 3600) / 60);
    const seconds = totalSecondsRemaining % 60;

    const setTile = (key, value, unit) => {
        document.getElementById(`tile-${key}-val`).textContent = value;
        document.getElementById(`tile-${key}-unit`).textContent = unit;
    };
    setTile("years", years, t.forms.years(years));
    setTile("months", months, t.forms.months(months));
    setTile("days", days, t.forms.days(days));
    setTile("hours", hours, t.forms.hours(hours));
    setTile("minutes", minutes, t.forms.minutes(minutes));
    setTile("seconds", seconds, t.forms.seconds(seconds));


    // Serie są zmyślone: baseline + dni od streakBaseDate, nie z żadnego API.
    const streakBaseDate = siteTime(2026, 6, 12);
    const streakDays = Math.floor((new Date()-streakBaseDate)/86400000);
    document.getElementById('genshin-streak').textContent=(816+Math.max(0,streakDays))+' '+(currentLang==='pl'?'dni':'days');
    document.getElementById('wuwa-streak').textContent=(674+Math.max(0,streakDays))+' '+(currentLang==='pl'?'dni':'days');
    document.getElementById('streak-title').textContent=currentLang==='pl'?'Serie dni w grach':'Daily Streaks';
    document.getElementById('checked-genshin').textContent=currentLang==='pl'?'Sprawdzono dzisiaj.':'Checked today.';
    document.getElementById('checked-wuwa').textContent=currentLang==='pl'?'Sprawdzono dzisiaj.':'Checked today.';


    // Wszystko poniżej czeka na JSON — pierwsze tyknięcia wychodzą tutaj.
    if (!eventsData) return;

    const totalDiffSeconds = Math.floor((now - startDate) / 1000);
    let totalBronze = 0, totalSilver = 0, totalGold = 0;

    const events = getEvents(currentLang);

    // Raz na język i sortowanie: odtwarzanie innerHTML co sekundę restartowało
    // animacje kart. Kolejność "do medalu" zależy od czasu, więc ustalana jest
    // tu razem z kartami — inaczej tasowałaby je w trakcie czytania.
    if (builtLang !== currentLang || builtSort !== sortMode || !comparisonEls || comparisonEls.length !== events.length) {
        orderedEvents = sortEvents(events, totalDiffSeconds);
        buildComparisons(orderedEvents);
    }

    orderedEvents.forEach((event, i) => {
        const els = comparisonEls[i];
        const percent = (totalDiffSeconds / event.duration) * 100;
        let barWidth = 0, barClass = "";

        if (percent < 100) {
            barClass = "bg-success";
            barWidth = percent;
        } else if (percent < 200) {
            barClass = "bg-warning";
            barWidth = percent - 100;
        } else {
            barClass = "bg-glow-red";
            if (percent >= 500) {
                barWidth = 100;
            } else {
                barWidth = ((percent - 200) / 300) * 100;
            }
        }

        let medals = "";
        if (percent >= 100) { medals += "🥉"; totalBronze++; }
        if (percent >= 200) { medals += "🥈"; totalSilver++; totalBronze--; }
        if (percent >= 500) { medals += "🥇"; totalGold++; totalSilver--; }

        let descText = "";
        if (totalDiffSeconds > event.duration) {
            const diff = totalDiffSeconds - event.duration;
            const ratio = (totalDiffSeconds / event.duration).toFixed(2);
            descText = t.labelSurpassed(ratio, formatDuration(diff, currentLang));
        } else {
            const diff = event.duration - totalDiffSeconds;
            const progress = percent.toFixed(2);
            descText = t.labelPending(formatDuration(diff, currentLang), progress);
        }

        els.badge.textContent = `${percent.toFixed(1)}%`;
        els.bar.className = `progress-bar ${barClass}`;
        els.bar.style.width = `${barWidth}%`;
        els.bar.setAttribute("aria-valuenow", barWidth);
        els.medals.textContent = medals;
        els.desc.innerHTML = descText;
    });

    document.getElementById("global-medals").innerHTML =
        `<span title="${t.medalBronze}">${totalBronze}x 🥉</span>
         <span title="${t.medalSilver}" class="ms-3">${totalSilver}x 🥈</span>
         <span title="${t.medalGold}" class="ms-3">${totalGold}x 🥇</span>`;
}

function toggleLanguage() {
    currentLang = currentLang === 'pl' ? 'en' : 'pl';
    const btn = document.getElementById('lang-toggle');
    btn.textContent = currentLang === 'pl' ? 'EN' : 'PL';
    document.documentElement.lang = currentLang;
    updateCounter();
}

// --- Start ---
// Tyknięcia z requestAnimationFrame, nie setInterval: w karcie w tle timery są
// dławione do ~1/min, więc po powrocie licznik przez chwilę pokazywał
// nieaktualny czas. Cena: bez klatek (headless, prerender) rysuje się raz i stoi.
let counterFrame = null;
let renderedSecond = null;

function stopCounterAnimation() {
    if (counterFrame !== null) {
        cancelAnimationFrame(counterFrame);
        counterFrame = null;
    }
}

function renderCounterFrame() {
    counterFrame = null;
    if (document.hidden) return;

    const currentSecond = Math.floor(Date.now() / 1000);
    if (currentSecond !== renderedSecond) {
        renderedSecond = currentSecond;
        updateCounter();
    }

    counterFrame = requestAnimationFrame(renderCounterFrame);
}

function startCounterAnimation() {
    stopCounterAnimation();
    renderedSecond = null;
    renderCounterFrame();
}

function handleVisibilityChange() {
    if (document.hidden) {
        stopCounterAnimation();
    } else {
        startCounterAnimation();
    }
}

document.addEventListener("visibilitychange", handleVisibilityChange);
window.addEventListener("pageshow", startCounterAnimation);
startCounterAnimation();

loadEvents()
    .then(updateCounter)
    .catch((error) => {
        console.error("Nie udało się wczytać data/events.json:", error);
        // Odsłoń statyczne podsumowanie — lepsze niż pusta sekcja porównań.
        document.documentElement.classList.replace("js", "no-js");
    });

