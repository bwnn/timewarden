<script lang="ts">
  import type { StatusResponse } from '$lib/types';
  import { formatTimeRemaining, formatTimePrecise } from '$lib/utils';
  import ProgressBar from './ProgressBar.svelte';
  import PauseButton from './PauseButton.svelte';

  interface Props {
    status: StatusResponse;
    onpause: () => void;
  }

  let { status, onpause }: Props = $props();

  let trackingLabel = $derived(
    status.isPaused
      ? 'Paused'
      : status.trackingReason === 'focused'
        ? 'Active'
        : status.trackingReason === 'audible'
          ? 'Audio playing'
          : 'Idle'
  );

  let trackingColorClass = $derived(
    status.isPaused
      ? 'text-amber-600 dark:text-amber-400'
      : status.isTracking
        ? 'text-green-600 dark:text-green-400'
        : 'text-gray-500 dark:text-gray-400'
  );
</script>

<div class="space-y-3" role="region" aria-label="Current domain status for {status.domain}">
  <!-- Domain name + tracking indicator -->
  <div class="flex items-center justify-between">
    <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{status.domain}</span>
    <span class="text-xs font-medium {trackingColorClass}" aria-live="polite">{trackingLabel}</span>
  </div>

  <!-- Time remaining (large) -->
  <div class="text-center">
    <div class="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100" aria-live="polite" aria-atomic="true">
      {formatTimePrecise(status.timeRemainingSeconds)}
    </div>
    <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
      {formatTimeRemaining(status.timeRemainingSeconds)} remaining
    </div>
  </div>

  <!-- Progress bar -->
  <ProgressBar timeSpentSeconds={status.timeSpentSeconds} limitMinutes={status.limitMinutes} />

  <!-- Stats row + pause button -->
  <div class="flex items-center justify-between">
    <span class="text-xs text-gray-500 dark:text-gray-400">
      Visits: {status.visitCount}
    </span>
    <PauseButton
      isPaused={status.isPaused}
      pauseRemainingSeconds={status.pauseRemainingSeconds}
      disabled={status.isBlocked}
      onclick={onpause}
    />
  </div>
</div>
