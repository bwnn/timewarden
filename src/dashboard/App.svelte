<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getDashboardData, getSettings } from '$lib/messaging';
  import type { DailyUsage } from '$lib/types';
  import { initTheme } from '$lib/theme';
  import {
    filterByRange,
    getTodayUsage,
    buildDaySummaries,
    fillDateGaps,
    getUniqueDomains,
    aggregateByDomain,
    computeSessionAnalytics,
    computeBlockingStats,
    computeBehavioralInsights,
  } from './dashboard-utils';
  import type { DaySummary } from './dashboard-utils';

  import DateRangeSelector from './components/DateRangeSelector.svelte';
  import TodayOverview from './components/TodayOverview.svelte';
  import HistoricalChart from './components/HistoricalChart.svelte';
  import DomainBreakdown from './components/DomainBreakdown.svelte';
  import SessionAnalytics from './components/SessionAnalytics.svelte';
  import BlockingStats from './components/BlockingStats.svelte';
  import BehavioralInsights from './components/BehavioralInsights.svelte';

  // ============================================================
  // State
  // ============================================================

  let loading = $state(true);
  let error = $state<string | null>(null);
  let range = $state<'7d' | '14d' | '30d'>('7d');
  let cleanupTheme: (() => void) | null = null;

  /** Polling interval for live data refresh */
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Raw data from background
  let allUsage = $state<DailyUsage[]>([]);

  // Active section for scroll-based navigation
  let activeSection = $state('overview');

  // ============================================================
  // Derived data
  // ============================================================

  let filteredUsage = $derived(filterByRange(allUsage, range));
  let todayData = $derived.by((): DaySummary | null => {
    const today = getTodayUsage(allUsage);
    if (!today) return null;
    const summaries = buildDaySummaries([today]);
    return summaries[0] ?? null;
  });

  let daySummaries = $derived(buildDaySummaries(filteredUsage));
  let filledDays = $derived(fillDateGaps(daySummaries, range));
  let chartDomains = $derived(getUniqueDomains(filteredUsage));
  let domainAggregates = $derived(aggregateByDomain(filteredUsage));
  let sessionData = $derived(computeSessionAnalytics(filteredUsage));
  let blockingData = $derived(computeBlockingStats(filteredUsage));
  let insightsData = $derived(computeBehavioralInsights(filteredUsage));

  // Summary cards
  let totalTimeSeconds = $derived(
    filteredUsage.reduce((sum, day) => {
      return sum + day.domains.reduce((ds, d) => ds + d.timeSpentSeconds, 0);
    }, 0)
  );

  let domainsAtLimit = $derived(
    filteredUsage.reduce((count, day) => {
      return count + day.domains.filter((d) => d.blocked).length;
    }, 0)
  );

  let mostUsedDomain = $derived(
    domainAggregates.length > 0 ? domainAggregates[0] : null
  );

  // ============================================================
  // Loading
  // ============================================================

  async function loadData() {
    try {
      loading = true;
      error = null;
      const data = await getDashboardData(range);
      allUsage = data.usage;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load dashboard data';
    } finally {
      loading = false;
    }
  }

  /**
   * Silent refresh — re-fetches data without resetting the loading state.
   * Used by the polling interval so the UI doesn't flash loading indicators.
   */
  async function silentRefresh() {
    // Only refresh while the page is visible to avoid wasting resources
    if (document.visibilityState !== 'visible') return;
    try {
      const data = await getDashboardData(range);
      allUsage = data.usage;
    } catch {
      // Silently ignore — next poll will retry
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

    await loadData();

    // Poll every 5 seconds for live data updates (especially TodayOverview
    // which shows time remaining that should count down in near-real-time)
    pollInterval = setInterval(silentRefresh, 5000);
  });

  onDestroy(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (cleanupTheme) cleanupTheme();
  });

  function handleRangeChange(newRange: '7d' | '14d' | '30d') {
    range = newRange;
  }

  // ============================================================
  // Navigation
  // ============================================================

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'chart', label: 'Daily Usage' },
    { id: 'domains', label: 'Domains' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'blocking', label: 'Blocking' },
    { id: 'insights', label: 'Insights' },
  ];

  function scrollToSection(id: string) {
    activeSection = id;
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function formatTotalTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return '0m';
  }
</script>

<main class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <!-- Header -->
  <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
    <div class="max-w-5xl mx-auto px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold text-gray-900 dark:text-gray-100">TimeWarden Dashboard</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Analytics and usage insights</p>
        </div>
        <div class="flex items-center gap-3">
          <DateRangeSelector value={range} onchange={handleRangeChange} />
          <button
            type="button"
            class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            onclick={() => { browser.runtime.openOptionsPage(); }}
            aria-label="Open settings"
          >
            Settings
          </button>
        </div>
      </div>

      <!-- Section navigation -->
      <div class="flex gap-1 mt-4 -mb-px" aria-label="Dashboard sections" role="tablist">
        {#each sections as section}
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            aria-controls="section-{section.id}"
            class="px-3 py-2 text-sm font-medium rounded-t-lg transition-colors {activeSection === section.id
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}"
            onclick={() => scrollToSection(section.id)}
          >
            {section.label}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="max-w-5xl mx-auto px-6 py-6">
    {#if loading}
      <div class="flex items-center justify-center py-20" role="status" aria-label="Loading">
        <div class="text-gray-500 dark:text-gray-400">Loading dashboard data...</div>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center py-20 gap-3" role="alert">
        <div class="text-red-600 dark:text-red-400">{error}</div>
        <button
          type="button"
          class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
          onclick={loadData}
        >
          Retry
        </button>
      </div>
    {:else}
      <!-- Summary cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-sm text-gray-500 dark:text-gray-400">Total Time Tracked</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{formatTotalTime(totalTimeSeconds)}</div>
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">in {range === '7d' ? '7' : range === '14d' ? '14' : '30'} days</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-sm text-gray-500 dark:text-gray-400">Most Used Domain</div>
          <div class="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{mostUsedDomain?.domain ?? '--'}</div>
          {#if mostUsedDomain}
            <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatTotalTime(mostUsedDomain.totalSeconds)}</div>
          {/if}
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div class="text-sm text-gray-500 dark:text-gray-400">Times Blocked</div>
          <div class="text-2xl font-bold {domainsAtLimit > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} mt-1">{domainsAtLimit}</div>
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">domain-day blocks</div>
        </div>
      </div>

      <!-- Sections -->
      <div class="space-y-10">
        <div id="section-overview" role="tabpanel">
          <TodayOverview today={todayData} />
        </div>

        <div id="section-chart" role="tabpanel">
          <HistoricalChart days={filledDays} domains={chartDomains} />
        </div>

        <div id="section-domains" role="tabpanel">
          <DomainBreakdown aggregates={domainAggregates} {range} />
        </div>

        <div id="section-sessions" role="tabpanel">
          <SessionAnalytics data={sessionData} />
        </div>

        <div id="section-blocking" role="tabpanel">
          <BlockingStats data={blockingData} />
        </div>

        <div id="section-insights" role="tabpanel">
          <BehavioralInsights data={insightsData} />
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-12 pb-8 text-center text-xs text-gray-400 dark:text-gray-500">
        Data covers up to 30 days. Oldest entries are pruned automatically.
      </div>
    {/if}
  </div>
</main>
