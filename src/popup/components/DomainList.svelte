<script lang="ts">
  import type { StatusResponse } from '$lib/types';
  import { formatTimeRemaining } from '$lib/utils';
  import { getProgressColor } from '$lib/utils';

  interface Props {
    statuses: StatusResponse[];
    currentDomain?: string | null;
  }

  let { statuses, currentDomain = null }: Props = $props();

  /** Domains excluding the current one (shown in the hero section) */
  let otherDomains = $derived(
    statuses.filter((s) => s.domain !== currentDomain)
  );

  function getStatusBadge(s: StatusResponse): { text: string; colorClass: string } {
    if (s.isBlocked) {
      return { text: 'BLOCKED', colorClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' };
    }
    if (s.isPaused) {
      return { text: 'PAUSED', colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' };
    }
    if (s.isTracking) {
      return { text: 'ACTIVE', colorClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
    }
    return { text: 'IDLE', colorClass: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
  }

  function getTimeColor(s: StatusResponse): string {
    if (s.isBlocked) return 'text-red-600 dark:text-red-400';
    const color = getProgressColor(s.timeSpentSeconds, s.limitSeconds);
    if (color === 'red') return 'text-red-600 dark:text-red-400';
    if (color === 'yellow') return 'text-amber-600 dark:text-amber-400';
    return 'text-gray-900 dark:text-gray-100';
  }
</script>

{#if otherDomains.length > 0}
  <div class="space-y-0.5" role="list" aria-label="Tracked domains">
    <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1 mb-1">
      Tracked domains
    </div>
    {#each otherDomains as s (s.domain)}
      {@const badge = getStatusBadge(s)}
      <div class="flex items-center justify-between py-1.5 px-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800" role="listitem">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm text-gray-900 dark:text-gray-100 truncate">{s.domain}</span>
          <span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded {badge.colorClass}">
            {badge.text}
          </span>
        </div>
        <span class="shrink-0 text-sm font-medium tabular-nums {getTimeColor(s)}">
          {#if s.isBlocked}
            --
          {:else}
            {formatTimeRemaining(s.timeRemainingSeconds)}
          {/if}
        </span>
      </div>
    {/each}
  </div>
{/if}
