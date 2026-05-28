/**
 * FINDOK URL sanitization
 *
 * FINDOK (findok.bmf.gv.at) is built on Spring Webflow, so every document
 * URL carries an `execution=eXsY` session token. Those tokens are bound to
 * the HTTP session that generated them and expire within minutes — by the
 * time a chat user clicks the link, FINDOK redirects them to the empty
 * landing page (which looks like a broken link).
 *
 * Strategy: if a URL contains an expired-session token we can't trust,
 * replace it with a Google site-search on findok.bmf.gv.at. Google keeps
 * its FINDOK index reasonably fresh and the top result is a working URL.
 *
 * Pure TypeScript with no runtime dependencies, so it imports cleanly
 * into both the Deno edge function and Node-based vitest tests.
 */

const GOOGLE_SITE_SEARCH = "https://www.google.com/search?q=";
const FINDOK_SITE = "site:findok.bmf.gv.at";

// Spring Webflow / J2EE session tokens that bind a URL to the HTTP session
// that generated it. Any URL carrying one of these expires within minutes
// of being scraped and will redirect a real user to FINDOK's landing page.
// Detect ANY of these patterns; we don't trust the URL to resolve.
const SESSION_TOKEN_PATTERNS: RegExp[] = [
  /[?&]execution=e\d+s\d+/i,        // Spring Webflow flow execution
  /[?&]_eventId=[^&]+/i,             // Spring Webflow event id (often combined with execution)
  /[?&]jsessionid=[^&]+/i,           // J2EE servlet session
  /;jsessionid=[^?&]+/i,              // J2EE session injected as path param
  /[?&]request-id=[^&]+/i,           // Custom server-side request id (seen in some Spring apps)
  /[?&]sid=[A-Z0-9]{20,}/i,           // Generic long-opaque session-style param
];

// Anchor to a query-param boundary ([?&]) — otherwise `id=` would match
// inside `_eventId=viewDocument` and capture the wrong value.
const STABLE_ID_RE = /[?&](?:gz|id|dokumentId)=([^&]+)/i;

function hasSessionToken(url: string): boolean {
  return SESSION_TOKEN_PATTERNS.some((re) => re.test(url));
}

function buildGoogleFindokSearch(terms: string): string {
  const cleaned = terms.replace(/\s+/g, " ").trim().slice(0, 200);
  return `${GOOGLE_SITE_SEARCH}${encodeURIComponent(`${FINDOK_SITE} ${cleaned}`)}`;
}

/**
 * Returns a URL guaranteed to either open the intended FINDOK document
 * (when the input URL is already stable) or a Google site-search that
 * finds it (when the input URL carries an expired session token or is
 * empty).
 */
export function sanitizeFindokUrl(url: string | undefined | null, fallbackQuery: string): string {
  if (!url) return buildGoogleFindokSearch(fallbackQuery || "FINDOK");

  if (hasSessionToken(url)) {
    // Preserve any stable identifier (GZ, doc id) before falling back to the
    // generic query — a direct-id search is more likely to land on the right doc.
    const idMatch = url.match(STABLE_ID_RE);
    const terms = idMatch ? decodeURIComponent(idMatch[1]) : (fallbackQuery || "FINDOK");
    return buildGoogleFindokSearch(terms);
  }

  return url;
}
