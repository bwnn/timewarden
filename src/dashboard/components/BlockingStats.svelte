<script lang="ts">
  import type { BlockingStatsData } from '../dashboard-utils';

  interface Props {
    data: BlockingStatsData;
  }

  let { data }: Props = $props();

  let maxHourBlocks = $derived(Math.max(1, ...data.blocksByHour));

  function formatHour(hour: number): string {
    if (hour === 0) return '12a';
    if (hour === 12) return '12p';
    if (hour < 12) return `${hour}a`;
    return `${hour - 12}p`;
  }

  // Find peak blocking hour
  let peakHour = $derived.by(() => {
    let max = 0;
    let peak = -1;
    for (let i = 0; i < 24; i++) {
      if (data.blocksByHour[i] > max) {
        max = data.blocksByHour[i];
        peak = i;
      }
    }
    return peak >= 0 ? formatHour(peak) : '--';
  });
</script>

<section>
  <h2 class="text-lg font-semibold text-gray-900 mb-4">Blocking Stats</h2>

  {#if data.totalBlocks === 0}
    <div class="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
      No blocks recorded in this period. Great discipline!
    </div>
  {:else}
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Summary stats -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <h3 class="text-sm font-medium text-gray-500 mb-3">Summary</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-2xl font-bold text-gray-900">{data.totalBlocks}</div>
            <div class="text-xs text-gray-500">Total blocks</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-900">{data.blocksPerWeek}</div>
            <div class="text-xs text-gray-500">Blocks / week</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-900">{peakHour}</div>
            <div class="text-xs text-gray-500">Peak block hour</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-emerald-600">{data.longestUnderLimitStreak}d</div>
            <div class="text-xs text-gray-500">Best streak</div>
          </div>
        </div>

        {#if data.currentUnderLimitStreak > 0}
          <div class="mt-3 pt-3 border-t border-gray-100">
            <div class="text-sm text-emerald-600 font-medium">
              Current streak: {data.currentUnderLimitStreak} day{data.currentUnderLimitStreak !== 1 ? 's' : ''} under limit
            </div>
          </div>
        {/if}
      </div>

      <!-- Blocks by domain -->
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <h3 class="text-sm font-medium text-gray-500 mb-3">Blocks by Domain</h3>
        <div class="space-y-2">
          {#each data.blocksByDomain as entry}
            {@const percent = (entry.count / data.totalBlocks) * 100}
            <div>
              <div class="flex items-center justify-between text-sm mb-0.5">
                <span class="text-gray-700">{entry.domain}</span>
                <span class="text-gray-500">{entry.count}</span>
              </div>
              <div class="w-full h-1.5 bg-gray-100 rounded-full">
                <div
                  class="h-full rounded-full bg-red-400 transition-all"
                  style="width: {percent}%"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Blocks by hour -->
      <div class="bg-white rounded-lg border border-gray-200 p-4 md:col-span-2">
        <h3 class="text-sm font-medium text-gray-500 mb-3">Blocks by Hour of Day</h3>
        <div class="flex items-end gap-0.5 h-20">
          {#each data.blocksByHour as count, hour}
            <div class="flex-1 flex flex-col items-center gap-0.5">
              <div
                class="w-full rounded-t transition-all"
                style="height: {count > 0 ? Math.max(4, (count / maxHourBlocks) * 100) : 0}%; background-color: {count > 0 ? `rgba(239, 68, 68, ${0.3 + 0.7 * (count / maxHourBlocks)})` : '#f3f4f6'}"
              ></div>
              {#if hour % 3 === 0}
                <span class="text-xs text-gray-400" style="font-size: 9px">{formatHour(hour)}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>
