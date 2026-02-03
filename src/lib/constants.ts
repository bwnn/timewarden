import type { GlobalSettings, StorageSchema } from './types';

/** Maximum number of daily usage entries to keep */
export const MAX_USAGE_DAYS = 30;

/** Default global settings */
export const DEFAULT_SETTINGS: GlobalSettings = {
  resetTime: '00:00',
  notificationsEnabled: true,
  gracePeriodSeconds: 60,
  theme: 'system',
};

/** Default storage state for a fresh install */
export const DEFAULT_STORAGE: StorageSchema = {
  domains: [],
  usage: [],
  settings: { ...DEFAULT_SETTINGS },
};

/** Default pause allowance in seconds for new domains (5 minutes) */
export const DEFAULT_PAUSE_ALLOWANCE_SECONDS = 300;

/** Default daily limit in seconds for new domains (1 hour) */
export const DEFAULT_DAILY_LIMIT_SECONDS = 3600;

/** Minimum configurable limit in seconds (1 minute) */
export const MIN_LIMIT_SECONDS = 60;

/** Maximum configurable limit in seconds (24 hours) */
export const MAX_LIMIT_SECONDS = 86400;

/** Idle detection threshold in seconds */
export const IDLE_THRESHOLD_SECONDS = 60;

/** Alarm name prefixes */
export const ALARM_PREFIX = {
  NOTIFY_TEN_PERCENT: 'notify-10pct-',
  LIMIT_REACHED: 'limit-',
  RESET: 'reset-',
} as const;

/** Notification thresholds */
export const NOTIFICATION_THRESHOLDS = {
  /** Percentage of limit used before "10% remaining" notification */
  TEN_PERCENT_USED: 0.9,
} as const;
