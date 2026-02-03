/**
 * Reset Manager — per-domain per-day reset scheduling and execution.
 *
 * Responsibilities:
 * - Schedule browser.alarms for each domain's next reset time
 * - Handle reset alarm fires (clear tracking state, prepare for new period)
 * - Detect missed resets on startup (browser was closed during a reset)
 * - Reschedule resets when domain config changes
 *
 * Each domain resets independently based on its effective reset time,
 * which can vary by day-of-week.
 */

import { ALARM_PREFIX } from '$lib/constants';
import type { DayOfWeek, DomainConfig } from '$lib/types';
import { getCurrentPeriodDate, getEffectiveResetTime, parseTimeString } from '$lib/utils';
import {
    getDomainConfig,
    getDomainConfigs,
    getGlobalSettings,
    loadStorage,
    updateDomainUsage,
} from './storage-manager';
import { activeTracking } from './tab-tracker';

// ============================================================
// Reset Alarm Scheduling
// ============================================================

/**
 * Schedule the next reset alarm for a single domain.
 * Calculates when the current period ends and sets an alarm for that time.
 */
export async function scheduleNextReset(domain: string): Promise<void> {
    const config = await getDomainConfig(domain);
    if (!config || !config.enabled) {
        // Clear any existing alarm for disabled/removed domains
        await browser.alarms.clear(`${ALARM_PREFIX.RESET}${domain}`);
        return;
    }

    const settings = await getGlobalSettings();
    const now = new Date();

    // Determine the next reset time
    const nextResetTime = computeNextResetTime(now, config, settings.resetTime);
    if (!nextResetTime) return;

    const delayMs = nextResetTime.getTime() - now.getTime();
    if (delayMs <= 0) {
        // Reset should have already happened — will be caught by checkMissedResets
        return;
    }

    browser.alarms.create(`${ALARM_PREFIX.RESET}${domain}`, {
        when: nextResetTime.getTime(),
    });

    console.log(
        `[TimeWarden] Scheduled reset for ${domain} at ${nextResetTime.toLocaleString()} (${Math.round(delayMs / 60000)}min)`,
    );
}

/**
 * Schedule reset alarms for all enabled domains.
 * Called on startup and when domain configs change.
 */
export async function scheduleAllResets(): Promise<void> {
    const configs = await getDomainConfigs();

    for (const config of configs) {
        if (!config.enabled) continue;
        await scheduleNextReset(config.domain);
    }
}

// ============================================================
// Reset Execution
// ============================================================

/**
 * Handle a reset alarm firing.
 * This means the current period has ended and a new one begins.
 *
 * Actions:
 * 1. Stop any active tracking for this domain (accumulates final time)
 * 2. The new period's usage will be created lazily on next visit
 * 3. Schedule the next reset
 * 4. Trigger reevaluation (domain may start tracking again in new period)
 *
 * @param domain The domain whose reset alarm fired
 * @param onReevaluate Callback to trigger reevaluation (provided by index.ts)
 */
