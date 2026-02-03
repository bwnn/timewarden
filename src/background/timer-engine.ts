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
  tabDomainMap,
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
import {
  notifyTenPercentRemaining,
  notifyFiveMinutesRemaining,
} from './notification-manager';
import { startGracePeriod, isDomainInGracePeriod } from './block-manager';
import { formatBadgeText } from '$lib/utils';

// ============================================================
// Pause State (runtime-only — does NOT persist across restart)
// ============================================================

/** Alarm prefix for pause-end alarms */
const PAUSE_ALARM_PREFIX = 'pause-end-';

/** Per-domain pause state */
interface PauseState {
  /** Timestamp (ms) when pause started */
  pausedAt: number;
  /** Pause seconds already consumed in this period BEFORE this pause */
  previousPausedSeconds: number;
  /** Total pause allowance for this domain in seconds */
  allowanceSeconds: number;
}

/** Maps domain -> pause state. Only present while actively paused. */
const pausedDomains = new Map<string, PauseState>();

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

/**
 * Enqueue an arbitrary async operation into the serialized queue.
 * This prevents storage read-modify-write races between operations
 * like handleVisit and startTracking that modify the same usage entries.
 */
function enqueue(fn: () => Promise<void>): void {
  reevaluateQueue = reevaluateQueue.then(fn).catch((err) => {
    console.error('[TimeWarden] Enqueued operation error:', err);
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

  // Update toolbar badge after reevaluation
  updateBadge().catch((err) => {
    console.error('[TimeWarden] Badge update error:', err);
  });
}

/**
 * Determine if a domain should currently be tracked.
 * Pure in-memory check — no storage reads.
 *
 * @returns The tracking reason, or false if tracking should not be active
 */
function shouldTrackDomain(domain: string): 'focused' | 'audible' | false {
  if (isSystemIdle) return false;

  // Paused domains should not be tracked
  if (pausedDomains.has(domain)) return false;

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

  // If already blocked or in grace period, don't start tracking
  if (usage.blocked || isDomainInGracePeriod(domain)) {
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
 * Schedule a visit count increment for a domain.
 * Enqueued into the serialized reevaluation queue to prevent
 * storage read-modify-write races with startTracking (which also
 * modifies the same DomainUsage entry via getOrCreateDomainUsage).
 *
 * Called by tab-tracker when a new navigation to a tracked domain is detected.
 */
export function handleVisit(domain: string): void {
  enqueue(() => handleVisitImpl(domain));
}

/**
 * Actual visit count increment logic.
 * Must run inside the serialized queue.
 */
async function handleVisitImpl(domain: string): Promise<void> {
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
 * Dispatches browser notifications and marks them as fired in storage.
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

  // Dispatch browser notification
  if (field === 'tenPercent') {
    await notifyTenPercentRemaining(domain);
  } else {
    await notifyFiveMinutesRemaining(domain);
  }

  console.log(`[TimeWarden] Notification alarm: ${field} for ${domain}`);
}

/**
 * Handle a limit-reached alarm.
 * Stops tracking and triggers the grace period → blocking flow.
 */
export async function handleLimitAlarm(alarmName: string): Promise<void> {
  const domain = alarmName.slice(ALARM_PREFIX.LIMIT_REACHED.length);

  console.log(`[TimeWarden] Limit reached for ${domain}`);

  // Stop tracking — accumulate remaining time
  const tracking = activeTracking.get(domain);
  if (tracking?.startedAt) {
    await stopTracking(domain);
  }

  // Start the grace period (which eventually blocks)
  await startGracePeriod(domain);
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

  // Compute pause state
  const pauseInfo = getPauseState(
    domain,
    usage?.pausedSeconds ?? 0,
    config.pauseAllowanceMinutes
  );

  return {
    domain,
    timeSpentSeconds: Math.floor(timeSpentSeconds),
    timeRemainingSeconds: Math.floor(timeRemainingSeconds),
    limitMinutes,
    visitCount: usage?.visitCount ?? 0,
    sessionCount: usage?.sessions.length ?? 0,
    isPaused: pauseInfo.isPaused,
    pauseRemainingSeconds: pauseInfo.pauseRemainingSeconds,
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

/**
 * Schedule a flush of active tracking data into the serialized queue.
 *
 * Must be serialized because flushActiveTrackingImpl modifies tracking.startedAt
 * — running it concurrently with startTracking/stopTracking would cause races.
 *
 * Returns a Promise that resolves when the flush completes (so the caller
 * can chain updateBadge after).
 */
export function flushActiveTracking(): Promise<void> {
  return new Promise<void>((resolve) => {
    enqueue(async () => {
      await flushActiveTrackingImpl();
      resolve();
    });
  });
}

/**
 * Flush active tracking data to storage AND reset startedAt timestamps.
 *
 * Unlike persistAllTracking (which doesn't modify in-memory state),
 * this function resets each tracking.startedAt to Date.now() after
 * persisting. This prevents double-counting and ensures that
 * storage.timeSpentSeconds stays in sync with actual elapsed time.
 *
 * Must run inside the serialized queue to avoid races with start/stop.
 */
async function flushActiveTrackingImpl(): Promise<void> {
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

      // Update the last open session's duration (it's still active)
      const lastSession = u.sessions[u.sessions.length - 1];
      if (lastSession && lastSession.endTime === null) {
        lastSession.durationSeconds += elapsed;
      }

      return u;
    });

    // Reset startedAt so the next flush/stop doesn't double-count
    tracking.startedAt = now;
  }
}

// ============================================================
// Pause Functionality
// ============================================================

/**
 * Toggle pause for a domain.
 * Returns { success, isPaused, pauseRemainingSeconds }.
 *
 * When pausing:
 * - Stops tracking (accumulates elapsed time to storage)
 * - Records pause start time
 * - Schedules pause-end alarm for when allowance runs out
 *
 * When resuming:
 * - Records paused seconds to storage
 * - Clears pause-end alarm
 * - Triggers reevaluation to restart tracking if applicable
 */
export async function togglePause(domain: string): Promise<{
  success: boolean;
  isPaused: boolean;
  pauseRemainingSeconds: number;
}> {
  const config = await getDomainConfig(domain);
  if (!config || !config.enabled) {
    return { success: false, isPaused: false, pauseRemainingSeconds: 0 };
  }

  const settings = await getGlobalSettings();
  const date = getCurrentPeriodDate(config, settings.resetTime);
  const usage = await getDomainUsage(domain, date);

  // Can't pause a blocked domain
  if (usage?.blocked) {
    return { success: false, isPaused: false, pauseRemainingSeconds: 0 };
  }

  const pausedSecondsUsed = usage?.pausedSeconds ?? 0;
  const allowanceSeconds = config.pauseAllowanceMinutes * 60;

  if (pausedDomains.has(domain)) {
    // Currently paused → RESUME
    const pauseState = pausedDomains.get(domain)!;
    const pauseElapsed = (Date.now() - pauseState.pausedAt) / 1000;

    // Record paused time to storage
    await updateDomainUsage(domain, date, (u) => {
      u.pausedSeconds += pauseElapsed;
      return u;
    });

    // Clear pause state and alarm
    pausedDomains.delete(domain);
    await browser.alarms.clear(`${PAUSE_ALARM_PREFIX}${domain}`);

    // Trigger reevaluation to potentially restart tracking
    scheduleReevaluation();

    const remaining = Math.max(0, allowanceSeconds - pausedSecondsUsed - pauseElapsed);
    console.log(`[TimeWarden] Resumed ${domain} (paused ${pauseElapsed.toFixed(1)}s, ${remaining.toFixed(0)}s allowance left)`);

    return {
      success: true,
      isPaused: false,
      pauseRemainingSeconds: Math.floor(remaining),
    };
  } else {
    // Not paused → PAUSE
    const remainingAllowance = allowanceSeconds - pausedSecondsUsed;
    if (remainingAllowance <= 0) {
      // No pause allowance left
      return { success: false, isPaused: false, pauseRemainingSeconds: 0 };
    }

    // Stop tracking first (accumulates elapsed to storage)
    const tracking = activeTracking.get(domain);
    if (tracking?.startedAt) {
      await stopTracking(domain);
    }

    // Record pause state
    pausedDomains.set(domain, {
      pausedAt: Date.now(),
      previousPausedSeconds: pausedSecondsUsed,
      allowanceSeconds,
    });

    // Schedule alarm for when allowance runs out
    browser.alarms.create(`${PAUSE_ALARM_PREFIX}${domain}`, {
      when: Date.now() + remainingAllowance * 1000,
    });

    console.log(`[TimeWarden] Paused ${domain} (${remainingAllowance.toFixed(0)}s allowance remaining)`);

    return {
      success: true,
      isPaused: true,
      pauseRemainingSeconds: Math.floor(remainingAllowance),
    };
  }
}

/**
 * Handle a pause-end alarm — pause allowance exhausted.
 * Resume tracking automatically.
 */
export async function handlePauseEndAlarm(alarmName: string): Promise<void> {
  const domain = alarmName.slice(PAUSE_ALARM_PREFIX.length);
  const pauseState = pausedDomains.get(domain);
  if (!pauseState) return;

  const pauseElapsed = (Date.now() - pauseState.pausedAt) / 1000;

  // Record paused time to storage
  const config = await getDomainConfig(domain);
  if (config) {
    const settings = await getGlobalSettings();
    const date = getCurrentPeriodDate(config, settings.resetTime);
    await updateDomainUsage(domain, date, (u) => {
      u.pausedSeconds += pauseElapsed;
      return u;
    });
  }

  // Clear pause state
  pausedDomains.delete(domain);

  // Trigger reevaluation to restart tracking
  scheduleReevaluation();

  console.log(`[TimeWarden] Pause allowance exhausted for ${domain}`);
}

/**
 * Check if an alarm name is a pause-end alarm.
 */
export function isPauseEndAlarm(alarmName: string): boolean {
  return alarmName.startsWith(PAUSE_ALARM_PREFIX);
}

/**
 * Get pause state for a domain.
 * Returns isPaused and remaining pause allowance seconds.
 */
export function getPauseState(domain: string, pausedSecondsFromStorage: number, allowanceMinutes: number): {
  isPaused: boolean;
  pauseRemainingSeconds: number;
} {
  const allowanceSeconds = allowanceMinutes * 60;
  const pauseState = pausedDomains.get(domain);

  if (pauseState) {
    // Currently paused — compute live remaining
    const pauseElapsed = (Date.now() - pauseState.pausedAt) / 1000;
    const totalUsed = pauseState.previousPausedSeconds + pauseElapsed;
    const remaining = Math.max(0, pauseState.allowanceSeconds - totalUsed);
    return { isPaused: true, pauseRemainingSeconds: Math.floor(remaining) };
  }

  // Not paused — return remaining allowance
  const remaining = Math.max(0, allowanceSeconds - pausedSecondsFromStorage);
  return { isPaused: false, pauseRemainingSeconds: Math.floor(remaining) };
}

// ============================================================
// Toolbar Badge
// ============================================================

/**
 * Update the toolbar badge to show time remaining for the current active domain.
 * Shows remaining time for the focused tracked domain, or clears badge if none.
 */
export async function updateBadge(): Promise<void> {
  // Find the domain of the currently active tab
  const currentDomain = tabDomainMap.get(activeTabId);

  if (!currentDomain) {
    // Active tab is not a tracked domain — clear badge
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  // Get status for this domain
  const status = await getStatusForDomain(currentDomain);

  if (status.isBlocked) {
    await browser.action.setBadgeText({ text: '!' });
    await browser.action.setBadgeBackgroundColor({ color: '#EF4444' }); // red
    return;
  }

  if (status.isPaused) {
    await browser.action.setBadgeText({ text: '||' });
    await browser.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // amber
    return;
  }

  const badgeText = formatBadgeText(status.timeRemainingSeconds, false);
  const remainingPercent = status.limitMinutes > 0
    ? (status.timeRemainingSeconds / (status.limitMinutes * 60)) * 100
    : 100;

  let color: string;
  if (remainingPercent > 25) {
    color = '#22C55E'; // green
  } else if (remainingPercent > 10) {
    color = '#F59E0B'; // yellow
  } else {
    color = '#EF4444'; // red
  }

  await browser.action.setBadgeText({ text: badgeText });
  await browser.action.setBadgeBackgroundColor({ color });
}
