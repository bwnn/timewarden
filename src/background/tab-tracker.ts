/**
 * Tab Tracker — manages tab lifecycle events and in-memory tracking state.
 *
 * Responsibilities:
 * - Maintains the `activeTracking` map (domain -> DomainTracking)
 * - Tracks focused window, active tab, and system idle state
 * - Registers event listeners for tabs, windows, and idle
 * - Calls provided callbacks on state changes and new domain visits
 *
 * The timer engine reads from the shared state exported here
 * to decide whether tracking should start/stop per domain.
 */

import type { DomainTracking, TabState } from '$lib/types';
import { matchDomain } from '$lib/domain-matcher';
import { getTrackedDomains } from './storage-manager';
import { IDLE_THRESHOLD_SECONDS } from '$lib/constants';

// ============================================================
// Shared State (read by timer-engine.ts)
// ============================================================

/** In-memory tracking state for all domains with open tabs */
export const activeTracking = new Map<string, DomainTracking>();

/** Maps tabId -> domain hostname for quick reverse lookup */
export const tabDomainMap = new Map<number, string>();

/** ID of the currently focused browser window */
export let focusedWindowId: number = browser.windows.WINDOW_ID_NONE;

/** ID of the active tab in the focused window (-1 if none) */
export let activeTabId: number = -1;

/** Whether the system is currently idle or locked */
export let isSystemIdle: boolean = false;

// ============================================================
// Internal State
// ============================================================

/** Cached list of tracked (enabled) domain hostnames */
let trackedDomainsList: string[] = [];

/** Callbacks provided at init time */
interface TabTrackerCallbacks {
  /** Called when any state changes that could affect tracking decisions */
  onStateChange: () => void;
  /** Called when a new navigation to a tracked domain is detected */
  onVisit: (domain: string) => void;
}

let callbacks: TabTrackerCallbacks = {
  onStateChange: () => {},
  onVisit: () => {},
};

// ============================================================
// Tracked Domains Cache
// ============================================================

/**
 * Refresh the cached list of tracked domain hostnames from storage.
 * Should be called on init and whenever domain configs change.
 */
export async function refreshTrackedDomains(): Promise<void> {
  trackedDomainsList = await getTrackedDomains();
}

/**
 * Get the current cached tracked domains list.
 * Used by other modules that need the list without a storage hit.
 */
export function getCachedTrackedDomains(): string[] {
  return trackedDomainsList;
}

// ============================================================
// Tracking Entry Management
// ============================================================

/**
 * Ensure a DomainTracking entry exists in the activeTracking map.
 * Creates one with defaults if it doesn't exist.
 */
function ensureTrackingEntry(domain: string): DomainTracking {
  let tracking = activeTracking.get(domain);
  if (!tracking) {
    tracking = {
      startedAt: null,
      tabs: new Map<number, TabState>(),
      reason: null,
    };
    activeTracking.set(domain, tracking);
  }
  return tracking;
}

/**
 * Register a tab as belonging to a tracked domain.
 */
function registerTab(tabId: number, domain: string, audible: boolean): void {
  const tracking = ensureTrackingEntry(domain);
  tracking.tabs.set(tabId, { audible });
  tabDomainMap.set(tabId, domain);
}

/**
 * Unregister a tab from its tracked domain.
 * Does NOT remove the domain entry from activeTracking even if no tabs remain —
 * the timer engine needs to see it to properly stop tracking before cleanup.
 */
function unregisterTab(tabId: number): void {
  const domain = tabDomainMap.get(tabId);
  if (!domain) return;

  const tracking = activeTracking.get(domain);
  if (tracking) {
    tracking.tabs.delete(tabId);
  }

  tabDomainMap.delete(tabId);
}

/**
 * Remove stale entries from activeTracking that have no tabs and aren't tracking.
 * Called after reevaluation to keep the map clean.
 */
export function cleanupStaleEntries(): void {
  for (const [domain, tracking] of activeTracking) {
    if (tracking.tabs.size === 0 && !tracking.startedAt) {
      activeTracking.delete(domain);
    }
  }
}

// ============================================================
// Event Handlers
// ============================================================

/**
 * Tab activated (user switched to a different tab).
 */
function handleTabActivated(activeInfo: { tabId: number; windowId: number }): void {
  activeTabId = activeInfo.tabId;
  callbacks.onStateChange();
}

/**
 * Tab updated (URL change, audible change, loading state, etc.).
 * We care about URL changes (domain navigation) and audible changes.
 */
