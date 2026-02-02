<script lang="ts">
  import type { SessionAnalyticsData } from '../dashboard-utils';
  import { formatTimeRemaining } from '$lib/utils';

  interface Props {
    data: SessionAnalyticsData;
  }

  let { data }: Props = $props();

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let maxHourSessions = $derived(Math.max(1, ...data.sessionsByHour));
  let maxDaySessions = $derived(Math.max(1, ...data.sessionsByDay));

  function formatHour(hour: number): string {
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    if (hour < 12) return `${hour}a`;
    return `${hour - 12}p`;
  }
</script>

<section aria-label="Session analytics">
  <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Session Analytics</h2>

  {#if data.totalSessions === 0}
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-gray-500 dark:text-gray-400">
      No sessions recorded in this period.
    </div>
  {:else}
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Summary stats -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Summary</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{data.totalSessions}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Total sessions</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatTimeRemaining(data.longestSessionSeconds)}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Longest session</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatTimeRemaining(data.averageSessionSeconds)}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Avg session length</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {#if data.avgTimeBetweenSessions > 0}
                {formatTimeRemaining(data.avgTimeBetweenSessions)}
              {:else}
                --
              {/if}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Avg time between</div>
          </div>
        </div>
      </div>

      <!-- Sessions by day of week -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Sessions by Day</h3>
        <div class="flex items-end gap-1.5 h-24">
          {#each data.sessionsByDay as count, i}
            <div class="flex-1 flex flex-col items-center gap-1">
              <div class="w-full flex flex-col items-center justify-end h-16">
                {#if count > 0}
                  <span class="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{count}</span>
                {/if}
                <div
                  class="w-full rounded-t bg-blue-400 transition-all"
                  style="height: {count > 0 ? Math.max(4, (count / maxDaySessions) * 100) : 0}%"
                ></div>
              </div>
              <span class="text-xs text-gray-400 dark:text-gray-500">{dayNames[i]}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Sessions by hour (heatmap-style) -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:col-span-2">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Sessions by Hour of Day</h3>
        <div class="flex items-end gap-0.5 h-20">
          {#each data.sessionsByHour as count, hour}
            <div class="flex-1 flex flex-col items-center gap-0.5">
              <div
                class="w-full rounded-t transition-all"
                style="height: {count > 0 ? Math.max(4, (count / maxHourSessions) * 100) : 0}%; background-color: {count > 0 ? `rgba(59, 130, 246, ${0.3 + 0.7 * (count / maxHourSessions)})` : 'var(--bar-empty, #f3f4f6)'}"
              ></div>
              {#if hour % 3 === 0}
                <span class="text-xs text-gray-400 dark:text-gray-500" style="font-size: 9px">{formatHour(hour)}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>
