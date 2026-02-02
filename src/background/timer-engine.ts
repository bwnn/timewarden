/**
 * Timer Engine — the core time tracking state machine.
 *
 * Responsibilities:
 * - `reevaluateAllDomains()` — central state machine called on every relevant event
 * - `shouldTrackDomain()` — determines if a domain should be actively tracked
 * - Start/stop timestamp-based tracking with session recording
 * - Alarm scheduling for notification thresholds and limit enforcement
 * - Real-time status computation for message handlers
 * - Visit count management
 * - Persistence on tracking stop + onSuspend safety net
 *
 * Reads shared state from tab-tracker.ts. Does NOT register any event listeners
 * directly — index.ts wires the callbacks.
 */

import type { StatusResponse, DayOfWeek } from '$lib/types';
import { ALARM_PREFIX, NOTIFICATION_THRESHOLDS } from '$lib/constants';
import { getCurrentPeriodDate, getEffectiveLimit } from '$lib/utils';
import {
  activeTracking,
  focusedWindowId,
  activeTabId,
  isSystemIdle,
  cleanupStaleEntries,
} from './tab-tracker';
import {
  getDomainConfig,
  getGlobalSettings,
  getOrCreateDomainUsage,
  updateDomainUsage,
  getDomainUsage,
  getDomainConfigs,
} from './storage-manager';

// ============================================================
// Serialized Reevaluation Queue
// ============================================================

/**
 * Reevaluation must be serialized to prevent race conditions.
 * Multiple rapid events (tab switch + URL change) could overlap
 * and produce incorrect storage writes at async yield points.
 */
let reevaluateQueue: Promise<void> = Promise.resolve();

/**
 * Schedule a reevaluation. Calls are serialized — each completes
 * before the next begins.
 */
export function scheduleReevaluation(): void {
  reevaluateQueue = reevaluateQueue.then(() => reevaluateAllDomainsImpl()).catch((err) => {
    console.error('[TimeWarden] Reevaluation error:', err);
  });
}

// ============================================================
// Central State Machine
// ============================================================

/**
 * The central state machine. Called on every relevant event to determine
 * which domains should start/stop tracking.
 *
 * For each domain in the activeTracking map:
 * - If should track and NOT currently tracking → START
 * - If should NOT track and currently tracking → STOP
 * - If should track but reason changed → update reason
 */
async function reevaluateAllDomainsImpl(): Promise<void> {
  for (const [domain, tracking] of activeTracking) {
    const shouldTrack = shouldTrackDomain(domain);

    if (shouldTrack && !tracking.startedAt) {
      // START tracking
      await startTracking(domain, shouldTrack);

    } else if (!shouldTrack && tracking.startedAt) {
      // STOP tracking
      await stopTracking(domain);

    } else if (shouldTrack && tracking.startedAt && shouldTrack !== tracking.reason) {
      // Reason changed (e.g. focused → audible or vice versa). Continue tracking.
      tracking.reason = shouldTrack;
    }
  }

  // Clean up entries with no tabs and no active tracking
  cleanupStaleEntries();
}

/**
 * Determine if a domain should currently be tracked.
 * Pure in-memory check — no storage reads.
 *
 * @returns The tracking reason, or false if tracking should not be active
 */
function shouldTrackDomain(domain: string): 'focused' | 'audible' | false {
  if (isSystemIdle) return false;

  const tracking = activeTracking.get(domain);
  if (!tracking || tracking.tabs.size === 0) return false;

  // Check: is the active tab in the focused window one of this domain's tabs?
  if (focusedWindowId !== browser.windows.WINDOW_ID_NONE) {
    if (tracking.tabs.has(activeTabId)) {
      return 'focused';
    }
  }

  // Check: is any tab of this domain producing audio?
  for (const [, tabState] of tracking.tabs) {
    if (tabState.audible) return 'audible';
  }

  return false;
}

// ============================================================
// Tracking Start / Stop
// ============================================================

/**
 * Start tracking a domain: set timestamp, record session, schedule alarms.
 */
async function startTracking(domain: string, reason: 'focused' | 'audible'): Promise<void> {
  const tracking = activeTracking.get(domain);
  if (!tracking) return;

  // Get config — if domain was disabled or removed, bail
  const config = await getDomainConfig(domain);
  if (!config || !config.enabled) return;

  const settings = await getGlobalSettings();
  const { usage } = await getOrCreateDomainUsage(config, settings);

  // If already blocked in this period, don't start tracking
  if (usage.blocked) {
    return;
  }

  // Set tracking state
  tracking.startedAt = Date.now();
  tracking.reason = reason;

  // Record session start
  const date = getCurrentPeriodDate(config, settings.resetTime);
  await updateDomainUsage(domain, date, (u) => {
    u.sessions.push({
      startTime: new Date().toISOString(),
      endTime: null,
      durationSeconds: 0,
    });
    return u;
  });

  // Schedule threshold alarms
  await scheduleTrackingAlarms(domain, usage.timeSpentSeconds, usage.limitMinutes, usage.notifications);

  console.log(`[TimeWarden] Started tracking ${domain} (${reason})`);
}

