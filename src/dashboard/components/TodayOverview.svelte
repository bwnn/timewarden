<script lang="ts">
  import type { DaySummary } from '../dashboard-utils';
  import { formatTimeRemaining, formatLimitMinutes, getUsagePercent, getProgressColor } from '$lib/utils';

  interface Props {
    today: DaySummary | null;
  }

  let { today }: Props = $props();

  function getBarColor(color: 'green' | 'yellow' | 'red'): string {
    switch (color) {
      case 'green': return 'bg-emerald-500';
      case 'yellow': return 'bg-amber-500';
      case 'red': return 'bg-red-500';
    }
  }

  function getBarBgColor(color: 'green' | 'yellow' | 'red'): string {
    switch (color) {
      case 'green': return 'bg-emerald-100';
      case 'yellow': return 'bg-amber-100';
      case 'red': return 'bg-red-100';
    }
  }
</script>

<section>
  <h2 class="text-lg font-semibold text-gray-900 mb-4">Today's Overview</h2>

  {#if !today || today.domains.length === 0}
    <div class="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
      No tracked activity today.
    </div>
  {:else}
    <div class="grid gap-3">
      {#each today.domains as domain (domain.domain)}
        {@const percent = getUsagePercent(domain.timeSpentSeconds, domain.limitMinutes)}
        {@const color = getProgressColor(domain.timeSpentSeconds, domain.limitMinutes)}
        {@const remaining = Math.max(0, domain.limitMinutes * 60 - domain.timeSpentSeconds)}

        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900">{domain.domain}</span>
              {#if domain.blocked}
                <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">BLOCKED</span>
              {/if}
            </div>
            <span class="text-sm text-gray-500">
              {formatTimeRemaining(domain.timeSpentSeconds)} / {formatLimitMinutes(domain.limitMinutes)}
            </span>
          </div>

          <!-- Progress bar -->
          <div class="w-full h-2 rounded-full {getBarBgColor(color)} mb-2">
            <div
              class="h-full rounded-full transition-all duration-300 {getBarColor(color)}"
              style="width: {Math.min(100, percent)}%"
            ></div>
          </div>

          <div class="flex items-center justify-between text-xs text-gray-500">
            <span>
              {domain.visitCount} visit{domain.visitCount !== 1 ? 's' : ''}
              &middot;
              {domain.sessionCount} session{domain.sessionCount !== 1 ? 's' : ''}
            </span>
            <span>
              {#if domain.blocked}
                No time remaining
              {:else}
                {formatTimeRemaining(remaining)} left
              {/if}
            </span>
          </div>
        </div>
      {/each}
    </div>

    <!-- Total time today -->
    <div class="mt-3 text-sm text-gray-600 text-right">
      Total today: <span class="font-medium text-gray-900">{formatTimeRemaining(today.totalSeconds)}</span>
    </div>
  {/if}
</section>
