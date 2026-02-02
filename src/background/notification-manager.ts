/**
 * Notification Manager — dispatches browser notifications for time limit warnings.
 *
 * Responsibilities:
 * - Dispatch "10% remaining" and "5 minutes remaining" notifications
 * - Dispatch "grace period starting" notification when limit is reached
 * - Track notification clicks to open the popup
 * - Respect the user's notificationsEnabled setting
 *
 * Called by timer-engine.ts when alarm handlers fire.
 */

import { getGlobalSettings } from './storage-manager';

// ============================================================
// Notification IDs (used for click handling)
// ============================================================

const NOTIFICATION_ID_PREFIX = 'timewarden-';

// ============================================================
// Notification Dispatch
// ============================================================

/**
 * Send a "10% remaining" notification for a domain.
 */
export async function notifyTenPercentRemaining(domain: string): Promise<void> {
  const settings = await getGlobalSettings();
  if (!settings.notificationsEnabled) return;

  try {
    await browser.notifications.create(`${NOTIFICATION_ID_PREFIX}10pct-${domain}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-128.png'),
      title: 'TimeWarden — Running Low',
      message: `${domain}: 10% of your daily limit remaining.`,
    });
  } catch (err) {
    console.error('[TimeWarden] Failed to create notification:', err);
  }
}

/**
 * Send a "5 minutes remaining" notification for a domain.
 */
export async function notifyFiveMinutesRemaining(domain: string): Promise<void> {
  const settings = await getGlobalSettings();
  if (!settings.notificationsEnabled) return;

  try {
    await browser.notifications.create(`${NOTIFICATION_ID_PREFIX}5min-${domain}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-128.png'),
      title: 'TimeWarden — 5 Minutes Left',
      message: `${domain}: only 5 minutes remaining today.`,
    });
  } catch (err) {
    console.error('[TimeWarden] Failed to create notification:', err);
  }
}

/**
 * Send a "grace period starting" notification when the limit is reached.
 */
export async function notifyGracePeriodStarting(
  domain: string,
  gracePeriodSeconds: number
): Promise<void> {
  const settings = await getGlobalSettings();
  if (!settings.notificationsEnabled) return;

  try {
    await browser.notifications.create(`${NOTIFICATION_ID_PREFIX}grace-${domain}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-128.png'),
      title: "TimeWarden — Time's Up",
      message: `${domain}: ${gracePeriodSeconds}-second grace period started. Page will be blocked soon.`,
    });
  } catch (err) {
    console.error('[TimeWarden] Failed to create notification:', err);
  }
}

// ============================================================
// Notification Click Handler
// ============================================================

/**
 * Initialize notification click handling.
 * Clicking a TimeWarden notification opens the popup (or focuses the extension action).
 */
export function initNotificationClickHandler(): void {
  browser.notifications.onClicked.addListener((notificationId: string) => {
    if (!notificationId.startsWith(NOTIFICATION_ID_PREFIX)) return;

    // Clear the notification
    browser.notifications.clear(notificationId).catch(() => {});

    // Open the popup by opening the extension action
    // Note: browser.action.openPopup() may not be available in all contexts,
    // so we just clear the notification and let the user click the icon.
    console.log('[TimeWarden] Notification clicked:', notificationId);
  });
}
