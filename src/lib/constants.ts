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

/** Default pause allowance in minutes for new domains */
export const DEFAULT_PAUSE_ALLOWANCE_MINUTES = 5;

/** Default daily limit in minutes for new domains */
export const DEFAULT_DAILY_LIMIT_MINUTES = 60;

/** Minimum configurable limit in minutes */
export const MIN_LIMIT_MINUTES = 1;

/** Maximum configurable limit in minutes (24 hours) */
export const MAX_LIMIT_MINUTES = 1440;

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
