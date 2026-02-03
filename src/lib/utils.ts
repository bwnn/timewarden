import type { DayOfWeek, DomainConfig } from './types';

// ============================================================
// Time Formatting
// ============================================================

/**
 * Format seconds into "Xh Ym" or "Xm Ys" display string.
 * - >= 1 hour: "1h 23m"
 * - >= 1 minute: "23m"
 * - < 1 minute: "45s"
 */
export function formatTimeRemaining(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m`;
    }
    return `${secs}s`;
}

/**
 * Format seconds into "H:MM:SS" or "M:SS" for precise display.
 */
export function formatTimePrecise(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${minutes}:${pad(secs)}`;
}

/**
 * Format seconds into a human-readable limit string.
 * - >= 3600: "2h 30m" or "2h"
 * - >= 60: "30m"
 * - < 60: "30s"
 */
export function formatLimitSeconds(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0 && mins > 0) {
        return `${hours}h ${mins}m`;
    }
    if (hours > 0) {
        return `${hours}h`;
    }
    if (mins > 0) {
        return `${mins}m`;
    }
    return `${secs}s`;
}

/**
 * Format a badge string for the extension toolbar icon.
 * - >= 60 min remaining: "1:23" (hours:minutes)
 * - < 60 min remaining: "23m"
 * - Blocked: "!"
 */
export function formatBadgeText(remainingSeconds: number, isBlocked: boolean): string {
    if (isBlocked) return '!';

    const minutes = Math.floor(remainingSeconds / 60);
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}:${mins.toString().padStart(2, '0')}`;
    }
    return `${minutes}m`;
}

// ============================================================
// Date Helpers
// ============================================================

/**
 * Format a Date into "YYYY-MM-DD" using local time.
 */
export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get today's date as "YYYY-MM-DD".
 */
export function getTodayDate(): string {
    return formatDate(new Date());
}

/**
 * Parse a "HH:MM" time string into hours and minutes.
 * Returns null if the format is invalid.
 */
export function parseTimeString(time: string): { hours: number; minutes: number } | null {
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return { hours, minutes };
}

/**
 * Validate a "HH:MM" time string.
 */
export function isValidTimeString(time: string): boolean {
    return parseTimeString(time) !== null;
}

/**
 * Get the day of week name from a DayOfWeek value.
 */
export function getDayName(day: DayOfWeek): string {
    const names: Record<DayOfWeek, string> = {
        '0': 'Sunday',
        '1': 'Monday',
        '2': 'Tuesday',
        '3': 'Wednesday',
        '4': 'Thursday',
        '5': 'Friday',
        '6': 'Saturday',
    };
    return names[day];
}

/**
 * Get short day name (3 letters).
 */
export function getDayShortName(day: DayOfWeek): string {
    return getDayName(day).slice(0, 3);
}

// ============================================================
// Reset Time Resolution
// ============================================================

/**
 * Get the effective reset time for a domain on a given day.
 * Resolution hierarchy (most specific wins):
 * 1. domain.dayOverrides[day].resetTime
 * 2. domain.resetTime
 * 3. globalResetTime
 */
export function getEffectiveResetTime(
    config: DomainConfig,
    day: DayOfWeek,
    globalResetTime: string,
): string {
    return config.dayOverrides[day]?.resetTime ?? config.resetTime ?? globalResetTime;
}

/**
 * Get the effective daily limit in seconds for a domain on a given day.
 * Resolution hierarchy:
 * 1. domain.dayOverrides[day].limitSeconds
 * 2. domain.dailyLimitSeconds
 */
export function getEffectiveLimit(config: DomainConfig, day: DayOfWeek): number {
    return config.dayOverrides[day]?.limitSeconds ?? config.dailyLimitSeconds;
}

/**
 * Determine which usage date a domain maps to, given its reset time.
 * If we're before today's reset time, we're still in yesterday's period.
 */
export function getCurrentPeriodDate(
    config: DomainConfig,
    globalResetTime: string,
    now: Date = new Date(),
): string {
    const day = String(now.getDay()) as DayOfWeek;
    const resetTime = getEffectiveResetTime(config, day, globalResetTime);
    const parsed = parseTimeString(resetTime);

    if (!parsed) {
        // Fallback: midnight
        return formatDate(now);
    }

    const resetToday = new Date(now);
    resetToday.setHours(parsed.hours, parsed.minutes, 0, 0);

    if (now < resetToday) {
        // Before today's reset -> still in yesterday's period
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return formatDate(yesterday);
    }

    return formatDate(now);
}

// ============================================================
// Percentage / Progress Helpers
// ============================================================

/**
 * Calculate progress percentage (0-100) of time used.
 */
export function getUsagePercent(timeSpentSeconds: number, limitSeconds: number): number {
    if (limitSeconds <= 0) return 100;
    return Math.min(100, (timeSpentSeconds / limitSeconds) * 100);
}

/**
 * Get the color category based on remaining percentage.
 * - green: >25% remaining
 * - yellow: 10-25% remaining
 * - red: <10% remaining
 */
export function getProgressColor(
    timeSpentSeconds: number,
    limitSeconds: number,
): 'green' | 'yellow' | 'red' {
    const usedPercent = getUsagePercent(timeSpentSeconds, limitSeconds);
    const remainingPercent = 100 - usedPercent;

    if (remainingPercent > 25) return 'green';
    if (remainingPercent > 10) return 'yellow';
    return 'red';
}
