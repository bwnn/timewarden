/**
 * Dashboard data aggregation utilities.
 *
 * All stats are computed on demand from the raw DailyUsage[] array.
 * No separate stats store is maintained.
 */

import type { DailyUsage, Session } from '$lib/types';
import { formatDate } from '$lib/utils';

// ============================================================
// Types for aggregated data
// ============================================================

export interface DomainDaySummary {
    domain: string;
    timeSpentSeconds: number;
    limitSeconds: number;
    visitCount: number;
    sessionCount: number;
    blocked: boolean;
    pausedSeconds: number;
    sessions: Session[];
}

export interface DaySummary {
    date: string;
    totalSeconds: number;
    domains: DomainDaySummary[];
}

export interface DomainAggregate {
    domain: string;
    totalSeconds: number;
    dailyAverageSeconds: number;
    totalSessions: number;
    totalVisits: number;
    daysActive: number;
    daysBlocked: number;
    longestSessionSeconds: number;
    averageSessionSeconds: number;
}

export interface SessionAnalyticsData {
    domain: string;
    longestSessionSeconds: number;
    averageSessionSeconds: number;
    totalSessions: number;
    /** Hour of day (0-23) -> session count */
    sessionsByHour: number[];
    /** Day of week (0=Sun..6=Sat) -> session count */
    sessionsByDay: number[];
    /** Average time between consecutive sessions in seconds */
    avgTimeBetweenSessions: number;
}

export interface BlockingStatsData {
    /** Total blocks across all domains in range */
    totalBlocks: number;
    /** Blocks per week (avg) */
    blocksPerWeek: number;
    /** Hour of day (0-23) -> block count */
    blocksByHour: number[];
    /** Current streak of consecutive days ALL domains stayed under limit */
    currentUnderLimitStreak: number;
    /** Longest streak of consecutive days ALL domains stayed under limit */
    longestUnderLimitStreak: number;
    /** Per-domain block counts */
    blocksByDomain: { domain: string; count: number }[];
}

export interface BehavioralInsightsData {
    /** Domain with most total time */
    mostUsedDomain: string | null;
    mostUsedDomainSeconds: number;
    /** Domain with highest visit frequency (visits per day active) */
    mostCompulsiveDomain: string | null;
    mostCompulsiveVisitsPerDay: number;
    /** Hour of day (0-23) -> total seconds tracked */
    usageByHour: number[];
    /** Weekday avg seconds vs weekend avg seconds */
    weekdayAvgSeconds: number;
    weekendAvgSeconds: number;
    /** Total time saved: sum of (limit - actual) for days where limit was NOT hit */
    totalTimeSavedSeconds: number;
}

// ============================================================
// Filtering
// ============================================================

/**
 * Filter usage data by date range. Returns entries within the last N days.
 */
export function filterByRange(usage: DailyUsage[], range: '7d' | '14d' | '30d'): DailyUsage[] {
    const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = formatDate(cutoff);

    return usage.filter((day) => day.date > cutoffStr);
}

/**
 * Get today's usage entry (or null if none exists).
 */
export function getTodayUsage(usage: DailyUsage[]): DailyUsage | null {
    const today = formatDate(new Date());
    return usage.find((day) => day.date === today) ?? null;
}

// ============================================================
// Aggregation
// ============================================================

/**
 * Build day-by-day summaries with per-domain and total seconds.
 */
export function buildDaySummaries(usage: DailyUsage[]): DaySummary[] {
    return usage.map((day) => {
        const domains: DomainDaySummary[] = day.domains.map((du) => ({
            domain: du.domain,
            timeSpentSeconds: du.timeSpentSeconds,
            limitSeconds: du.limitSeconds,
            visitCount: du.visitCount,
            sessionCount: du.sessions.length,
            blocked: du.blocked,
            pausedSeconds: du.pausedSeconds,
            sessions: du.sessions,
        }));

        const totalSeconds = domains.reduce((sum, d) => sum + d.timeSpentSeconds, 0);

        return { date: day.date, totalSeconds, domains };
    });
}

