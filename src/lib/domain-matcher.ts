/**
 * Domain matching utilities.
 *
 * Matching rules:
 * - A configured domain WITHOUT "www." also matches its "www." variant:
 *     "youtube.com" matches both "youtube.com" AND "www.youtube.com"
 * - A configured domain WITH "www." matches only that exact hostname:
 *     "www.youtube.com" matches only "www.youtube.com"
 * - No general subdomain inference — "music.youtube.com" requires its own config.
 */

/**
 * Extract the hostname from a URL string.
 * Returns null if the URL is invalid or not http/https.
 */
export function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Match a URL against a list of tracked domains.
 * Returns the matching tracked domain string or null.
 *
 * A non-www configured domain (e.g. "youtube.com") also matches "www.youtube.com".
 * A www-prefixed configured domain (e.g. "www.example.com") matches only itself.
 */
export function matchDomain(url: string, trackedDomains: string[]): string | null {
  const hostname = extractHostname(url);
  if (!hostname) return null;

  for (const domain of trackedDomains) {
    // Exact match always works
    if (hostname === domain) return domain;

    // Non-www config also matches the www. variant of the hostname
    if (!domain.startsWith('www.') && hostname === 'www.' + domain) {
      return domain;
    }
  }

  return null;
}

/**
 * Validate a domain string for configuration.
 * Must be a bare hostname: no protocol, no path, no port.
 */
export function isValidDomain(domain: string): boolean {
  // Must not be empty
  if (!domain || domain.trim().length === 0) return false;

  // Must not contain protocol
  if (domain.includes('://')) return false;

  // Must not contain path, query, or fragment
  if (domain.includes('/') || domain.includes('?') || domain.includes('#')) return false;

  // Must not contain port
  if (domain.includes(':')) return false;

  // Must not contain spaces
  if (domain.includes(' ')) return false;

  // Basic hostname validation: at least one dot, valid characters
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return hostnameRegex.test(domain);
}

/**
 * Normalize a domain input:
 * - Trim whitespace
 * - Lowercase
 * - Strip trailing dots
 *
 * The www. prefix is preserved so users can choose matching behavior:
 * - "youtube.com" → matches youtube.com AND www.youtube.com
 * - "www.youtube.com" → matches www.youtube.com only
 *
 * Returns the normalized domain and whether it starts with www.
 */
export function normalizeDomain(input: string): { domain: string; hasWww: boolean } {
  let domain = input.trim().toLowerCase();

  // Remove trailing dot (DNS root)
  while (domain.endsWith('.')) {
    domain = domain.slice(0, -1);
  }

  const hasWww = domain.startsWith('www.');

  return { domain, hasWww };
}
