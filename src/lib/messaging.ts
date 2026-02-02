/**
 * Typed messaging helpers for communication between
 * background script and UI pages (popup, settings, dashboard, blocked).
 *
 * Uses browser.runtime.sendMessage / onMessage.
 */

import type { Message, StatusResponse, BlockedStatusResponse, DomainConfig, GlobalSettings, DailyUsage } from './types';

// ============================================================
// Response Types
// ============================================================

export type MessageResponse =
  | StatusResponse
  | StatusResponse[]
  | GlobalSettings
  | DashboardData
  | { success: boolean; error?: string };

export interface DashboardData {
  usage: DailyUsage[];
  domains: DomainConfig[];
  settings: GlobalSettings;
}

// ============================================================
// Send (from UI to background)
// ============================================================

/**
 * Send a typed message to the background script and await a response.
 */
export async function sendMessage<T = MessageResponse>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}

// ============================================================
// Convenience senders
// ============================================================

export async function getStatus(domain: string): Promise<StatusResponse> {
  return sendMessage<StatusResponse>({ type: 'GET_STATUS', domain });
}

export async function getAllStatus(): Promise<StatusResponse[]> {
  return sendMessage<StatusResponse[]>({ type: 'GET_ALL_STATUS' });
}

export async function togglePause(domain: string): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>({ type: 'TOGGLE_PAUSE', domain });
}

export async function getDashboardData(range: '7d' | '14d' | '30d'): Promise<DashboardData> {
  return sendMessage<DashboardData>({ type: 'GET_DASHBOARD_DATA', range });
}

export async function getSettings(): Promise<GlobalSettings> {
  return sendMessage<GlobalSettings>({ type: 'GET_SETTINGS' });
}

export async function getDomainConfigs(): Promise<DomainConfig[]> {
  return sendMessage<DomainConfig[]>({ type: 'GET_DOMAIN_CONFIGS' });
}

export async function saveDomainConfig(config: DomainConfig): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>({ type: 'SAVE_DOMAIN_CONFIG', config });
}

export async function removeDomain(domain: string): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>({ type: 'REMOVE_DOMAIN', domain });
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<{ success: boolean }> {
  return sendMessage<{ success: boolean }>({ type: 'SAVE_GLOBAL_SETTINGS', settings });
}

export async function getBlockedStatus(domain: string): Promise<BlockedStatusResponse> {
  return sendMessage<BlockedStatusResponse>({ type: 'GET_BLOCKED_STATUS', domain });
}
