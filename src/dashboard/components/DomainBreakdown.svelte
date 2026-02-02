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

<section>
  <h2 class="text-lg font-semibold text-gray-900 mb-4">Domain Breakdown</h2>

  {#if aggregates.length === 0}
    <div class="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
      No domain usage data for this period.
    </div>
  {:else}
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-200 bg-gray-50">
            <th class="text-left px-4 py-2.5 font-medium text-gray-500">Domain</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500">Total ({rangeLabel})</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500">Daily Avg</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500">Sessions</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500">Visits</th>
            <th class="text-right px-4 py-2.5 font-medium text-gray-500">Days Blocked</th>
          </tr>
        </thead>
        <tbody>
          {#each aggregates as agg, i (agg.domain)}
            <tr class="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style="background: {getDomainColor(agg.domain, i)}"
                  ></span>
                  <span class="font-medium text-gray-900">{agg.domain}</span>
                </div>
              </td>
              <td class="text-right px-4 py-3 text-gray-700 font-medium">
                {formatTimeRemaining(agg.totalSeconds)}
              </td>
              <td class="text-right px-4 py-3 text-gray-600">
                {formatTimeRemaining(agg.dailyAverageSeconds)}
              </td>
              <td class="text-right px-4 py-3 text-gray-600">
                {agg.totalSessions}
              </td>
              <td class="text-right px-4 py-3 text-gray-600">
                {agg.totalVisits}
              </td>
              <td class="text-right px-4 py-3">
                {#if agg.daysBlocked > 0}
                  <span class="text-red-600 font-medium">{agg.daysBlocked}</span>
                {:else}
                  <span class="text-gray-400">0</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