/**
 * Aggregate per-domain totals across the given usage data.
 */
export function aggregateByDomain(usage: DailyUsage[]): DomainAggregate[] {
    const map = new Map<
        string,
        {
            totalSeconds: number;
            totalSessions: number;
            totalVisits: number;
            daysActive: number;
            daysBlocked: number;
            longestSession: number;
            allSessionDurations: number[];
        }
    >();

    for (const day of usage) {
        for (const du of day.domains) {
            let entry = map.get(du.domain);
            if (!entry) {
                entry = {
                    totalSeconds: 0,
                    totalSessions: 0,
                    totalVisits: 0,
                    daysActive: 0,
                    daysBlocked: 0,
                    longestSession: 0,
                    allSessionDurations: [],
                };
                map.set(du.domain, entry);
            }

            entry.totalSeconds += du.timeSpentSeconds;
            entry.totalSessions += du.sessions.length;
            entry.totalVisits += du.visitCount;
            entry.daysActive += 1;
            if (du.blocked) entry.daysBlocked += 1;

            for (const session of du.sessions) {
                const dur = session.durationSeconds;
                if (dur > entry.longestSession) entry.longestSession = dur;
                entry.allSessionDurations.push(dur);
            }
        }
    }

    const daysInRange = usage.length || 1;

    const result: DomainAggregate[] = [];
    for (const [domain, entry] of map) {
        const avgSession =
            entry.allSessionDurations.length > 0
                ? entry.allSessionDurations.reduce((a, b) => a + b, 0) /
                  entry.allSessionDurations.length
                : 0;

        result.push({
            domain,
            totalSeconds: entry.totalSeconds,
            dailyAverageSeconds: entry.totalSeconds / daysInRange,
            totalSessions: entry.totalSessions,
            totalVisits: entry.totalVisits,
            daysActive: entry.daysActive,
            daysBlocked: entry.daysBlocked,
            longestSessionSeconds: Math.floor(entry.longestSession),
            averageSessionSeconds: Math.floor(avgSession),
        });
    }

    // Sort by total time descending
    result.sort((a, b) => b.totalSeconds - a.totalSeconds);

    return result;
}

/**
 * Generate a complete list of dates in range, filling gaps with zero-usage entries.
 * This ensures the chart shows all days, even those with no tracking.
 */
export function fillDateGaps(summaries: DaySummary[], range: '7d' | '14d' | '30d'): DaySummary[] {
    const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
    const now = new Date();
    const dateMap = new Map<string, DaySummary>();

    for (const s of summaries) {
        dateMap.set(s.date, s);
    }

    const result: DaySummary[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = formatDate(d);
        result.push(dateMap.get(dateStr) ?? { date: dateStr, totalSeconds: 0, domains: [] });
    }

    return result;
}

/**
 * Get all unique domains across the usage data.
 */
export function getUniqueDomains(usage: DailyUsage[]): string[] {
    const set = new Set<string>();
    for (const day of usage) {
        for (const du of day.domains) {
            set.add(du.domain);
        }
    }
    return Array.from(set).sort();
}

/**
 * Build per-domain daily time series for stacked chart.
 * Returns a map of domain -> array of seconds (one per date in the filled summaries).
 */
export function buildDomainTimeSeries(
    filledSummaries: DaySummary[],
    domains: string[],
): Map<string, number[]> {
    const series = new Map<string, number[]>();
    for (const domain of domains) {
        series.set(domain, []);
    }

    for (const day of filledSummaries) {
        const domainMap = new Map<string, number>();
        for (const d of day.domains) {
            domainMap.set(d.domain, d.timeSpentSeconds);
        }
        for (const domain of domains) {
            series.get(domain)?.push(domainMap.get(domain) ?? 0);
        }
    }

    return series;
}

