import type { GlobalSettings, NotificationRule, StorageSchema } from './types';

/** Maximum number of daily usage entries to keep */
export const MAX_USAGE_DAYS = 30;

/** Default notification rules for new installs and global settings */
export const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  {
    id: 'default-10pct',
    enabled: true,
    type: 'percentage',
    percentageUsed: 90, // Fires when 90% used = 10% remaining
  },
];

/** Default global settings */
export const DEFAULT_SETTINGS: GlobalSettings = {
  resetTime: '00:00',
  notificationsEnabled: true,
  gracePeriodSeconds: 60,
  theme: 'system',
  notificationRules: DEFAULT_NOTIFICATION_RULES,
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

/** Minimum configurable limit in seconds (1 second) */
export const MIN_LIMIT_SECONDS = 1;

/** Maximum configurable limit in seconds (24 hours) */
export const MAX_LIMIT_SECONDS = 86400;

/** Idle detection threshold in seconds */
export const IDLE_THRESHOLD_SECONDS = 60;

/** Alarm name prefixes */
export const ALARM_PREFIX = {
  /** Flexible notification rule alarm: "notify-rule-{ruleId}::{domain}" */
  NOTIFY_RULE: 'notify-rule-',
  LIMIT_REACHED: 'limit-',
  RESET: 'reset-',
} as const;

/** Separator between rule ID and domain in notification alarm names */
export const ALARM_RULE_SEPARATOR = '::';
