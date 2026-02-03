/**
 * Notification Manager — dispatches browser notifications for time limit warnings.
 *
 * Responsibilities:
 * - Dispatch configurable notification rule alerts
 * - Dispatch "grace period starting" notification when limit is reached
 * - Track notification clicks to open the popup
 * - Respect the user's notificationsEnabled setting
 *
 * Called by timer-engine.ts when alarm handlers fire.
 */

import type { NotificationRule } from '$lib/types';
import { getGlobalSettings } from "./storage-manager";
import { formatTimeRemaining } from '$lib/utils';

// ============================================================
// Notification IDs (used for click handling)
// ============================================================

const NOTIFICATION_ID_PREFIX = "timewarden-";

// ============================================================
// Notification Dispatch
// ============================================================

/**
 * Send a notification for a configurable notification rule.
 * Generates default title/message if the rule doesn't specify custom ones.
 */
export async function notifyCustomRule(
	domain: string,
	rule?: NotificationRule
): Promise<void> {
	const settings = await getGlobalSettings();
	if (!settings.notificationsEnabled) return;

	const title = rule?.title || 'TimeWarden — Running Low';
	let message: string;

	if (rule) {
		if (rule.message) {
			message = rule.message.replace('{domain}', domain);
		} else if (rule.type === 'percentage' && rule.percentageUsed != null) {
			const remaining = 100 - rule.percentageUsed;
			message = `${domain}: ${remaining}% of your daily limit remaining.`;
		} else if (rule.type === 'time' && rule.timeRemainingSeconds != null) {
			const formatted = formatTimeRemaining(rule.timeRemainingSeconds);
			message = `${domain}: ${formatted} remaining.`;
		} else {
			message = `${domain}: approaching your daily limit.`;
		}
	} else {
		message = `${domain}: approaching your daily limit.`;
	}

	try {
		await browser.notifications.create(
			`${NOTIFICATION_ID_PREFIX}rule-${rule?.id ?? 'unknown'}-${domain}`,
			{ type: "basic", title, message }
		);
	} catch (err) {
		console.error("[TimeWarden] Failed to create notification:", err);
	}
}

/**
 * Send a "grace period starting" notification when the limit is reached.
 */
export async function notifyGracePeriodStarting(
	domain: string,
	gracePeriodSeconds: number,
): Promise<void> {
	const settings = await getGlobalSettings();
	if (!settings.notificationsEnabled) return;

	try {
		await browser.notifications.create(`${NOTIFICATION_ID_PREFIX}grace-${domain}`, {
			type: "basic",
			title: "TimeWarden — Time's Up",
			message: `${domain}: ${gracePeriodSeconds}-second grace period started. Page will be blocked soon.`,
		});
	} catch (err) {
		console.error("[TimeWarden] Failed to create notification:", err);
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
		console.log("[TimeWarden] Notification clicked:", notificationId);
	});
}