// ============================================================
// Session Analytics
// ============================================================

/**
 * Compute session analytics for all domains combined, or a specific domain.
 */
export function computeSessionAnalytics(
    usage: DailyUsage[],
    domain?: string,
): SessionAnalyticsData {
    const sessionsByHour = new Array(24).fill(0) as number[];
    const sessionsByDay = new Array(7).fill(0) as number[];
    const allDurations: number[] = [];
    const allStartTimes: number[] = [];
    let longestSession = 0;
    const label = domain ?? 'All domains';

    for (const day of usage) {
        const domainUsages = domain ? day.domains.filter((d) => d.domain === domain) : day.domains;

        for (const du of domainUsages) {
            for (const session of du.sessions) {
                const start = new Date(session.startTime);
                const hour = start.getHours();
                const dayOfWeek = start.getDay();
                sessionsByHour[hour] += 1;
                sessionsByDay[dayOfWeek] += 1;
                allDurations.push(session.durationSeconds);
                allStartTimes.push(start.getTime());
                if (session.durationSeconds > longestSession) {
                    longestSession = session.durationSeconds;
                }
            }
        }
    }

    const avgDuration =
        allDurations.length > 0 ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length : 0;

    // Average time between consecutive sessions (sorted by start time)
    let avgTimeBetween = 0;
    if (allStartTimes.length > 1) {
        allStartTimes.sort((a, b) => a - b);
        let totalGap = 0;
        for (let i = 1; i < allStartTimes.length; i++) {
            totalGap += allStartTimes[i] - allStartTimes[i - 1];
        }
        avgTimeBetween = totalGap / (allStartTimes.length - 1) / 1000;
    }

    return {
        domain: label,
        longestSessionSeconds: Math.floor(longestSession),
        averageSessionSeconds: Math.floor(avgDuration),
        totalSessions: allDurations.length,
        sessionsByHour,
        sessionsByDay,
        avgTimeBetweenSessions: Math.floor(avgTimeBetween),
    };
}

// ============================================================
// Blocking Stats
// ============================================================

/**
 * Compute blocking statistics from usage data.
 */
export function computeBlockingStats(usage: DailyUsage[]): BlockingStatsData {
    const blocksByHour = new Array(24).fill(0) as number[];
    const blocksByDomainMap = new Map<string, number>();
    let totalBlocks = 0;

    for (const day of usage) {
        for (const du of day.domains) {
            if (du.blocked && du.blockedAt) {
                totalBlocks += 1;
                const blockedDate = new Date(du.blockedAt);
                blocksByHour[blockedDate.getHours()] += 1;

                blocksByDomainMap.set(du.domain, (blocksByDomainMap.get(du.domain) ?? 0) + 1);
            }
        }
    }

    // Blocks per week
    const daysInRange = usage.length || 1;
    const weeksInRange = daysInRange / 7;
    const blocksPerWeek = weeksInRange > 0 ? totalBlocks / weeksInRange : 0;

    // Under-limit streak calculation
    // Sort days chronologically
    const sortedDays = [...usage].sort((a, b) => a.date.localeCompare(b.date));
    let currentStreak = 0;
    let longestStreak = 0;

    for (const day of sortedDays) {
        const anyBlocked = day.domains.some((du) => du.blocked);
        if (!anyBlocked) {
            currentStreak += 1;
            if (currentStreak > longestStreak) longestStreak = currentStreak;
        } else {
            currentStreak = 0;
        }
    }

    const blocksByDomain = Array.from(blocksByDomainMap.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count);

    return {
        totalBlocks,
        blocksPerWeek: Math.round(blocksPerWeek * 10) / 10,
        blocksByHour,
        currentUnderLimitStreak: currentStreak,
        longestUnderLimitStreak: longestStreak,
        blocksByDomain,
    };
}

// ============================================================
// Behavioral Insights
// ============================================================

/**
 * Compute behavioral insights from usage data.
 */
