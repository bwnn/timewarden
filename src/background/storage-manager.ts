/**
 * Storage Manager — all CRUD operations for browser.storage.local.
 *
 * Manages:
 * - Domain configurations (add, update, remove, list)
 * - Daily usage data (get/create/update with 30-day rolling cap)
 * - Global settings
 * - Lazy usage entry creation (only when a tracked domain is visited)
 * - Period limit/reset time snapshots (immutable once created)
 */

import type {
  StorageSchema,
  DomainConfig,
  DailyUsage,
  DomainUsage,
  GlobalSettings,
  DayOfWeek,
} from '$lib/types';
import { DEFAULT_STORAGE, MAX_USAGE_DAYS } from '$lib/constants';
import { getEffectiveLimit, getEffectiveResetTime, getCurrentPeriodDate } from '$lib/utils';

// ============================================================
// Core Storage Access
// ============================================================

/**
 * Load the full storage schema, merging with defaults for missing keys.
 * Handles corrupt or missing storage gracefully by falling back to defaults.
 */
export async function loadStorage(): Promise<StorageSchema> {
  try {
    const result = await browser.storage.local.get(['domains', 'usage', 'settings']);

    // Validate and sanitize each field — fall back to defaults if corrupt
    const domains = Array.isArray(result.domains)
      ? (result.domains as StorageSchema['domains'])
      : [...DEFAULT_STORAGE.domains];

    const usage = Array.isArray(result.usage)
      ? (result.usage as StorageSchema['usage'])
      : [...DEFAULT_STORAGE.usage];

    const settings =
      result.settings && typeof result.settings === 'object' && !Array.isArray(result.settings)
        ? { ...DEFAULT_STORAGE.settings, ...(result.settings as Partial<GlobalSettings>) }
        : { ...DEFAULT_STORAGE.settings };

    return { domains, usage, settings };
  } catch (err) {
    console.error('[TimeWarden] Storage load failed, using defaults:', err);
    return {
      domains: [...DEFAULT_STORAGE.domains],
      usage: [...DEFAULT_STORAGE.usage],
      settings: { ...DEFAULT_STORAGE.settings },
    };
  }
}

/**
 * Save partial storage data. Logs errors but does not throw to prevent
 * cascading failures in the tracking engine.
 */
export async function saveStorage(data: Partial<StorageSchema>): Promise<void> {
  try {
    await browser.storage.local.set(data);
  } catch (err) {
    console.error('[TimeWarden] Storage save failed:', err);
    throw err; // Re-throw so callers can handle if needed
  }
}

// ============================================================
// Domain Configuration CRUD
// ============================================================

/**
 * Get all configured domains.
 */
export async function getDomainConfigs(): Promise<DomainConfig[]> {
  const storage = await loadStorage();
  return storage.domains;
}

/**
 * Get a single domain config by hostname.
 */
export async function getDomainConfig(domain: string): Promise<DomainConfig | null> {
  const domains = await getDomainConfigs();
  return domains.find((d) => d.domain === domain) ?? null;
}

/**
 * Get all tracked domain hostnames (enabled only).
 */
export async function getTrackedDomains(): Promise<string[]> {
  const domains = await getDomainConfigs();
  return domains.filter((d) => d.enabled).map((d) => d.domain);
}

/**
 * Save or update a domain configuration.
 * If the domain already exists, it will be replaced.
 * If it's new, it will be appended.
 */
export async function saveDomainConfig(config: DomainConfig): Promise<void> {
  const storage = await loadStorage();
  const index = storage.domains.findIndex((d) => d.domain === config.domain);

  if (index >= 0) {
    storage.domains[index] = config;
  } else {
    storage.domains.push(config);
  }

  await saveStorage({ domains: storage.domains });
}

/**
 * Remove a domain configuration entirely.
 */
export async function removeDomainConfig(domain: string): Promise<void> {
  const storage = await loadStorage();
  storage.domains = storage.domains.filter((d) => d.domain !== domain);
  await saveStorage({ domains: storage.domains });
}

// ============================================================
// Usage Data
// ============================================================

/**
 * Get usage for a specific date.
 */
export async function getDailyUsage(date: string): Promise<DailyUsage | null> {
  const storage = await loadStorage();
  return storage.usage.find((u) => u.date === date) ?? null;
}

/**
 * Get domain usage within a specific daily period.
 */
