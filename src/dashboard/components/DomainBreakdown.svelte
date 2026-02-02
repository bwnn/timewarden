<script lang="ts">
  import type { DomainAggregate } from '../dashboard-utils';
  import { formatTimeRemaining } from '$lib/utils';
  import { getDomainColor } from '../dashboard-utils';

  interface Props {
    aggregates: DomainAggregate[];
    range: '7d' | '14d' | '30d';
  }

  let { aggregates, range }: Props = $props();

  let rangeLabel = $derived(range === '7d' ? '7 days' : range === '14d' ? '14 days' : '30 days');
</script>

<section aria-label="Domain breakdown">
  <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Domain Breakdown</h2>

  {#if aggregates.length === 0}
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
      No domain usage data for this period.
    </div>
  {:else}
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <th class="text-left px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Domain</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Total ({rangeLabel})</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Daily Avg</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Sessions</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Visits</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500 dark:text-gray-400">Days Blocked</th>
          </tr>
        </thead>
        <tbody>
          {#each aggregates as agg, i (agg.domain)}
            <tr class="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style="background: {getDomainColor(agg.domain, i)}"
                  ></span>
                  <span class="font-medium text-gray-900 dark:text-gray-100">{agg.domain}</span>
                </div>
              </td>
              <td class="text-right px-4 py-3 text-gray-700 dark:text-gray-300 font-medium">
                {formatTimeRemaining(agg.totalSeconds)}
              </td>
              <td class="text-right px-4 py-3 text-gray-600 dark:text-gray-400">
                {formatTimeRemaining(agg.dailyAverageSeconds)}
              </td>
              <td class="text-right px-4 py-3 text-gray-600 dark:text-gray-400">
                {agg.totalSessions}
              </td>
              <td class="text-right px-4 py-3 text-gray-600 dark:text-gray-400">
                {agg.totalVisits}
              </td>
              <td class="text-right px-4 py-3">
                {#if agg.daysBlocked > 0}
                  <span class="text-red-600 dark:text-red-400 font-medium">{agg.daysBlocked}</span>
                {:else}
                  <span class="text-gray-400 dark:text-gray-500">0</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