export function computeBehavioralInsights(usage: DailyUsage[]): BehavioralInsightsData {
    const usageByHour = new Array(24).fill(0) as number[];
    const domainTotals = new Map<string, number>();
    const domainVisits = new Map<string, { visits: number; daysActive: number }>();
    let totalTimeSaved = 0;

    let weekdayTotalSeconds = 0;
    let weekendTotalSeconds = 0;
    let weekdayDays = 0;
    let weekendDays = 0;

    for (const day of usage) {
        const date = new Date(`${day.date}T12:00:00`); // Noon to avoid timezone issues
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        let dayTotal = 0;
        for (const du of day.domains) {
            dayTotal += du.timeSpentSeconds;

            // Domain totals
            domainTotals.set(du.domain, (domainTotals.get(du.domain) ?? 0) + du.timeSpentSeconds);

            // Domain visit frequency
            const visitEntry = domainVisits.get(du.domain) ?? { visits: 0, daysActive: 0 };
            visitEntry.visits += du.visitCount;
            visitEntry.daysActive += 1;
            domainVisits.set(du.domain, visitEntry);

            // Usage by hour from sessions
            for (const session of du.sessions) {
                const start = new Date(session.startTime);
                const hour = start.getHours();
                // Distribute session duration starting from the start hour
                // Simplified: attribute all seconds to the start hour
                usageByHour[hour] += session.durationSeconds;
            }

            // Time saved: if domain NOT blocked, saved = limit - actual
            if (!du.blocked) {
                const saved = du.limitSeconds - du.timeSpentSeconds;
                if (saved > 0) {
                    totalTimeSaved += saved;
                }
            }
        }

        if (isWeekend) {
            weekendTotalSeconds += dayTotal;
            weekendDays += 1;
        } else {
            weekdayTotalSeconds += dayTotal;
            weekdayDays += 1;
        }
    }

    // Most used domain
    let mostUsedDomain: string | null = null;
    let mostUsedDomainSeconds = 0;
    for (const [domain, total] of domainTotals) {
        if (total > mostUsedDomainSeconds) {
            mostUsedDomain = domain;
            mostUsedDomainSeconds = total;
        }
    }

    // Most compulsive domain (highest visits per day active)
    let mostCompulsiveDomain: string | null = null;
    let mostCompulsiveVisitsPerDay = 0;
    for (const [domain, entry] of domainVisits) {
        const vpd = entry.daysActive > 0 ? entry.visits / entry.daysActive : 0;
        if (vpd > mostCompulsiveVisitsPerDay) {
            mostCompulsiveDomain = domain;
            mostCompulsiveVisitsPerDay = vpd;
        }
    }

    return {
        mostUsedDomain,
        mostUsedDomainSeconds,
        mostCompulsiveDomain,
        mostCompulsiveVisitsPerDay: Math.round(mostCompulsiveVisitsPerDay * 10) / 10,
        usageByHour,
        weekdayAvgSeconds: weekdayDays > 0 ? Math.floor(weekdayTotalSeconds / weekdayDays) : 0,
        weekendAvgSeconds: weekendDays > 0 ? Math.floor(weekendTotalSeconds / weekendDays) : 0,
        totalTimeSavedSeconds: totalTimeSaved,
    };
}

// ============================================================
// Color helpers
// ============================================================

/** Generate a deterministic color for a domain by index. */
export function getDomainColor(_domain: string, index: number): string {
    const colors = [
        '#3b82f6', // blue
        '#ef4444', // red
        '#10b981', // emerald
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#06b6d4', // cyan
        '#84cc16', // lime
        '#f97316', // orange
        '#6366f1', // indigo
    ];
    return colors[index % colors.length];
}

/** Format seconds into compact hours string: "2.5h" or "35m" */
export function formatCompactTime(seconds: number): string {
    if (seconds >= 3600) {
        const hours = seconds / 3600;
        return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m`;
    return `${Math.floor(seconds)}s`;
}
