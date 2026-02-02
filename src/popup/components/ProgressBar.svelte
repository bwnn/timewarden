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
      ? 'bg-green-100'
      : color === 'yellow'
        ? 'bg-yellow-100'
        : 'bg-red-100'
  );
</script>

<div class="w-full h-3 rounded-full {bgColorClass} overflow-hidden">
  <div
    class="h-full rounded-full transition-all duration-500 ease-out {barColorClass}"
    style="width: {Math.min(100, usedPercent)}%"
  ></div>
</div>
