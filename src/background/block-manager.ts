/**
 * Block Manager — grace period orchestration, tab redirection, and navigation interception.
 *
 * Responsibilities:
 * - Start grace period: notify the user via browser notification, schedule block alarm
 * - End grace period: redirect all domain tabs to blocked.html, mark domain as blocked
 * - Intercept new navigations to blocked domains via tabs.onUpdated
 * - Enforce existing blocks on startup (redirect open tabs of blocked domains)
 * - Provide runtime grace state queries
 *
 * Key design:
 * - `graceEndsAt` is runtime-only (Map<string, number>). NOT persisted.
 *   If the service worker restarts during grace, block triggers immediately.
 * - Blocking is persisted via `DomainUsage.blocked` in storage (survives restarts).
 */

import { matchDomain } from '$lib/domain-matcher';
import { getCurrentPeriodDate } from '$lib/utils';
import {
  getGlobalSettings,
  getDomainConfig,
  getBlockedDomains,
  updateDomainUsage,
  getOrCreateDomainUsage,
} from './storage-manager';
import { activeTracking, tabDomainMap, getCachedTrackedDomains } from './tab-tracker';
import { notifyGracePeriodStarting } from './notification-manager';

// ============================================================
// Runtime Grace Period State (NOT persisted)
// ============================================================

/** Maps domain -> timestamp (ms) when grace period ends */
const graceEndsAt = new Map<string, number>();

/** Grace period alarm prefix */
const GRACE_ALARM_PREFIX = 'grace-end-';

// ============================================================
// Blocked Page URL
// ============================================================

function getBlockedPageUrl(domain: string): string {
  return browser.runtime.getURL(`blocked.html?domain=${encodeURIComponent(domain)}`);
}

// ============================================================
// Grace Period
// ============================================================

/**
 * Start the grace period for a domain.
 * 1. Stop tracking (caller should have already done this or will via reevaluation)
 * 2. Inject countdown overlay into all tabs of this domain
 * 3. Schedule grace-end alarm
 * 4. Send notification
 */
export async function startGracePeriod(domain: string): Promise<void> {
  const settings = await getGlobalSettings();
  const gracePeriodSeconds = settings.gracePeriodSeconds;

  // If grace period is 0, block immediately
  if (gracePeriodSeconds <= 0) {
    await blockDomain(domain);
    return;
  }

  // Record grace end time
  const endsAt = Date.now() + gracePeriodSeconds * 1000;
  graceEndsAt.set(domain, endsAt);

  // Schedule alarm for when grace period ends
  browser.alarms.create(`${GRACE_ALARM_PREFIX}${domain}`, {
    when: endsAt,
  });

  // Notify user
  await notifyGracePeriodStarting(domain, gracePeriodSeconds);

  console.log(`[TimeWarden] Grace period started for ${domain} (${gracePeriodSeconds}s)`);
}

/**
 * Handle grace period end alarm.
 * Block the domain and redirect all its tabs.
 */
export async function handleGraceEndAlarm(alarmName: string): Promise<void> {
  const domain = alarmName.slice(GRACE_ALARM_PREFIX.length);
  graceEndsAt.delete(domain);
  await blockDomain(domain);
}

/**
 * Check if an alarm name is a grace-end alarm.
 */
export function isGraceEndAlarm(alarmName: string): boolean {
  return alarmName.startsWith(GRACE_ALARM_PREFIX);
}

// ============================================================
// Blocking
// ============================================================

/**
 * Block a domain: mark as blocked in storage, redirect all tabs.
 */
export async function blockDomain(domain: string): Promise<void> {
  // Mark as blocked in storage
  const config = await getDomainConfig(domain);
  if (!config) return;

  const settings = await getGlobalSettings();
  const date = getCurrentPeriodDate(config, settings.resetTime);

  await updateDomainUsage(domain, date, (u) => {
    u.blocked = true;
    u.blockedAt = new Date().toISOString();
    return u;
  });

  // Clear grace state
  graceEndsAt.delete(domain);

  // Redirect all open tabs of this domain to the blocked page
  await redirectDomainTabs(domain);

  console.log(`[TimeWarden] Blocked ${domain}`);
}

/**
 * Redirect all open tabs of a domain to the blocked page.
 */
