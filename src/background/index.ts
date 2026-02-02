/**
 * TimeWarden — Background Service Worker Entry Point
 *
 * Orchestrates all background modules:
 * - Tab Tracker: tab lifecycle events, shared in-memory state
 * - Timer Engine: time tracking state machine, session recording
 * - Reset Manager: per-domain reset scheduling
 * - Storage Manager: all persistent data CRUD
 * - Notification Manager: browser notification dispatch
 * - Block Manager: grace period, tab redirection, navigation interception
 * - Message handling for UI communication
 *
 * This module wires the modules together, registers lifecycle
 * handlers, and dispatches alarms.
 */

import type { Message, BlockedStatusResponse } from '$lib/types';
import { ALARM_PREFIX } from '$lib/constants';
import {
  loadStorage,
  getGlobalSettings,
  saveGlobalSettings,
  saveDomainConfig,
  removeDomainConfig,
  getDomainConfigs,
  getDomainConfig,
  getDomainUsage,
} from './storage-manager';
import {
  initTabTracker,
  recoverTabState,
  refreshTrackedDomains,
} from './tab-tracker';
import {
  scheduleReevaluation,
  handleVisit,
  getStatusForDomain,
  getAllDomainStatus,
  persistAllTracking,
  handleNotificationAlarm,
  handleLimitAlarm,
} from './timer-engine';
import {
  scheduleAllResets,
  scheduleNextReset,
  handleResetAlarm,
  checkMissedResets,
} from './reset-manager';
import { initNotificationClickHandler } from './notification-manager';
import {
  enforceExistingBlocks,
  handleGraceEndAlarm,
  isGraceEndAlarm,
  handleNavigationCheck,
} from './block-manager';
import { getCurrentPeriodDate } from '$lib/utils';

// ============================================================
// Initialization
// ============================================================

/**
 * Full initialization sequence.
 * Called on install, startup, and service worker restart.
 */
async function initialize(): Promise<void> {
  const storage = await loadStorage();
  console.log('[TimeWarden] Background initializing', {
    domains: storage.domains.length,
    usageDays: storage.usage.length,
  });

  // 1. Initialize the tab tracker with callbacks
  initTabTracker({
    onStateChange: () => scheduleReevaluation(),
    onVisit: (domain) => {
      // Fire-and-forget — visit counting is best-effort
      handleVisit(domain).catch((err) =>
        console.error('[TimeWarden] Visit count error:', err)
      );
    },
  });

  // 2. Initialize notification click handling
  initNotificationClickHandler();

  // 3. Register navigation interception for blocked domains
  browser.tabs.onUpdated.addListener(handleNavigationCheck);

  // 4. Refresh the tracked domains cache
  await refreshTrackedDomains();

  // 5. Recover tab state from all open tabs
  await recoverTabState();

  // 6. Check for missed resets (browser may have been closed during a reset)
  await checkMissedResets();

  // 7. Schedule reset alarms for all domains
  await scheduleAllResets();

  // 8. Enforce existing blocks (redirect open tabs of blocked domains)
  await enforceExistingBlocks();

  // 9. Reevaluate all domains to start tracking if applicable
  scheduleReevaluation();

  console.log('[TimeWarden] Background initialized');
}

// ============================================================
// Message Handler
// ============================================================

browser.runtime.onMessage.addListener(
  (rawMessage: unknown, _sender: browser.runtime.MessageSender): Promise<unknown> | undefined => {
    const message = rawMessage as Message;
    switch (message.type) {
      case 'GET_SETTINGS':
        return getGlobalSettings();

      case 'GET_DOMAIN_CONFIGS':
        return getDomainConfigs();

      case 'SAVE_GLOBAL_SETTINGS':
        return saveGlobalSettings(message.settings).then(async () => {
          // Reset times may have changed — reschedule resets and refresh cache
          await refreshTrackedDomains();
          await scheduleAllResets();
          scheduleReevaluation();
          return { success: true };
        });

      case 'SAVE_DOMAIN_CONFIG':
        return saveDomainConfig(message.config).then(async () => {
          // Domain config changed — refresh cache and reschedule
          await refreshTrackedDomains();
          await scheduleNextReset(message.config.domain);
          scheduleReevaluation();
          return { success: true };
        });

      case 'REMOVE_DOMAIN':
        return removeDomainConfig(message.domain).then(async () => {
          // Domain removed — refresh cache, clear its reset alarm
          await refreshTrackedDomains();
          await browser.alarms.clear(`${ALARM_PREFIX.RESET}${message.domain}`);
          scheduleReevaluation();
          return { success: true };
        });

      case 'GET_STATUS':
        return getStatusForDomain(message.domain);

      case 'GET_ALL_STATUS':
        return getAllDomainStatus();

      case 'TOGGLE_PAUSE':
        // Phase 5: Toggle pause for a domain
        return Promise.resolve({ success: false, error: 'Not implemented yet' });

      case 'GET_DASHBOARD_DATA':
        return loadStorage().then((storage) => ({
          usage: storage.usage,
          domains: storage.domains,
          settings: storage.settings,
        }));

      case 'GET_BLOCKED_STATUS':
        return getBlockedStatusForDomain(message.domain);

      default:
        console.warn('[TimeWarden] Unknown message type:', message);
        return undefined;
    }
  }
);

