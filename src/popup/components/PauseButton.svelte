<script lang="ts">
import { formatTimeRemaining } from '$lib/utils';

interface Props {
    isPaused: boolean;
    pauseRemainingSeconds: number;
    disabled?: boolean;
    onclick: () => void;
}

let { isPaused, pauseRemainingSeconds, disabled = false, onclick }: Props = $props();

let exhausted = $derived(pauseRemainingSeconds <= 0 && !isPaused);
let buttonDisabled = $derived(disabled || exhausted);

let label = $derived(
    isPaused
        ? `Resume (${formatTimeRemaining(pauseRemainingSeconds)} left)`
        : exhausted
          ? 'Pause (exhausted)'
          : `Pause (${formatTimeRemaining(pauseRemainingSeconds)} left)`,
);
</script>

<button
  type="button"
  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
    {isPaused
      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60'
      : buttonDisabled
        ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
  disabled={buttonDisabled}
  {onclick}
  aria-label={label}
>
  {#if isPaused}
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  {:else}
    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
    </svg>
  {/if}
  {label}
</button>
