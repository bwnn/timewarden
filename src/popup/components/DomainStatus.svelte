<script lang="ts">
import type { StatusResponse } from '$lib/types';
import { formatTimePrecise, formatTimeRemaining } from '$lib/utils';
import PauseButton from './PauseButton.svelte';
import ProgressBar from './ProgressBar.svelte';

interface Props {
    status: StatusResponse;
    onpause: () => void;
}

let { status, onpause }: Props = $props();

let trackingLabel = $derived(
    status.isInGracePeriod
        ? 'Grace Period'
        : status.isPaused
          ? 'Paused'
          : status.trackingReason === 'focused'
            ? 'Active'
            : status.trackingReason === 'audible'
              ? 'Audio playing'
              : 'Idle',
);

let trackingColorClass = $derived(
    status.isInGracePeriod
        ? 'text-red-600 dark:text-red-400'
        : status.isPaused
          ? 'text-amber-600 dark:text-amber-400'
          : status.isTracking
            ? 'text-green-600 dark:text-green-400'
            : 'text-gray-500 dark:text-gray-400',
);

/** The large displayed time: grace remaining, pause remaining, or daily remaining */
let displayTime = $derived(
    status.isInGracePeriod
        ? status.graceRemainingSeconds
        : status.isPaused
          ? status.pauseRemainingSeconds
          : status.timeRemainingSeconds,
);

/** Label below the large timer */
let displayLabel = $derived(
    status.isInGracePeriod
        ? 'Grace period — page will be blocked'
        : status.isPaused
          ? 'Pause time remaining'
          : `${formatTimeRemaining(status.timeRemainingSeconds)} remaining`,
);

/** Accent border/ring class for the timer section */
let timerAccentClass = $derived(
    status.isInGracePeriod
        ? 'ring-2 ring-red-400/50 bg-red-50 dark:bg-red-950/30'
        : status.isPaused
          ? 'ring-2 ring-amber-400/50 bg-amber-50 dark:bg-amber-950/30'
          : '',
);

/** Text color class for the large timer */
let timerTextClass = $derived(
    status.isInGracePeriod
        ? 'text-red-600 dark:text-red-400'
        : status.isPaused
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-gray-900 dark:text-gray-100',
);
</script>

<div class="space-y-3" role="region" aria-label="Current domain status for {status.domain}">
  <!-- Domain name + tracking indicator -->
  <div class="flex items-center justify-between">
    <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{status.domain}</span>
    <span class="text-xs font-medium {trackingColorClass}" aria-live="polite">{trackingLabel}</span>
  </div>

  <!-- Time remaining (large) — with accent styling for pause/grace -->
  <div class="text-center rounded-lg p-2 transition-all {timerAccentClass}">
    <div class="text-3xl font-bold tabular-nums {timerTextClass}" aria-live="polite" aria-atomic="true">
      {formatTimePrecise(displayTime)}
    </div>
    <div class="text-xs mt-0.5 {status.isInGracePeriod ? 'text-red-600 dark:text-red-400 font-medium' : status.isPaused ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}">
      {displayLabel}
    </div>
    {#if status.isPaused && !status.isInGracePeriod}
      <!-- Show daily remaining as secondary info while paused -->
      <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
        Daily: {formatTimeRemaining(status.timeRemainingSeconds)} remaining
      </div>
    {/if}
  </div>

  <!-- Progress bar -->
  {#if status.isInGracePeriod}
    <!-- Grace period: no progress bar (or could show grace countdown bar) -->
  {:else}
    <ProgressBar timeSpentSeconds={status.timeSpentSeconds} limitSeconds={status.limitSeconds} />
  {/if}

  <!-- Stats row + pause button -->
  <div class="flex items-center justify-between">
    <span class="text-xs text-gray-500 dark:text-gray-400">
      Visits: {status.visitCount}
    </span>
    {#if !status.isInGracePeriod}
      <PauseButton
        isPaused={status.isPaused}
        pauseRemainingSeconds={status.pauseRemainingSeconds}
        disabled={status.isBlocked}
        onclick={onpause}
      />
    {/if}
  </div>
</div>
