/**
 * Domain matching utilities.
 *
 * Key principle: Exact hostname matching only.
 * youtube.com !== music.youtube.com
 * www.youtube.com !== youtube.com
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
 * Returns the matching domain string or null.
 *
 * Uses exact hostname matching — no subdomain inference.
 */
export function matchDomain(url: string, trackedDomains: string[]): string | null {
  const hostname = extractHostname(url);
  if (!hostname) return null;
  return trackedDomains.includes(hostname) ? hostname : null;
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
 * Returns the normalized domain and whether www. was stripped.
 */
export function normalizeDomain(input: string): { domain: string; strippedWww: boolean } {
  let domain = input.trim().toLowerCase();

  // Remove trailing dot (DNS root)
  while (domain.endsWith('.')) {
    domain = domain.slice(0, -1);
  }

  // Check for www. prefix
  let strippedWww = false;
  if (domain.startsWith('www.')) {
    domain = domain.slice(4);
    strippedWww = true;
  }

  return { domain, strippedWww };
}
