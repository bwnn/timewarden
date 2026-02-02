/**
 * TimeWarden — Background Service Worker Entry Point
 *
 * This is the main background script that orchestrates:
 * - Time tracking engine (Phase 3)
 * - Tab tracking (Phase 3)
 * - Notification scheduling (Phase 4)
 * - Blocking enforcement (Phase 4)
 * - Reset management (Phase 3)
 * - Message handling for UI communication
 *
 * For now (Phase 1), this sets up the message listener skeleton
 * and initializes storage with defaults on install.
 */

import type { Message } from '$lib/types';
import { loadStorage, getGlobalSettings, saveGlobalSettings, saveDomainConfig, removeDomainConfig } from './storage-manager';

// ============================================================
// Initialization
// ============================================================

/**
 * Initialize storage with defaults on first install.
 */
async function initialize(): Promise<void> {
  const storage = await loadStorage();
  // Storage is already initialized with defaults by loadStorage()
  console.log('[TimeWarden] Background initialized', {
    domains: storage.domains.length,
    usageDays: storage.usage.length,
  });
}

// ============================================================
// Message Handler
// ============================================================

browser.runtime.onMessage.addListener(
  (rawMessage: unknown, _sender: browser.runtime.MessageSender): Promise<unknown> | undefined => {
    const message = rawMessage as Message;
    switch (message.type) {
      case 'GET_SETTINGS':
        return getGlobalSettings();

      case 'SAVE_GLOBAL_SETTINGS':
        return saveGlobalSettings(message.settings).then(() => ({ success: true }));

      case 'SAVE_DOMAIN_CONFIG':
        return saveDomainConfig(message.config).then(() => ({ success: true }));

      case 'REMOVE_DOMAIN':
        return removeDomainConfig(message.domain).then(() => ({ success: true }));

      case 'GET_STATUS':
        // Phase 3: Return real-time status for a domain
        return Promise.resolve({
          domain: message.domain,
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
        });

      case 'GET_ALL_STATUS':
        // Phase 3: Return status for all tracked domains
        return Promise.resolve([]);

      case 'TOGGLE_PAUSE':
        // Phase 5: Toggle pause for a domain
        return Promise.resolve({ success: false, error: 'Not implemented yet' });

      case 'GET_DASHBOARD_DATA':
        // Phase 6: Return dashboard data
        return loadStorage().then((storage) => ({
          usage: storage.usage,
          domains: storage.domains,
          settings: storage.settings,
        }));

      default:
        console.warn('[TimeWarden] Unknown message type:', message);
        return undefined;
    }
  }
);

// ============================================================
// Lifecycle Events
// ============================================================

browser.runtime.onInstalled.addListener(async () => {
  console.log('[TimeWarden] Extension installed/updated');
  await initialize();
});

browser.runtime.onStartup.addListener(async () => {
  console.log('[TimeWarden] Browser started');
  await initialize();
});

// Initialize immediately (in case the service worker was restarted)
initialize();
