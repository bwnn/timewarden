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

/** Alarm name for periodic badge text refresh */
const BADGE_REFRESH_ALARM = 'badge-refresh';
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
  activeTracking,
} from './tab-tracker';
import {
  scheduleReevaluation,
  handleVisit,
  getStatusForDomain,
  getAllDomainStatus,
  persistAllTracking,
  flushActiveTracking,
  handleNotificationAlarm,
  handleLimitAlarm,
  togglePause as togglePauseImpl,
  handlePauseEndAlarm,
  isPauseEndAlarm,
  updateBadge,
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
/** Tracks whether initialization has completed to prevent duplicate setup */
let initialized = false;

async function initialize(): Promise<void> {
  try {
    const storage = await loadStorage();
    console.log('[TimeWarden] Background initializing', {
      domains: storage.domains.length,
      usageDays: storage.usage.length,
    });

    // 1. Initialize the tab tracker with callbacks (idempotent — guards internally)
    if (!initialized) {
      initTabTracker({
        onStateChange: () => scheduleReevaluation(),
        onVisit: (domain) => {
          // Enqueued into the serialized reevaluation queue —
          // no .catch needed since the queue handles errors internally
          handleVisit(domain);
        },
      });

      // 2. Initialize notification click handling
      initNotificationClickHandler();

      // 3. Register navigation interception for blocked domains
      browser.tabs.onUpdated.addListener(handleNavigationCheck);
    }

    // 4. Refresh the tracked domains cache
    await refreshTrackedDomains();

    // 5. Recover tab state from all open tabs (count visits on startup)
    await recoverTabState(true);

    // 6. Check for missed resets (browser may have been closed during a reset)
    await checkMissedResets();

    // 7. Schedule reset alarms for all domains
    await scheduleAllResets();

    // 8. Enforce existing blocks (redirect open tabs of blocked domains)
    await enforceExistingBlocks();

    // 9. Schedule periodic badge refresh (every 30 seconds for time-remaining accuracy)
    browser.alarms.create(BADGE_REFRESH_ALARM, { periodInMinutes: 0.5 });

    // 10. Reevaluate all domains to start tracking if applicable
    scheduleReevaluation();

    // 11. Initial badge update
    updateBadge().catch((err) =>
      console.error('[TimeWarden] Initial badge update error:', err)
    );

    initialized = true;
    console.log('[TimeWarden] Background initialized');
  } catch (err) {
    console.error('[TimeWarden] Initialization failed:', err);
    // Attempt basic recovery: schedule a retry after 5 seconds
    setTimeout(() => initialize(), 5000);
  }
}

// ============================================================
// Message Handler
// ============================================================

browser.runtime.onMessage.addListener(
  (rawMessage: unknown, _sender: browser.runtime.MessageSender): Promise<unknown> | undefined => {
    const message = rawMessage as Message;

    // Wrap each handler in error handling to prevent unhandled rejections
    // from propagating to the sender as opaque errors.
    function safeHandler(handler: () => Promise<unknown>): Promise<unknown> {
      return handler().catch((err) => {
        console.error(`[TimeWarden] Message handler error (${message.type}):`, err);
        return { error: 'Internal error', type: message.type };
      });
    }

    switch (message.type) {
      case 'GET_SETTINGS':
        return safeHandler(() => getGlobalSettings());

      case 'GET_DOMAIN_CONFIGS':
        return safeHandler(() => getDomainConfigs());

      case 'SAVE_GLOBAL_SETTINGS':
        return safeHandler(async () => {
          await saveGlobalSettings(message.settings);
          // Reset times may have changed — reschedule resets and refresh cache
          await refreshTrackedDomains();
          await scheduleAllResets();
          scheduleReevaluation();
          return { success: true };
        });

      case 'SAVE_DOMAIN_CONFIG':
        return safeHandler(async () => {
          await saveDomainConfig(message.config);
          // Domain config changed — refresh cache, scan existing tabs, and reschedule
          await refreshTrackedDomains();
          // Re-scan open tabs so that existing tabs matching the new/updated domain
          // are registered in activeTracking (without this, a tab already open to
          // the domain would not be tracked until the user navigates away and back)
          await recoverTabState();
          await scheduleNextReset(message.config.domain);
          scheduleReevaluation();
          return { success: true };
        });

      case 'REMOVE_DOMAIN':
        return safeHandler(async () => {
          await removeDomainConfig(message.domain);
          // Domain removed — refresh cache, re-scan tabs, clear its reset alarm
          await refreshTrackedDomains();
          await recoverTabState();
          await browser.alarms.clear(`${ALARM_PREFIX.RESET}${message.domain}`);
          scheduleReevaluation();
          return { success: true };
        });

      case 'GET_STATUS':
        return safeHandler(() => getStatusForDomain(message.domain));

      case 'GET_ALL_STATUS':
        return safeHandler(() => getAllDomainStatus());

      case 'TOGGLE_PAUSE':
        return safeHandler(() => togglePauseImpl(message.domain));

      case 'GET_DASHBOARD_DATA':
        return safeHandler(async () => {
          const storage = await loadStorage();

          // Augment today's usage data with live elapsed from active tracking
          // sessions. Without this, timeSpentSeconds only reflects completed
          // sessions and the dashboard would show stale remaining time.
          const now = Date.now();
          for (const [domain, tracking] of activeTracking) {
            if (!tracking.startedAt) continue;
            const liveElapsed = (now - tracking.startedAt) / 1000;
            if (liveElapsed <= 0) continue;

            // Find the domain's config to determine the period date
            const config = storage.domains.find((d) => d.domain === domain);
            if (!config) continue;
            const date = getCurrentPeriodDate(config, storage.settings.resetTime);

            // Find the matching daily/domain usage entry and add live elapsed
            const daily = storage.usage.find((u) => u.date === date);
            const domainUsage = daily?.domains.find((d) => d.domain === domain);
            if (domainUsage) {
              domainUsage.timeSpentSeconds += liveElapsed;
            }
          }

          return {
            usage: storage.usage,
            domains: storage.domains,
            settings: storage.settings,
          };
        });

      case 'GET_BLOCKED_STATUS':
        return safeHandler(() => getBlockedStatusForDomain(message.domain));

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
      limitSeconds: 0,
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
      limitSeconds: config.dailyLimitSeconds,
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
    limitSeconds: usage.limitSeconds,
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

  if (name === BADGE_REFRESH_ALARM) {
    // Flush active tracking data to storage so timeSpentSeconds stays current,
    // then update the badge text
    flushActiveTracking()
      .then(() => updateBadge())
      .catch((err) =>
        console.error('[TimeWarden] Badge/flush alarm error:', err)
      );
  } else if (name.startsWith(ALARM_PREFIX.RESET)) {
    const domain = name.slice(ALARM_PREFIX.RESET.length);
    handleResetAlarm(domain, () => scheduleReevaluation()).catch((err) =>
      console.error('[TimeWarden] Reset alarm error:', err)
    );
  } else if (isPauseEndAlarm(name)) {
    handlePauseEndAlarm(name).catch((err) =>
      console.error('[TimeWarden] Pause end alarm error:', err)
    );
  } else if (isGraceEndAlarm(name)) {
    handleGraceEndAlarm(name).catch((err) =>
      console.error('[TimeWarden] Grace end alarm error:', err)
    );
  } else if (name.startsWith(ALARM_PREFIX.NOTIFY_TEN_PERCENT)) {
    handleNotificationAlarm(name).catch((err) =>
      console.error('[TimeWarden] Notification alarm error:', err)
    );
  } else if (name.startsWith(ALARM_PREFIX.LIMIT_REACHED)) {
    // handleLimitAlarm enqueues into the serialized queue (errors caught internally)
    handleLimitAlarm(name);
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