async function redirectDomainTabs(domain: string): Promise<void> {
  const blockedUrl = getBlockedPageUrl(domain);
  const tabIds: number[] = [];

  // Collect tab IDs from the tracking map
  const tracking = activeTracking.get(domain);
  if (tracking) {
    for (const [tabId] of tracking.tabs) {
      tabIds.push(tabId);
    }
  }

  // Also check tabDomainMap for any tabs not in activeTracking
  for (const [tabId, tabDomain] of tabDomainMap) {
    if (tabDomain === domain && !tabIds.includes(tabId)) {
      tabIds.push(tabId);
    }
  }

  // Redirect each tab
  for (const tabId of tabIds) {
    try {
      await browser.tabs.update(tabId, { url: blockedUrl });
    } catch (err) {
      console.warn(`[TimeWarden] Failed to redirect tab ${tabId}:`, err);
    }
  }
}

// ============================================================
// Navigation Interception
// ============================================================

/**
 * Check if a tab navigation should be intercepted (domain is blocked).
 * Called from the tabs.onUpdated handler in index.ts.
 *
 * Returns the blocked page URL if the navigation should be blocked, null otherwise.
 */
export async function checkNavigationBlock(
  _tabId: number,
  url: string
): Promise<string | null> {
  // Don't intercept blocked page itself or extension pages
  if (url.startsWith(browser.runtime.getURL('')) || url.startsWith('about:') || url.startsWith('moz-extension:') || url.startsWith('chrome-extension:')) {
    return null;
  }

  const trackedDomains = getCachedTrackedDomains();
  const domain = matchDomain(url, trackedDomains);
  if (!domain) return null;

  // Check if domain is in grace period — allow navigation during grace
  if (graceEndsAt.has(domain)) return null;

  // Check if domain is blocked
  const config = await getDomainConfig(domain);
  if (!config || !config.enabled) return null;

  const settings = await getGlobalSettings();
  const { usage } = await getOrCreateDomainUsage(config, settings);

  if (usage.blocked) {
    return getBlockedPageUrl(domain);
  }

  return null;
}

/**
 * Navigation interception listener for tabs.onUpdated.
 * Redirects to blocked page if the domain is blocked.
 */
export function handleNavigationCheck(
  _tabId: number,
  changeInfo: Record<string, unknown>,
  _tab: browser.tabs.Tab
): void {
  if (typeof changeInfo.url !== 'string') return;

  // Fire-and-forget async check
  checkNavigationBlock(_tabId, changeInfo.url).then((blockedUrl) => {
    if (blockedUrl) {
      browser.tabs.update(_tabId, { url: blockedUrl }).catch((err) => {
        console.warn(`[TimeWarden] Failed to redirect blocked navigation:`, err);
      });
    }
  }).catch((err) => {
    console.error('[TimeWarden] Navigation block check error:', err);
  });
}

// ============================================================
// Startup Enforcement
// ============================================================

/**
 * Enforce existing blocks on startup.
 * Check all open tabs against blocked domains and redirect any matches.
 */
export async function enforceExistingBlocks(): Promise<void> {
  const blockedDomains = await getBlockedDomains();
  if (blockedDomains.length === 0) return;

  const allTabs = await browser.tabs.query({});

  for (const tab of allTabs) {
    if (!tab.id || !tab.url) continue;

    // Skip extension pages
    if (tab.url.startsWith(browser.runtime.getURL('')) || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:') || tab.url.startsWith('chrome-extension:')) {
      continue;
    }

    const domain = matchDomain(tab.url, blockedDomains);
    if (domain) {
      const blockedUrl = getBlockedPageUrl(domain);
      try {
        await browser.tabs.update(tab.id, { url: blockedUrl });
        console.log(`[TimeWarden] Redirected tab ${tab.id} (${domain}) on startup`);
      } catch (err) {
        console.warn(`[TimeWarden] Failed to redirect tab ${tab.id} on startup:`, err);
      }
    }
  }
}

// ============================================================
// Grace Period Queries
// ============================================================

/**
 * Check if a domain is currently in its grace period.
 */
export function isDomainInGracePeriod(domain: string): boolean {
  const endsAt = graceEndsAt.get(domain);
  if (!endsAt) return false;
  if (Date.now() >= endsAt) {
    // Grace expired but alarm hasn't fired yet — clean up
    graceEndsAt.delete(domain);
    return false;
  }
  return true;
}

/**
 * Get remaining grace period seconds for a domain (0 if not in grace).
 */
export function getGraceRemainingSeconds(domain: string): number {
  const endsAt = graceEndsAt.get(domain);
  if (!endsAt) return 0;
  const remaining = (endsAt - Date.now()) / 1000;
  return Math.max(0, Math.floor(remaining));
}
