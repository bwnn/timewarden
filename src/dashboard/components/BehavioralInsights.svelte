<script lang="ts">
  import type { BehavioralInsightsData } from '../dashboard-utils';
  import { formatTimeRemaining } from '$lib/utils';

  interface Props {
    data: BehavioralInsightsData;
  }

  let { data }: Props = $props();

  let maxHourUsage = $derived(Math.max(1, ...data.usageByHour));

  // Find peak usage hours (top 3)
  let peakHours = $derived.by(() => {
    const indexed = data.usageByHour.map((v, i) => ({ hour: i, seconds: v }));
    indexed.sort((a, b) => b.seconds - a.seconds);
    return indexed.slice(0, 3).filter((h) => h.seconds > 0);
  });

  function formatHour(hour: number): string {
    if (hour === 0) return '12:00 AM';
    if (hour === 12) return '12:00 PM';
    if (hour < 12) return `${hour}:00 AM`;
    return `${hour - 12}:00 PM`;
  }

  function formatHourShort(hour: number): string {
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    if (hour < 12) return `${hour}a`;
    return `${hour - 12}p`;
  }

  let maxAvg = $derived(Math.max(data.weekdayAvgSeconds, data.weekendAvgSeconds) || 1);

  // Weekday vs weekend comparison
  let weekdayVsWeekend = $derived.by(() => {
    if (data.weekdayAvgSeconds === 0 && data.weekendAvgSeconds === 0) return 'equal';
    if (data.weekendAvgSeconds > data.weekdayAvgSeconds * 1.1) return 'weekend-heavy';
    if (data.weekdayAvgSeconds > data.weekendAvgSeconds * 1.1) return 'weekday-heavy';
    return 'equal';
  });
</script>

<section aria-label="Behavioral insights">
  <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Behavioral Insights</h2>

  <div class="grid gap-4 md:grid-cols-2">
    <!-- Key insights -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Key Insights</h3>
      <div class="space-y-3">
        {#if data.mostUsedDomain}
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Most Used</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {data.mostUsedDomain} ({formatTimeRemaining(data.mostUsedDomainSeconds)} total)
              </div>
            </div>
          </div>
        {/if}

        {#if data.mostCompulsiveDomain}
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Most Compulsive</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {data.mostCompulsiveDomain} ({data.mostCompulsiveVisitsPerDay} visits/day)
              </div>
            </div>
          </div>
        {/if}

        {#if peakHours.length > 0}
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-violet-500 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Peak Hours</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {peakHours.map((h) => formatHour(h.hour)).join(', ')}
              </div>
            </div>
          </div>
        {/if}

        {#if data.totalTimeSavedSeconds > 0}
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Time Saved</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                {formatTimeRemaining(data.totalTimeSavedSeconds)} under your limits
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Weekday vs Weekend -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Weekday vs Weekend</h3>
      <div class="space-y-4">
        <div>
          <div class="flex items-center justify-between text-sm mb-1">
            <span class="text-gray-600 dark:text-gray-400">Weekdays (avg/day)</span>
            <span class="font-medium text-gray-900 dark:text-gray-100">{formatTimeRemaining(data.weekdayAvgSeconds)}</span>
          </div>
          <div class="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div
              class="h-full rounded-full bg-blue-400 transition-all"
              style="width: {(data.weekdayAvgSeconds / maxAvg) * 100}%"
            ></div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between text-sm mb-1">
            <span class="text-gray-600 dark:text-gray-400">Weekends (avg/day)</span>
            <span class="font-medium text-gray-900 dark:text-gray-100">{formatTimeRemaining(data.weekendAvgSeconds)}</span>
          </div>
          <div class="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full">
            <div
              class="h-full rounded-full bg-violet-400 transition-all"
              style="width: {(data.weekendAvgSeconds / maxAvg) * 100}%"
            ></div>
          </div>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 pt-1">
          {#if weekdayVsWeekend === 'weekend-heavy'}
            You use more tracked time on weekends.
          {:else if weekdayVsWeekend === 'weekday-heavy'}
            You use more tracked time on weekdays.
          {:else}
            Your usage is similar on weekdays and weekends.
          {/if}
        </div>
      </div>
    </div>

    <!-- Usage by hour heatmap -->
    <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 md:col-span-2">
      <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Usage by Hour of Day</h3>
      <div class="flex items-end gap-0.5 h-20">
        {#each data.usageByHour as seconds, hour}
          <div class="flex-1 flex flex-col items-center gap-0.5">
            <div
              class="w-full rounded-t transition-all"
              style="height: {seconds > 0 ? Math.max(4, (seconds / maxHourUsage) * 100) : 0}%; background-color: {seconds > 0 ? `rgba(139, 92, 246, ${0.3 + 0.7 * (seconds / maxHourUsage)})` : 'var(--bar-empty, #f3f4f6)'}"
            ></div>
            {#if hour % 3 === 0}
              <span class="text-xs text-gray-400 dark:text-gray-500" style="font-size: 9px">{formatHourShort(hour)}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>
