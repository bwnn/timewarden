<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getBlockedStatus, getSettings } from '$lib/messaging';
  import type { BlockedStatusResponse } from '$lib/types';
  import { initTheme } from '$lib/theme';

  // ============================================================
  // State
  // ============================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let stats = $state<BlockedStatusResponse | null>(null);
  let domain = $state('');
  let cleanupTheme: (() => void) | null = null;

  // ============================================================
  // Helpers
  // ============================================================

  function formatTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }

  function formatResetTime(resetTime: string): string {
    const [hours, minutes] = resetTime.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // ============================================================
  // Data Loading
  // ============================================================

  async function loadData(): Promise<void> {
    // Extract domain from URL query params
    const params = new URLSearchParams(window.location.search);
    const domainParam = params.get('domain');

    if (!domainParam) {
      error = 'No domain specified.';
      loading = false;
      return;
    }

    domain = domainParam;

    try {
      stats = await getBlockedStatus(domain);
      loading = false;
    } catch (err) {
      console.error('[TimeWarden] Failed to load blocked status:', err);
      error = 'Failed to load stats.';
      loading = false;
    }
  }

  onMount(async () => {
    // Initialize theme
    try {
      const settings = await getSettings();
      cleanupTheme = initTheme(settings.theme);
    } catch {
      cleanupTheme = initTheme('system');
    }

    loadData();
  });

  onDestroy(() => {
    if (cleanupTheme) cleanupTheme();
  });

  // ============================================================
  // Actions
  // ============================================================

  function closeTab(): void {
    window.close();
  }

  function openDashboard(): void {
    window.open(browser.runtime.getURL('dashboard.html'), '_blank');
  }
</script>

<main class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
  {#if loading}
    <div class="text-center" role="status" aria-label="Loading">
      <div class="text-gray-400 dark:text-gray-500 text-lg">Loading...</div>
    </div>
  {:else if error}
    <div class="text-center" role="alert">
      <h1 class="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">Something went wrong</h1>
      <p class="text-gray-500 dark:text-gray-400">{error}</p>
    </div>
  {:else if stats}
    <div class="max-w-md w-full">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full mb-4">
          <svg class="w-8 h-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Time's Up</h1>
        <p class="text-gray-500 dark:text-gray-400 text-lg">
          <span class="font-medium text-gray-700 dark:text-gray-300">{domain}</span> is done for today
        </p>
      </div>

      <!-- Stats Card -->
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Today's Stats
        </h2>

        <dl class="space-y-4">
          <!-- Time Used -->
          <div class="flex items-center justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Time Used</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{formatTime(stats.timeSpentSeconds)}</dd>
          </div>

          <!-- Limit -->
          <div class="flex items-center justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Daily Limit</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{formatTime(stats.limitMinutes * 60)}</dd>
          </div>

          <hr class="border-gray-100 dark:border-gray-700" />

          <!-- Sessions -->
          <div class="flex items-center justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Sessions</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{stats.sessionCount}</dd>
          </div>

          <!-- Longest Session -->
          <div class="flex items-center justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Longest Session</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{formatTime(stats.longestSessionSeconds)}</dd>
          </div>

          <!-- Times Opened -->
          <div class="flex items-center justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Times Opened</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{stats.visitCount}</dd>
          </div>

          <hr class="border-gray-100 dark:border-gray-700" />

          <!-- Resets At -->
          <div class="flex items-center justify-between">
            <dt class="text-gray-600 dark:text-gray-400">Resets At</dt>
            <dd class="font-semibold text-gray-900 dark:text-gray-100">{formatResetTime(stats.resetTime)}</dd>
          </div>
        </dl>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          onclick={closeTab}
          class="flex-1 px-4 py-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors cursor-pointer"
        >
          Close Tab
        </button>
        <button
          onclick={openDashboard}
          class="flex-1 px-4 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          Dashboard
        </button>
      </div>

      <!-- Subtle footer -->
      <p class="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
        TimeWarden
      </p>
    </div>
  {/if}
</main>