// ============================================================
// Blocked Status Query (for blocked.html)
// ============================================================

async function getBlockedStatusForDomain(domain: string): Promise<BlockedStatusResponse> {
  const config = await getDomainConfig(domain);
  if (!config) {
    return {
      domain,
      timeSpentSeconds: 0,
      limitMinutes: 0,
      visitCount: 0,
      sessionCount: 0,
      longestSessionSeconds: 0,
      resetTime: '00:00',
      blockedAt: null,
    };
  }

  const settings = await getGlobalSettings();
  const date = getCurrentPeriodDate(config, settings.resetTime);
  const usage = await getDomainUsage(domain, date);

  if (!usage) {
    return {
      domain,
      timeSpentSeconds: 0,
      limitMinutes: config.dailyLimitMinutes,
      visitCount: 0,
      sessionCount: 0,
      longestSessionSeconds: 0,
      resetTime: settings.resetTime,
      blockedAt: null,
    };
  }

  // Compute longest session
  let longestSessionSeconds = 0;
  for (const session of usage.sessions) {
    if (session.durationSeconds > longestSessionSeconds) {
      longestSessionSeconds = session.durationSeconds;
    }
  }

  return {
    domain,
    timeSpentSeconds: usage.timeSpentSeconds,
    limitMinutes: usage.limitMinutes,
    visitCount: usage.visitCount,
    sessionCount: usage.sessions.length,
    longestSessionSeconds: Math.floor(longestSessionSeconds),
    resetTime: usage.resetTime,
    blockedAt: usage.blockedAt,
  };
}

// ============================================================
// Alarm Dispatcher
// ============================================================

browser.alarms.onAlarm.addListener((alarm) => {
  const { name } = alarm;

  if (name.startsWith(ALARM_PREFIX.RESET)) {
    const domain = name.slice(ALARM_PREFIX.RESET.length);
    handleResetAlarm(domain, () => scheduleReevaluation()).catch((err) =>
      console.error('[TimeWarden] Reset alarm error:', err)
    );
  } else if (isGraceEndAlarm(name)) {
    handleGraceEndAlarm(name).catch((err) =>
      console.error('[TimeWarden] Grace end alarm error:', err)
    );
  } else if (
    name.startsWith(ALARM_PREFIX.NOTIFY_TEN_PERCENT) ||
    name.startsWith(ALARM_PREFIX.NOTIFY_FIVE_MINUTES)
  ) {
    handleNotificationAlarm(name).catch((err) =>
      console.error('[TimeWarden] Notification alarm error:', err)
    );
  } else if (name.startsWith(ALARM_PREFIX.LIMIT_REACHED)) {
    handleLimitAlarm(name).catch((err) =>
      console.error('[TimeWarden] Limit alarm error:', err)
    );
  } else {
    console.warn('[TimeWarden] Unknown alarm:', name);
  }
});

// ============================================================
// Lifecycle Events
// ============================================================

browser.runtime.onInstalled.addListener(async () => {
  console.log('[TimeWarden] Extension installed/updated');
  await initialize();
});

browser.runtime.onStartup.addListener(async () => {
  console.log('[TimeWarden] Browser started');
  await initialize();
});

/**
 * Safety net: persist all tracking data when the service worker
 * is about to be suspended (Chrome MV3) or event page unloaded (Firefox).
 */
browser.runtime.onSuspend.addListener(() => {
  console.log('[TimeWarden] Service worker suspending — persisting tracking data');
  persistAllTracking().catch((err) =>
    console.error('[TimeWarden] Persist on suspend error:', err)
  );
});

// Initialize immediately (in case the service worker was restarted
// without triggering onInstalled or onStartup)
initialize();
