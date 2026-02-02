<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { StatusResponse } from '$lib/types';
  import { getAllStatus, togglePause } from '$lib/messaging';
  import { extractHostname } from '$lib/domain-matcher';
  import DomainStatus from './components/DomainStatus.svelte';
  import DomainList from './components/DomainList.svelte';

  let allStatuses: StatusResponse[] = $state([]);
  let currentDomain: string | null = $state(null);
  let currentStatus: StatusResponse | null = $state(null);
  let loading = $state(true);
  let error: string | null = $state(null);

  /** Polling interval handle */
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Detect the active tab's hostname via browser.tabs.query.
   * The popup always opens on the currently active tab.
   */
  async function detectCurrentTab(): Promise<string | null> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.url) {
        return extractHostname(tab.url);
      }
    } catch {
      // Ignore — may not have permission or tab may be special
    }
    return null;
  }

  /**
   * Fetch all domain statuses and match against current tab.
   */
  async function refresh(): Promise<void> {
    try {
      const statuses = await getAllStatus();
      allStatuses = statuses;

      // Find status for the current domain
      if (currentDomain) {
        currentStatus = statuses.find((s) => s.domain === currentDomain) ?? null;
      } else {
        currentStatus = null;
      }

      error = null;
    } catch (err) {
      console.error('[TimeWarden Popup] Failed to fetch status:', err);
      error = 'Failed to load data';
    }
  }

  async function handlePause(): Promise<void> {
    if (!currentDomain) return;
    try {
      await togglePause(currentDomain);
      // Refresh immediately to show updated state
      await refresh();
    } catch (err) {
      console.error('[TimeWarden Popup] Pause toggle failed:', err);
    }
  }

  function openSettings(): void {
    browser.tabs.create({ url: browser.runtime.getURL('settings.html') });
    window.close();
  }

  function openDashboard(): void {
    browser.tabs.create({ url: browser.runtime.getURL('dashboard.html') });
    window.close();
  }

  onMount(async () => {
    try {
      // Detect current tab hostname
      const hostname = await detectCurrentTab();

      // Fetch statuses to know which domains are tracked
      const statuses = await getAllStatus();
      allStatuses = statuses;

      // Match current tab against tracked domains
      if (hostname) {
        // Check exact match first, then check if hostname is a subdomain
        const match = statuses.find((s) => {
          return hostname === s.domain || hostname.endsWith('.' + s.domain);
        });
        if (match) {
          currentDomain = match.domain;
          currentStatus = match;
        }
      }

      error = null;
    } catch (err) {
      console.error('[TimeWarden Popup] Init error:', err);
      error = 'Failed to load data';
    } finally {
      loading = false;
    }

    // Start polling every second for real-time updates
    pollInterval = setInterval(() => {
      refresh();
    }, 1000);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });
</script>

<main class="w-[350px] min-h-[200px] max-h-[500px] overflow-y-auto">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
    <span class="text-sm font-semibold text-gray-900">TimeWarden</span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Settings"
        onclick={openSettings}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      <button
        type="button"
        class="p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Dashboard"
        onclick={openDashboard}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      </button>
    </div>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <span class="text-sm text-gray-500">Loading...</span>
    </div>
  {:else if error}
    <div class="flex flex-col items-center justify-center py-12 gap-2">
      <span class="text-sm text-red-600">{error}</span>
      <button
        type="button"
        class="text-xs text-blue-600 hover:text-blue-800"
        onclick={() => { loading = true; refresh().then(() => { loading = false; }); }}
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Current domain section -->
    {#if currentStatus}
      <div class="px-4 py-3 border-b border-gray-200">
        {#if currentStatus.isBlocked}
          <div class="text-center py-2">
            <div class="text-sm font-medium text-gray-900">{currentStatus.domain}</div>
            <div class="text-lg font-bold text-red-600 mt-1">BLOCKED</div>
            <div class="text-xs text-gray-500 mt-1">Time limit reached for today</div>
          </div>
        {:else}
          <DomainStatus status={currentStatus} onpause={handlePause} />
        {/if}
      </div>
    {:else}
      <div class="px-4 py-4 border-b border-gray-200 text-center">
        <span class="text-sm text-gray-500">
          {#if currentDomain}
            {currentDomain} is not being tracked
          {:else}
            No tracked domain on this tab
          {/if}
        </span>
      </div>
    {/if}

    <!-- All tracked domains list -->
    {#if allStatuses.length > 0}
      <div class="px-3 py-2">
        <DomainList statuses={allStatuses} currentDomain={currentDomain} />
      </div>
    {:else}
      <div class="px-4 py-4 text-center">
        <span class="text-xs text-gray-400">No domains configured yet.</span>
        <button
          type="button"
          class="block mx-auto mt-2 text-xs text-blue-600 hover:text-blue-800"
          onclick={openSettings}
        >
          Open Settings
        </button>
      </div>
    {/if}
  {/if}
</main>