async function handleTabUpdated(
  tabId: number,
  changeInfo: Record<string, unknown>,
  tab: browser.tabs.Tab
): Promise<void> {
  let stateChanged = false;

  // Handle URL change — potential domain switch
  if (typeof changeInfo.url === 'string') {
    const oldDomain = tabDomainMap.get(tabId) ?? null;
    const newDomain = matchDomain(changeInfo.url, trackedDomainsList);

    if (oldDomain !== newDomain) {
      // Domain changed — unregister old, register new
      if (oldDomain) {
        unregisterTab(tabId);
      }

      if (newDomain) {
        registerTab(tabId, newDomain, tab.audible ?? false);
        callbacks.onVisit(newDomain);
      }

      stateChanged = true;
    }
  }

  // Handle audible state change
  if (typeof changeInfo.audible === 'boolean') {
    const domain = tabDomainMap.get(tabId);
    if (domain) {
      const tracking = activeTracking.get(domain);
      const tabState = tracking?.tabs.get(tabId);
      if (tabState) {
        tabState.audible = changeInfo.audible;
        stateChanged = true;
      }
    }
  }

  if (stateChanged) {
    callbacks.onStateChange();
  }
}

/**
 * Tab removed (closed).
 */
function handleTabRemoved(tabId: number, _removeInfo: { windowId: number; isWindowClosing: boolean }): void {
  const hadTab = tabDomainMap.has(tabId);
  if (hadTab) {
    unregisterTab(tabId);
    callbacks.onStateChange();
  }
}

/**
 * Window focus changed.
 * windowId is WINDOW_ID_NONE when all windows lose focus (e.g., user switches to another app).
 */
async function handleWindowFocusChanged(windowId: number): Promise<void> {
  focusedWindowId = windowId;

  if (windowId !== browser.windows.WINDOW_ID_NONE) {
    // Find the active tab in the newly focused window
    const activeTabs = await browser.tabs.query({ active: true, windowId });
    activeTabId = activeTabs[0]?.id ?? -1;
  } else {
    activeTabId = -1;
  }

  callbacks.onStateChange();
}

/**
 * Idle state changed (active / idle / locked).
 */
function handleIdleStateChanged(newState: browser.idle.IdleState): void {
  isSystemIdle = newState !== 'active';
  callbacks.onStateChange();
}

// ============================================================
// Initialization
// ============================================================

/**
 * Initialize the tab tracker: register all event listeners and set idle detection interval.
 *
 * @param cbs Callbacks for state changes and new domain visits
 */
export function initTabTracker(cbs: TabTrackerCallbacks): void {
  callbacks = cbs;

  // Set idle detection interval to match our threshold
  browser.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  // Register event listeners
  browser.tabs.onActivated.addListener(handleTabActivated);
  browser.tabs.onUpdated.addListener(handleTabUpdated);
  browser.tabs.onRemoved.addListener(handleTabRemoved);
  browser.windows.onFocusChanged.addListener(handleWindowFocusChanged);
  browser.idle.onStateChanged.addListener(handleIdleStateChanged);
}

/**
 * Recover tab state from all currently open tabs.
 * Called on service worker startup/restart to rebuild the in-memory state.
 *
 * Must be called after refreshTrackedDomains().
 *
 * @param countVisits If true, fires onVisit for each unique domain found.
 *   Should be true on startup recovery, false when re-scanning after config changes.
 */
export async function recoverTabState(countVisits = false): Promise<void> {
  // Clear existing state
  activeTracking.clear();
  tabDomainMap.clear();

  // Scan all open tabs
  const allTabs = await browser.tabs.query({});
  /** Track which domains we've already counted a visit for during this recovery */
  const visitedDomains = new Set<string>();
  for (const tab of allTabs) {
    if (!tab.id || !tab.url) continue;
    const domain = matchDomain(tab.url, trackedDomainsList);
    if (domain) {
      registerTab(tab.id, domain, tab.audible ?? false);
      // On startup recovery, count one visit per domain (not per tab) to avoid
      // inflating visit counts when the user has multiple tabs open.
      // Skip visit counting on config-change re-scans.
      if (countVisits && !visitedDomains.has(domain)) {
        visitedDomains.add(domain);
        callbacks.onVisit(domain);
      }
    }
  }

  // Determine focused window
  const windows = await browser.windows.getAll({ windowTypes: ['normal'] });
  const focused = windows.find((w) => w.focused);
  focusedWindowId = focused?.id ?? browser.windows.WINDOW_ID_NONE;

  // Determine active tab in focused window
  if (focusedWindowId !== browser.windows.WINDOW_ID_NONE) {
    const activeTabs = await browser.tabs.query({ active: true, windowId: focusedWindowId });
    activeTabId = activeTabs[0]?.id ?? -1;
  } else {
    activeTabId = -1;
  }

  // Check current idle state
  isSystemIdle = (await browser.idle.queryState(IDLE_THRESHOLD_SECONDS)) !== 'active';
}
