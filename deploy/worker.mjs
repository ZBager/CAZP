// Cloudflare Worker: `curl czyacerixxznalazlprace.pl` ma wypisać "Nie." i nic
// poza tym. Reszta świata dostaje niezmieniony HTML z serwera.
//
// Kopia kanoniczna — rsync tu nie sięga (workflow wyklucza deploy/), na brzeg
// sieci trafia wklejona ręcznie. Patrz DEPLOYMENT.md, "The terminal answer".

// Biała lista i ma taka zostać: tylko narzędzia odpalane ręcznie w terminalu.
// python-requests czy Go-http-client to boty i agenci AI — tym należy się pełne
// statyczne podsumowanie, nie cztery bajty.
const CLI_AGENTS = /\b(curl|wget|httpie|xh|lwp-request)\b/i;

const ANSWER = { pl: "Nie.\n", en: "No.\n" };

// curl nie wysyła Accept-Language, więc domyślnie polski.
function plainAnswer(request) {
    const english = /^en\b/i.test(request.headers.get("accept-language") || "");
    const body = request.method === "HEAD" ? null : (english ? ANSWER.en : ANSWER.pl);
    return new Response(body, {
        headers: {
            "content-type": "text/plain; charset=utf-8",
            // Cache Cloudflare ignoruje Vary — bez no-store "Nie." trafiłoby
            // do przeglądarki.
            "cache-control": "no-store",
            "vary": "user-agent, accept, accept-language"
        }
    });
}

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const accept = request.headers.get("accept") || "";
        const agent = request.headers.get("user-agent") || "";

        // Kto prosi o HTML, dostaje HTML — przeglądarki odpadają przed
        // User-Agentem, a curl -H 'Accept: text/html' zwraca normalną stronę.
        const wantsHtml = accept.includes("text/html");
        const isCli = !wantsHtml && CLI_AGENTS.test(agent);
        const isRoot = url.pathname === "/" || url.pathname === "/index.html";
        const isRead = request.method === "GET" || request.method === "HEAD";

        // Tylko strona główna; /data/events.json, /llms.txt i /dlc/ bez zmian.
        if (isCli && isRoot && isRead) return plainAnswer(request);

        // HTTPS wymusza Worker, bo "Always Use HTTPS" działa wcześniej niż
        // Workers i odcięłoby curl-a od odpowiedzi powyżej. Ma być wyłączone.
        if (url.protocol === "http:") {
            url.protocol = "https:";
            return Response.redirect(url.toString(), 301);
        }

        return fetch(request);
    }
};
