// ============================================================
// Domain Configuration
// ============================================================

/** Day of week: 0=Sunday ... 6=Saturday */
export type DayOfWeek = '0' | '1' | '2' | '3' | '4' | '5' | '6';

/** Per-day override for a domain's limit and/or reset time */
export interface DayOverride {
  /** Override daily limit for this day in seconds (omit = use domain default) */
  limitSeconds?: number;
  /** Override reset time for this day, "HH:MM" (omit = use domain default) */
  resetTime?: string;
}

/** Configuration for a single tracked domain */
export interface DomainConfig {
  /** Exact hostname, e.g. "youtube.com" */
  domain: string;
  /** Default daily limit in seconds */
  dailyLimitSeconds: number;
  /** Whether tracking is active */
  enabled: boolean;
  /** ISO 8601 timestamp when this domain was added */
  createdAt: string;
  /** Max pause seconds per day (default: 300) */
  pauseAllowanceSeconds: number;
  /** Domain-level default reset time, "HH:MM" (null = use global) */
  resetTime: string | null;
  /** Per-day config overrides */
  dayOverrides: Partial<Record<DayOfWeek, DayOverride>>;
}

// ============================================================
// Usage Data
// ============================================================

/** A single tracking session */
export interface Session {
  /** ISO 8601 start time */
  startTime: string;
  /** ISO 8601 end time (null = currently active) */
  endTime: string | null;
  /** Finalized duration in seconds (updated on session end) */
  durationSeconds: number;
}

/** Usage data for a single domain within a single day/period */
export interface DomainUsage {
  /** Exact hostname */
  domain: string;
  /** Total active time in seconds */
  timeSpentSeconds: number;
  /** Number of navigations to this domain in this period */
  visitCount: number;
  /** Individual tracking sessions */
  sessions: Session[];
  /** Total paused time in seconds */
  pausedSeconds: number;
  /** IMMUTABLE snapshot of the limit for this period in seconds */
  limitSeconds: number;
  /** IMMUTABLE snapshot of the reset time for this period */
  resetTime: string;
  /** Which threshold notifications have fired */
  notifications: {
    /** Fired when 90% of time used */
    tenPercent: boolean;
  };
  /** Whether this domain is currently blocked */
  blocked: boolean;
  /** ISO 8601 timestamp when blocking occurred (null if not blocked) */
  blockedAt: string | null;
}

/** Usage data for a single calendar day */
export interface DailyUsage {
  /** "YYYY-MM-DD" — calendar date this period started on */
  date: string;
  /** Only domains that were actually visited this period */
  domains: DomainUsage[];
}

// ============================================================
// Settings
// ============================================================

export interface GlobalSettings {
  /** Default reset time "HH:MM" (default: "00:00") */
  resetTime: string;
  /** Whether browser notifications are enabled */
  notificationsEnabled: boolean;
  /** Grace period before blocking in seconds (default: 60) */
  gracePeriodSeconds: number;
  /** UI theme preference */
  theme: 'light' | 'dark' | 'system';
}

// ============================================================
// Full Storage Shape
// ============================================================

export interface StorageSchema {
  /** All configured domains */
  domains: DomainConfig[];
  /** Rolling 30-day usage array, newest last */
  usage: DailyUsage[];
  /** Global settings */
  settings: GlobalSettings;
}

// ============================================================
// Runtime State (in-memory only, NOT persisted)
// ============================================================

/** Per-tab state tracked in memory */
export interface TabState {
  /** Whether the tab is currently producing audio */
  audible: boolean;
}

/** In-memory tracking state for a single domain */
export interface DomainTracking {
  /** Timestamp (ms) when current tracking began (null = not tracking) */
  startedAt: number | null;
  /** Map of tabId -> tab state for all open tabs of this domain */
  tabs: Map<number, TabState>;
  /** Why we're currently tracking this domain */
  reason: 'focused' | 'audible' | null;
}

// ============================================================
// Messages (Background <-> UI)
// ============================================================

export type Message =
  | { type: 'GET_STATUS'; domain: string }
  | { type: 'GET_ALL_STATUS' }
  | { type: 'TOGGLE_PAUSE'; domain: string }
  | { type: 'GET_DASHBOARD_DATA'; range: '7d' | '14d' | '30d' }
  | { type: 'GET_SETTINGS' }
  | { type: 'GET_DOMAIN_CONFIGS' }
  | { type: 'SAVE_DOMAIN_CONFIG'; config: DomainConfig }
  | { type: 'REMOVE_DOMAIN'; domain: string }
  | { type: 'SAVE_GLOBAL_SETTINGS'; settings: GlobalSettings }
  | { type: 'GET_BLOCKED_STATUS'; domain: string };

/** Response for the blocked page stats query */
export interface BlockedStatusResponse {
  domain: string;
  timeSpentSeconds: number;
  limitSeconds: number;
  visitCount: number;
  sessionCount: number;
  longestSessionSeconds: number;
  resetTime: string;
  blockedAt: string | null;
}

export interface StatusResponse {
  domain: string;
  timeSpentSeconds: number;
  timeRemainingSeconds: number;
  limitSeconds: number;
  visitCount: number;
  sessionCount: number;
  isPaused: boolean;
  pauseRemainingSeconds: number;
  isBlocked: boolean;
  isTracking: boolean;
  trackingReason: 'focused' | 'audible' | null;
}