/**
 * Stop tracking a domain: compute elapsed, accumulate time, end session, persist.
 */
async function stopTracking(domain: string): Promise<void> {
  const tracking = activeTracking.get(domain);
  if (!tracking || !tracking.startedAt) return;

  const elapsed = (Date.now() - tracking.startedAt) / 1000;

  // Clear tracking state immediately (before async work)
  tracking.startedAt = null;
  tracking.reason = null;

  // Get config to determine period date
  const config = await getDomainConfig(domain);
  if (!config) return;

  const settings = await getGlobalSettings();
  const date = getCurrentPeriodDate(config, settings.resetTime);

  // Accumulate time and end session in storage
  await updateDomainUsage(domain, date, (u) => {
    u.timeSpentSeconds += elapsed;

    // End the last open session
    const lastSession = u.sessions[u.sessions.length - 1];
    if (lastSession && lastSession.endTime === null) {
      lastSession.endTime = new Date().toISOString();
      lastSession.durationSeconds = elapsed;
    }

    return u;
  });

  // Clear threshold alarms
  await clearTrackingAlarms(domain);

  console.log(`[TimeWarden] Stopped tracking ${domain} (+${elapsed.toFixed(1)}s)`);
}

// ============================================================
// Visit Count
// ============================================================

/**
 * Increment the visit count for a domain.
 * Called by tab-tracker when a new navigation to a tracked domain is detected.
 */
export async function handleVisit(domain: string): Promise<void> {
  const config = await getDomainConfig(domain);
  if (!config || !config.enabled) return;

  const settings = await getGlobalSettings();
  // getOrCreateDomainUsage ensures the usage entry exists
  const { date } = await getOrCreateDomainUsage(config, settings);

  await updateDomainUsage(domain, date, (u) => {
    u.visitCount++;
    return u;
  });
}

// ============================================================
// Alarm Scheduling
// ============================================================

/**
 * Schedule alarms for notification thresholds and limit enforcement.
 * Called when tracking starts for a domain.
 */
async function scheduleTrackingAlarms(
  domain: string,
  currentTimeSpent: number,
  limitMinutes: number,
  notifications: { tenPercent: boolean; fiveMinutes: boolean }
): Promise<void> {
  const limitSeconds = limitMinutes * 60;
  const now = Date.now();

  // 10% remaining notification (90% used threshold)
  const tenPctThreshold = limitSeconds * NOTIFICATION_THRESHOLDS.TEN_PERCENT_USED;
  if (currentTimeSpent < tenPctThreshold && !notifications.tenPercent) {
    const delaySeconds = tenPctThreshold - currentTimeSpent;
    browser.alarms.create(`${ALARM_PREFIX.NOTIFY_TEN_PERCENT}${domain}`, {
      when: now + delaySeconds * 1000,
    });
  }

  // 5 minutes remaining notification
  const fiveMinThreshold = limitSeconds - NOTIFICATION_THRESHOLDS.FIVE_MINUTES_SECONDS;
  if (fiveMinThreshold > 0 && currentTimeSpent < fiveMinThreshold && !notifications.fiveMinutes) {
    const delaySeconds = fiveMinThreshold - currentTimeSpent;
    browser.alarms.create(`${ALARM_PREFIX.NOTIFY_FIVE_MINUTES}${domain}`, {
      when: now + delaySeconds * 1000,
    });
  }

  // Limit reached
  const remaining = limitSeconds - currentTimeSpent;
  if (remaining > 0) {
    browser.alarms.create(`${ALARM_PREFIX.LIMIT_REACHED}${domain}`, {
      when: now + remaining * 1000,
    });
  }
}

/**
 * Clear all threshold alarms for a domain.
 * Called when tracking stops.
 */
async function clearTrackingAlarms(domain: string): Promise<void> {
  await Promise.all([
    browser.alarms.clear(`${ALARM_PREFIX.NOTIFY_TEN_PERCENT}${domain}`),
    browser.alarms.clear(`${ALARM_PREFIX.NOTIFY_FIVE_MINUTES}${domain}`),
    browser.alarms.clear(`${ALARM_PREFIX.LIMIT_REACHED}${domain}`),
  ]);
}

// ============================================================
// Alarm Handlers (dispatched from index.ts)
// ============================================================

/**
 * Handle a notification threshold alarm (10% remaining or 5 minutes remaining).
 * Phase 4 will dispatch actual browser notifications; for now just mark as fired.
 */