export async function getDomainUsage(
  domain: string,
  date: string
): Promise<DomainUsage | null> {
  const daily = await getDailyUsage(date);
  if (!daily) return null;
  return daily.domains.find((d) => d.domain === domain) ?? null;
}

/**
 * Get or create the DomainUsage entry for a domain in its current period.
 * This is the main entry point for the tracking engine.
 *
 * On first visit of a period, snapshots the effective limit and reset time
 * as immutable values for this period.
 */
export async function getOrCreateDomainUsage(
  config: DomainConfig,
  globalSettings: GlobalSettings
): Promise<{ usage: DomainUsage; date: string; isNew: boolean }> {
  const date = getCurrentPeriodDate(config, globalSettings.resetTime);
  const storage = await loadStorage();

  // Find or create daily usage entry
  let daily = storage.usage.find((u) => u.date === date);
  let dailyIsNew = false;

  if (!daily) {
    daily = { date, domains: [] };
    storage.usage.push(daily);
    dailyIsNew = true;

    // Enforce 30-day rolling cap
    while (storage.usage.length > MAX_USAGE_DAYS) {
      storage.usage.shift(); // Remove oldest
    }

    // Sort by date
    storage.usage.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Find or create domain usage within the daily entry
  let domainUsage = daily.domains.find((d) => d.domain === config.domain);
  let isNew = false;

  if (!domainUsage) {
    // Snapshot the effective limit and reset time for this period
    const day = String(new Date().getDay()) as DayOfWeek;
    const effectiveLimit = getEffectiveLimit(config, day);
    const effectiveResetTime = getEffectiveResetTime(config, day, globalSettings.resetTime);

    domainUsage = {
      domain: config.domain,
      timeSpentSeconds: 0,
      visitCount: 0,
      sessions: [],
      pausedSeconds: 0,
      limitSeconds: effectiveLimit,
      resetTime: effectiveResetTime,
      notifications: {
        tenPercent: false,
      },
      blocked: false,
      blockedAt: null,
    };

    daily.domains.push(domainUsage);
    isNew = true;
  }

  if (dailyIsNew || isNew) {
    await saveStorage({ usage: storage.usage });
  }

  return { usage: domainUsage, date, isNew };
}

/**
 * Update a domain's usage data within its current period.
 * The updater function receives the current usage and returns the modified version.
 */
export async function updateDomainUsage(
  domain: string,
  date: string,
  updater: (usage: DomainUsage) => DomainUsage
): Promise<void> {
  const storage = await loadStorage();
  const daily = storage.usage.find((u) => u.date === date);
  if (!daily) return;

  const index = daily.domains.findIndex((d) => d.domain === domain);
  if (index < 0) return;

  daily.domains[index] = updater(daily.domains[index]);
  await saveStorage({ usage: storage.usage });
}

/**
 * Get usage data for a date range (for dashboard).
 */
export async function getUsageRange(days: number): Promise<DailyUsage[]> {
  const storage = await loadStorage();
  // usage is sorted by date, newest last — return the last N entries
  return storage.usage.slice(-days);
}

// ============================================================
// Global Settings
// ============================================================

/**
 * Get global settings.
 */
export async function getGlobalSettings(): Promise<GlobalSettings> {
  const storage = await loadStorage();
  return storage.settings;
}

/**
 * Save global settings (full replace).
 */
export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await saveStorage({ settings });
}

// ============================================================
// Utility: Check if domain is currently in a blocked state
// ============================================================

/**
 * Check blocked state for a domain in its current period.
 */
export async function isDomainBlocked(
  config: DomainConfig,
  globalSettings: GlobalSettings
): Promise<boolean> {
  const date = getCurrentPeriodDate(config, globalSettings.resetTime);
  const usage = await getDomainUsage(config.domain, date);
  return usage?.blocked ?? false;
}

/**
 * Get all domains that are currently blocked.
 */
export async function getBlockedDomains(): Promise<string[]> {
  const storage = await loadStorage();
  const blocked: string[] = [];

  for (const config of storage.domains) {
    if (!config.enabled) continue;
    const date = getCurrentPeriodDate(config, storage.settings.resetTime);
    const daily = storage.usage.find((u) => u.date === date);
    const domainUsage = daily?.domains.find((d) => d.domain === config.domain);
    if (domainUsage?.blocked) {
      blocked.push(config.domain);
    }
  }

  return blocked;
}
