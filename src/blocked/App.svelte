<script lang="ts">
  import { onMount } from 'svelte';
  import { getBlockedStatus } from '$lib/messaging';
  import type { BlockedStatusResponse } from '$lib/types';

  // ============================================================
  // State
  // ============================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let stats = $state<BlockedStatusResponse | null>(null);
  let domain = $state('');

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

  onMount(() => {
    loadData();
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

<main class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
  {#if loading}
    <div class="text-center">
      <div class="text-gray-400 text-lg">Loading...</div>
    </div>
  {:else if error}
    <div class="text-center">
      <h1 class="text-2xl font-bold text-gray-700 mb-2">Something went wrong</h1>
      <p class="text-gray-500">{error}</p>
    </div>
  {:else if stats}
    <div class="max-w-md w-full">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Time's Up</h1>
        <p class="text-gray-500 text-lg">
          <span class="font-medium text-gray-700">{domain}</span> is done for today
        </p>
      </div>

      <!-- Stats Card -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Today's Stats
        </h2>

        <div class="space-y-4">
          <!-- Time Used -->
          <div class="flex items-center justify-between">
            <span class="text-gray-600">Time Used</span>
            <span class="font-semibold text-gray-900">{formatTime(stats.timeSpentSeconds)}</span>
          </div>

          <!-- Limit -->
          <div class="flex items-center justify-between">
            <span class="text-gray-600">Daily Limit</span>
            <span class="font-semibold text-gray-900">{formatTime(stats.limitMinutes * 60)}</span>
          </div>

          <hr class="border-gray-100" />

          <!-- Sessions -->
          <div class="flex items-center justify-between">
            <span class="text-gray-600">Sessions</span>
            <span class="font-semibold text-gray-900">{stats.sessionCount}</span>
          </div>

          <!-- Longest Session -->
          <div class="flex items-center justify-between">
            <span class="text-gray-600">Longest Session</span>
            <span class="font-semibold text-gray-900">{formatTime(stats.longestSessionSeconds)}</span>
          </div>

          <!-- Times Opened -->
          <div class="flex items-center justify-between">
            <span class="text-gray-600">Times Opened</span>
            <span class="font-semibold text-gray-900">{stats.visitCount}</span>
          </div>

          <hr class="border-gray-100" />

          <!-- Resets At -->
          <div class="flex items-center justify-between">
            <span class="text-gray-600">Resets At</span>
            <span class="font-semibold text-gray-900">{formatResetTime(stats.resetTime)}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          onclick={closeTab}
          class="flex-1 px-4 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Close Tab
        </button>
        <button
          onclick={openDashboard}
          class="flex-1 px-4 py-3 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Dashboard
        </button>
      </div>

      <!-- Subtle footer -->
      <p class="text-center text-xs text-gray-400 mt-6">
        TimeWarden
      </p>
    </div>
  {/if}
</main>