export async function handleNotificationAlarm(alarmName: string): Promise<void> {
  let domain: string;
  let field: 'tenPercent' | 'fiveMinutes';

  if (alarmName.startsWith(ALARM_PREFIX.NOTIFY_TEN_PERCENT)) {
    domain = alarmName.slice(ALARM_PREFIX.NOTIFY_TEN_PERCENT.length);
    field = 'tenPercent';
  } else if (alarmName.startsWith(ALARM_PREFIX.NOTIFY_FIVE_MINUTES)) {
    domain = alarmName.slice(ALARM_PREFIX.NOTIFY_FIVE_MINUTES.length);
    field = 'fiveMinutes';
  } else {
    return;
  }

  const config = await getDomainConfig(domain);
  if (!config) return;

  const settings = await getGlobalSettings();
  const date = getCurrentPeriodDate(config, settings.resetTime);

  // Mark notification as fired to prevent duplicates
  await updateDomainUsage(domain, date, (u) => {
    u.notifications[field] = true;
    return u;
  });

  console.log(`[TimeWarden] Notification alarm: ${field} for ${domain}`);
  // Phase 4: dispatch browser.notifications.create() here
}

/**
 * Handle a limit-reached alarm.
 * Phase 4 will trigger grace period + blocking; for now just log.
 */
export async function handleLimitAlarm(alarmName: string): Promise<void> {
  const domain = alarmName.slice(ALARM_PREFIX.LIMIT_REACHED.length);

  console.log(`[TimeWarden] Limit reached for ${domain}`);
  // Phase 4: trigger grace period → blocking
}

// ============================================================
// Status Computation
// ============================================================

/**
 * Compute real-time status for a single domain.
 * Includes live elapsed time from any active tracking session.
 */
export async function getStatusForDomain(domain: string): Promise<StatusResponse> {
  const config = await getDomainConfig(domain);
  if (!config) {
    return defaultStatusResponse(domain);
  }

  const settings = await getGlobalSettings();
  const date = getCurrentPeriodDate(config, settings.resetTime);
  const usage = await getDomainUsage(domain, date);

  const tracking = activeTracking.get(domain);
  const isTracking = tracking?.startedAt != null;

  // Base time from storage
  let timeSpentSeconds = usage?.timeSpentSeconds ?? 0;

  // Add live elapsed time if currently tracking
  if (isTracking && tracking?.startedAt) {
    timeSpentSeconds += (Date.now() - tracking.startedAt) / 1000;
  }

  const limitMinutes = usage?.limitMinutes
    ?? getEffectiveLimit(config, String(new Date().getDay()) as DayOfWeek);
  const limitSeconds = limitMinutes * 60;
  const timeRemainingSeconds = Math.max(0, limitSeconds - timeSpentSeconds);

  return {
    domain,
    timeSpentSeconds: Math.floor(timeSpentSeconds),
    timeRemainingSeconds: Math.floor(timeRemainingSeconds),
    limitMinutes,
    visitCount: usage?.visitCount ?? 0,
    sessionCount: usage?.sessions.length ?? 0,
    isPaused: false, // Phase 5
    pauseRemainingSeconds: 0, // Phase 5
    isBlocked: usage?.blocked ?? false,
    isTracking,
    trackingReason: tracking?.reason ?? null,
  };
}

/**
 * Compute real-time status for all tracked domains.
 */
export async function getAllDomainStatus(): Promise<StatusResponse[]> {
  const configs = await getDomainConfigs();
  const results: StatusResponse[] = [];

  for (const config of configs) {
    if (!config.enabled) continue;
    results.push(await getStatusForDomain(config.domain));
  }

  return results;
}

/**
 * Default status for an unknown/unconfigured domain.
 */
function defaultStatusResponse(domain: string): StatusResponse {
  return {
    domain,
    timeSpentSeconds: 0,
    timeRemainingSeconds: 0,
    limitMinutes: 0,
    visitCount: 0,
    sessionCount: 0,
    isPaused: false,
    pauseRemainingSeconds: 0,
    isBlocked: false,
    isTracking: false,
    trackingReason: null,
  };
}

// ============================================================
// Persistence Safety Net
// ============================================================

/**
 * Persist all currently tracking domains to storage.
 * Called on runtime.onSuspend as a safety net in case the service worker
 * is terminated without a proper stop event.
 *
 * For each domain with active tracking, computes elapsed time and writes it
 * to storage. Does NOT modify the in-memory tracking state (the worker is
 * about to die anyway).
 */
export async function persistAllTracking(): Promise<void> {
  const now = Date.now();

  for (const [domain, tracking] of activeTracking) {
    if (!tracking.startedAt) continue;

    const elapsed = (now - tracking.startedAt) / 1000;
    if (elapsed <= 0) continue;

    const config = await getDomainConfig(domain);
    if (!config) continue;

    const settings = await getGlobalSettings();
    const date = getCurrentPeriodDate(config, settings.resetTime);

    await updateDomainUsage(domain, date, (u) => {
      u.timeSpentSeconds += elapsed;

      // End last open session
      const lastSession = u.sessions[u.sessions.length - 1];
      if (lastSession && lastSession.endTime === null) {
        lastSession.endTime = new Date(now).toISOString();
        lastSession.durationSeconds = elapsed;
      }

      return u;
    });

    console.log(`[TimeWarden] Persisted ${domain} on suspend (+${elapsed.toFixed(1)}s)`);
  }
}
