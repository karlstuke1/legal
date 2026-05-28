/**
 * PARLAMENT URL sanitization
 *
 * parlament.gv.at exposes a JSON search API plus a Java-ish web layer.
 * The API can return:
 *   - Stable PAKT material URLs like /PAKT/VHG/XXVI/I/I_00425/index.shtml
 *     (these are reliable, link directly to the document).
 *   - Search-result URLs that carry session-style tokens (jsessionid,
 *     request-id, etc.) when traffic comes through the search front-end
 *     — those expire and redirect to the homepage.
 *   - Empty / null URLs when an item only has a path or label.
 *
 * Strategy mirrors sanitizeFindokUrl: detect session-token patterns and
 * swap for a Google site-search on parlament.gv.at with the doc reference
 * or a fallback query as the search term. Stable PAKT URLs pass through
 * untouched.
 *
 * Pure TypeScript, no runtime deps — usable from both Deno edge function
 * and Node-based vitest tests.
 */

const GOOGLE_SITE_SEARCH = "https://www.google.com/search?q=";
const PARLAMENT_SITE = "site:parlament.gv.at";

const SESSION_TOKEN_PATTERNS: RegExp[] = [
  /[?&]jsessionid=[^&]+/i,
  /;jsessionid=[^?&]+/i,
  /[?&]request-id=[^&]+/i,
  /[?&]sid=[A-Z0-9]{20,}/i,
  /[?&]_event(?:Id|_)=[^&]+/i,
];

// Anchor to a query-param boundary so `id=` doesn't match inside other
// param names like `_eventId=` or `oid=` in path-style.
const STABLE_ID_RE = /[?&](?:nr|ident|gp|materialId|dokId)=([^&]+)/i;

function hasSessionToken(url: string): boolean {
  return SESSION_TOKEN_PATTERNS.some((re) => re.test(url));
}

function buildGoogleParlamentSearch(terms: string): string {
  const cleaned = terms.replace(/\s+/g, " ").trim().slice(0, 200);
  return `${GOOGLE_SITE_SEARCH}${encodeURIComponent(`${PARLAMENT_SITE} ${cleaned || "Parlament"}`)}`;
}

/**
 * Returns a URL guaranteed to resolve to either the intended Parlament
 * document (when the input URL is stable) or a Google site-search that
 * surfaces the document (when the URL is empty or carries an expired
 * session token).
 */
export function sanitizeParlamentUrl(url: string | undefined | null, fallbackQuery: string): string {
  if (!url) return buildGoogleParlamentSearch(fallbackQuery);

  if (hasSessionToken(url)) {
    const idMatch = url.match(STABLE_ID_RE);
    const terms = idMatch ? decodeURIComponent(idMatch[1]) : fallbackQuery;
    return buildGoogleParlamentSearch(terms);
  }

  return url;
}
