// --- Strefa czasowa strony ---
// Licznik jest zakotwiczony w stałym przesunięciu UTC+02:00, a nie w czasie
// lokalnym przeglądarki. Dzięki temu (a) wszyscy widzą te same wartości i
// (b) zmiana czasu letni/zimowy nie przesuwa licznika o godzinę — w czasie
// lokalnym doba po zmianie ma 23 lub 25 godzin, więc reszta z dzielenia
// potrafiła pokazać "5d 23h" zamiast "6d 0h".
const SITE_UTC_OFFSET_HOURS = 2;
const SITE_OFFSET_MS = SITE_UTC_OFFSET_HOURS * 3600000;

// Moment odpowiadający podanej dacie "zegarowej" strony.
function siteTime(year, month, day, hours = 0, minutes = 0, seconds = 0) {
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds) - SITE_OFFSET_MS);
}

// Rozbicie moment -> pola kalendarzowe w strefie strony.
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
let currentLang = 'pl'; // Domyślny język

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
        // Funkcje dla opisów różnic (Biernik)
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
        // Angielski ma prostszą gramatykę dla biernika w tym kontekście
        daysAcc: (n) => n === 1 ? "day" : "days",
        hoursAcc: (n) => n === 1 ? "hour" : "hours",
        minutesAcc: (n) => n === 1 ? "minute" : "minutes",
        moment: "a moment"
    }
};

// --- Dane wydarzeń (wczytywane z data/events.json) ---
// Plik JSON trzyma czas trwania jako rozbicie na jednostki (np. { years: 3,
// months: 2 }), a "unitSeconds" definiuje ile sekund ma każda jednostka.
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

// Spłaszczenie danych do jednego języka (kształt oczekiwany przez resztę kodu)
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

// --- Budowa struktury porównań (tworzona raz, przebudowywana tylko po zmianie języka) ---
let comparisonEls = null;
let builtLang = null;

function buildComparisons(events) {
    const container = document.getElementById("comparisons");
    container.innerHTML = "";
    comparisonEls = events.map((event, i) => {
        const card = document.createElement("div");
        card.className = "card fade-up";
        card.style.animationDelay = `${Math.min(i * 60, 600)}ms`;
        card.innerHTML = `
            <div class="card-header d-flex justify-content-between align-items-center">
                <span class="fw-bold">${event.name}</span>
                <span class="percent-chip"></span>
            </div>
            <div class="card-body">
                <div class="d-flex align-items-center gap-3 mb-3">
                    <div class="progress flex-grow-1">
                        <div class="progress-bar" role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
                    </div>
                    <div class="medals-box fs-4 text-end"></div>
                </div>
                <p class="card-text small mb-1"></p>
                <small class="text-body-secondary">${event.desc}</small>
            </div>
        `;
        container.appendChild(card);
        return {
            badge: card.querySelector(".percent-chip"),
            bar: card.querySelector(".progress-bar"),
            medals: card.querySelector(".medals-box"),
            desc: card.querySelector(".card-text"),
        };
    });
    builtLang = currentLang;
}

// --- Główna logika ---
function updateCounter() {
    const t = translations[currentLang];
    const now = new Date();

    // Aktualizacja nagłówka i tytułu
    document.getElementById("main-header").textContent = t.mainTitle;
    document.getElementById("hero-tagline").textContent = t.pageTitle;
    document.getElementById("comparisons-eyebrow").textContent = currentLang === 'pl' ? "Porównania historyczne" : "Historical comparisons";
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

    // 1. Obliczanie czasu dla głównego licznika
    // Kolejne rocznice i "miesięcznice" liczone w kalendarzu strefy strony —
    // lata przestępne i różne długości miesięcy są więc uwzględnione.
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


    // Daily streaks
    const streakBaseDate = siteTime(2026, 6, 12);
    const streakDays = Math.floor((new Date()-streakBaseDate)/86400000);
    document.getElementById('genshin-streak').textContent=(816+Math.max(0,streakDays))+' '+(currentLang==='pl'?'dni':'days');
    document.getElementById('wuwa-streak').textContent=(674+Math.max(0,streakDays))+' '+(currentLang==='pl'?'dni':'days');
    document.getElementById('streak-title').textContent=currentLang==='pl'?'Serie dni w grach':'Daily Streaks';
    document.getElementById('checked-genshin').textContent=currentLang==='pl'?'Sprawdzono dzisiaj.':'Checked today.';
    document.getElementById('checked-wuwa').textContent=currentLang==='pl'?'Sprawdzono dzisiaj.':'Checked today.';


    // 2. Obliczanie porównań (dopiero gdy dane wydarzeń są już wczytane)
    if (!eventsData) return;

    const totalDiffSeconds = Math.floor((now - startDate) / 1000);
    let totalBronze = 0, totalSilver = 0, totalGold = 0;

    const events = getEvents(currentLang);

    // Zbuduj karty tylko raz (lub po zmianie języka). Odtwarzanie całego
    // innerHTML co sekundę wymuszało ponowne odgrywanie animacji kart.
    if (builtLang !== currentLang || !comparisonEls || comparisonEls.length !== events.length) {
        buildComparisons(events);
    }

    events.forEach((event, i) => {
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

        // Logika medali
        let medals = "";
        if (percent >= 100) { medals += "🥉"; totalBronze++; }
        if (percent >= 200) { medals += "🥈"; totalSilver++; totalBronze--; }
        if (percent >= 500) { medals += "🥇"; totalGold++; totalSilver--; }

        // Tekst opisu
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

        // Aktualizuj tylko zmienne wartości w istniejących elementach
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
// Licznik rusza natychmiast; porównania dołączają, gdy JSON zostanie wczytany.
updateCounter();
setInterval(updateCounter, 1000);

loadEvents()
    .then(updateCounter)
    .catch((error) => {
        console.error("Nie udało się wczytać data/events.json:", error);
        // Odsłoń statyczne podsumowanie — lepsze niż pusta sekcja porównań.
        document.documentElement.classList.replace("js", "no-js");
    });

