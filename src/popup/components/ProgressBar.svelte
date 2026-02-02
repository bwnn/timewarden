<script lang="ts">
  import { getUsagePercent, getProgressColor } from '$lib/utils';

  interface Props {
    timeSpentSeconds: number;
    limitMinutes: number;
  }

  let { timeSpentSeconds, limitMinutes }: Props = $props();

  let usedPercent = $derived(getUsagePercent(timeSpentSeconds, limitMinutes));
  let color = $derived(getProgressColor(timeSpentSeconds, limitMinutes));

  let barColorClass = $derived(
    color === 'green'
      ? 'bg-green-500'
      : color === 'yellow'
        ? 'bg-yellow-500'
        : 'bg-red-500'
  );

  let bgColorClass = $derived(
    color === 'green'
      ? 'bg-green-100 dark:bg-green-900/40'
      : color === 'yellow'
        ? 'bg-yellow-100 dark:bg-yellow-900/40'
        : 'bg-red-100 dark:bg-red-900/40'
  );
</script>

<div
  class="w-full h-3 rounded-full {bgColorClass} overflow-hidden"
  role="progressbar"
  aria-valuenow={Math.floor(usedPercent)}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="Time usage: {Math.floor(usedPercent)}% used"
>
  <div
    class="h-full rounded-full transition-all duration-500 ease-out {barColorClass}"
    style="width: {Math.min(100, usedPercent)}%"
  ></div>
</div>