export async function handleResetAlarm(domain: string, onReevaluate: () => void): Promise<void> {
    console.log(`[TimeWarden] Reset alarm fired for ${domain}`);

    const tracking = activeTracking.get(domain);

    // If currently tracking, we need to stop and accumulate the time
    // from the old period before the new period begins.
    // The stopTracking call in the reevaluation will handle this
    // since the period date will have changed.
    if (tracking?.startedAt) {
        // Force a reevaluation which will stop/restart tracking.
        // The stop will persist to the OLD period (via getCurrentPeriodDate),
        // and the restart will create a new usage entry for the NEW period.
        //
        // Actually, we need to be careful here. If we reevaluate now,
        // getCurrentPeriodDate will return the NEW period date. So the stop
        // would accumulate time into the new period, which is wrong.
        //
        // To handle this correctly, we manually stop tracking with the
        // elapsed time computed up to the reset moment, then let
        // reevaluation restart in the new period.

        const elapsed = (Date.now() - tracking.startedAt) / 1000;
        tracking.startedAt = null;
        tracking.reason = null;

        // Persist to the OLD period — we need to figure out the old period date.
        // Since the reset just happened, "now" is in the new period.
        // The old period date is the one before the reset.
        // We can compute it by using a time just before now.
        const justBeforeReset = new Date(Date.now() - 1000);
        const config = await getDomainConfig(domain);
        if (config && elapsed > 0) {
            const settings = await getGlobalSettings();
            const oldDate = getCurrentPeriodDate(config, settings.resetTime, justBeforeReset);

            await updateDomainUsage(domain, oldDate, (u) => {
                u.timeSpentSeconds += elapsed;

                // End last open session
                const lastSession = u.sessions[u.sessions.length - 1];
                if (lastSession && lastSession.endTime === null) {
                    lastSession.endTime = new Date().toISOString();
                    lastSession.durationSeconds = elapsed;
                }

                return u;
            });

            console.log(
                `[TimeWarden] Accumulated ${elapsed.toFixed(1)}s to old period for ${domain}`,
            );
        }
    }

    // Schedule the next reset
    await scheduleNextReset(domain);

    // Trigger reevaluation — if tabs are still open, tracking will
    // restart and create a new usage entry for the new period
    onReevaluate();
}

// ============================================================
// Missed Reset Detection
// ============================================================

/**
 * Check for missed resets on startup.
 * If the browser was closed during a scheduled reset, the alarm didn't fire.
 * We detect this by checking if any domain has usage data from a period
 * that has since ended.
 *
 * In practice, getCurrentPeriodDate() already handles this correctly —
 * when we call it now, it returns the current period date. Any old period
 * data is simply in the past. The main action needed is to schedule
 * new reset alarms for all domains.
 */
export async function checkMissedResets(): Promise<void> {
    const storage = await loadStorage();

    for (const config of storage.domains) {
        if (!config.enabled) continue;

        const currentDate = getCurrentPeriodDate(config, storage.settings.resetTime);

        // Check if there's a usage entry from a previous period that's still marked as blocked
        // With the period change, the domain should no longer be blocked in the new period
        // This is handled naturally — the new period's usage entry won't have blocked=true

        // The main thing is ensuring reset alarms are scheduled
        // (they were lost when the browser closed)
        await scheduleNextReset(config.domain);

        console.log(
            `[TimeWarden] Checked reset for ${config.domain} (current period: ${currentDate})`,
        );
    }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Compute the next reset time for a domain after the given time.
 *
 * The reset time can differ per day-of-week. We check today's reset time
 * first — if it hasn't happened yet, that's the next reset. If it has,
 * we look at tomorrow's reset time.
 */
function computeNextResetTime(
    now: Date,
    config: DomainConfig,
    globalResetTime: string,
): Date | null {
    // Check today's reset time
    const todayDay = String(now.getDay()) as DayOfWeek;
    const todayResetStr = getEffectiveResetTime(config, todayDay, globalResetTime);
    const todayParsed = parseTimeString(todayResetStr);

    if (todayParsed) {
        const resetToday = new Date(now);
        resetToday.setHours(todayParsed.hours, todayParsed.minutes, 0, 0);

        if (now < resetToday) {
            // Today's reset hasn't happened yet
            return resetToday;
        }
    }

    // Today's reset already happened — check tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = String(tomorrow.getDay()) as DayOfWeek;
    const tomorrowResetStr = getEffectiveResetTime(config, tomorrowDay, globalResetTime);
    const tomorrowParsed = parseTimeString(tomorrowResetStr);

    if (tomorrowParsed) {
        const resetTomorrow = new Date(tomorrow);
        resetTomorrow.setHours(tomorrowParsed.hours, tomorrowParsed.minutes, 0, 0);
        return resetTomorrow;
    }

    return null;
}
