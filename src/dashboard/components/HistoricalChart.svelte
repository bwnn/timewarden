<script lang="ts">
  import type { DaySummary } from '../dashboard-utils';
  import { getDomainColor, formatCompactTime } from '../dashboard-utils';

  interface Props {
    /** Gap-filled day summaries (one per date in range). */
    days: DaySummary[];
    /** All domain names that appear in the data. */
    domains: string[];
  }

  let { days, domains }: Props = $props();

  // Chart dimensions
  const CHART_WIDTH = 800;
  const CHART_HEIGHT = 280;
  const PADDING_LEFT = 50;
  const PADDING_RIGHT = 10;
  const PADDING_TOP = 10;
  const PADDING_BOTTOM = 40;
  const BAR_GAP = 2;

  let plotWidth = $derived(CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT);
  let plotHeight = $derived(CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM);

  // Compute max total for Y-axis scaling
  let maxTotal = $derived.by(() => {
    let max = 0;
    for (const day of days) {
      if (day.totalSeconds > max) max = day.totalSeconds;
    }
    // Round up to a nice number (nearest 30 minutes)
    return max > 0 ? Math.ceil(max / 1800) * 1800 : 3600;
  });

  // Y-axis tick values (aim for ~4-5 ticks)
  let yTicks = $derived.by(() => {
    const ticks: number[] = [];
    const step = maxTotal / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(Math.round(i * step));
    }
    return ticks;
  });

  // Bar width
  let barWidth = $derived(
    days.length > 0 ? Math.max(4, (plotWidth - BAR_GAP * (days.length - 1)) / days.length) : 20
  );

  // Build bar data
  interface BarSegment {
    domain: string;
    y: number;
    height: number;
    color: string;
  }

  interface BarData {
    x: number;
    dateLabel: string;
    segments: BarSegment[];
    totalSeconds: number;
  }

  let bars = $derived.by((): BarData[] => {
    return days.map((day, i) => {
      const x = PADDING_LEFT + i * (barWidth + BAR_GAP);
      const dateLabel = formatDateLabel(day.date);

      // Build stacked segments from bottom up
      const segments: BarSegment[] = [];
      let cumulative = 0;

      for (let di = 0; di < domains.length; di++) {
        const domainEntry = day.domains.find((d) => d.domain === domains[di]);
        const seconds = domainEntry?.timeSpentSeconds ?? 0;
        if (seconds <= 0) continue;

        const segHeight = (seconds / maxTotal) * plotHeight;
        const y = PADDING_TOP + plotHeight - cumulative - segHeight;
        segments.push({
          domain: domains[di],
          y,
          height: segHeight,
          color: getDomainColor(domains[di], di),
        });
        cumulative += segHeight;
      }

      return { x, dateLabel, segments, totalSeconds: day.totalSeconds };
    });
  });

  function formatDateLabel(dateStr: string): string {
    const [, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
  }

  // Tooltip state
  let hoveredBar = $state<BarData | null>(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  function handleBarEnter(bar: BarData, event: MouseEvent) {
    hoveredBar = bar;
    const svg = (event.target as SVGElement).closest('svg');
    if (svg) {
      const rect = svg.getBoundingClientRect();
      tooltipX = event.clientX - rect.left;
      tooltipY = event.clientY - rect.top - 10;
    }
  }

  function handleBarLeave() {
    hoveredBar = null;
  }
</script>

<section>
  <h2 class="text-lg font-semibold text-gray-900 mb-4">Daily Usage</h2>

  {#if days.length === 0 || domains.length === 0}
    <div class="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
      No usage data for this period.
    </div>
  {:else}
    <div class="bg-white rounded-lg border border-gray-200 p-4">
      <!-- Legend -->
      <div class="flex flex-wrap gap-3 mb-3">
        {#each domains as domain, i}
          <div class="flex items-center gap-1.5 text-xs text-gray-600">
            <span
              class="inline-block w-3 h-3 rounded-sm"
              style="background: {getDomainColor(domain, i)}"
            ></span>
            {domain}
          </div>
        {/each}
      </div>

      <!-- SVG Chart -->
      <div class="relative overflow-x-auto">
        <svg
          viewBox="0 0 {CHART_WIDTH} {CHART_HEIGHT}"
          class="w-full"
          style="min-width: {Math.max(400, days.length * 20)}px"
          role="img"
          aria-label="Daily usage bar chart"
        >
          <!-- Y-axis grid lines and labels -->
          {#each yTicks as tick}
            {@const y = PADDING_TOP + plotHeight - (tick / maxTotal) * plotHeight}
            <line
              x1={PADDING_LEFT}
              y1={y}
              x2={PADDING_LEFT + plotWidth}
              y2={y}
              stroke="#e5e7eb"
              stroke-width="1"
            />
            <text
              x={PADDING_LEFT - 8}
              y={y + 4}
              text-anchor="end"
              fill="#9ca3af"
              font-size="11"
            >
              {formatCompactTime(tick)}
            </text>
          {/each}

          <!-- Bars -->
          {#each bars as bar}
            <!-- Invisible hover target for the full bar area -->
            <rect
              x={bar.x}
              y={PADDING_TOP}
              width={barWidth}
              height={plotHeight}
              fill="transparent"
              onmouseenter={(e) => handleBarEnter(bar, e)}
              onmouseleave={handleBarLeave}
              role="presentation"
            />

            <!-- Stacked segments -->
            {#each bar.segments as seg}
              <rect
                x={bar.x}
                y={seg.y}
                width={barWidth}
                height={Math.max(1, seg.height)}
                fill={seg.color}
                rx="1"
                onmouseenter={(e) => handleBarEnter(bar, e)}
                onmouseleave={handleBarLeave}
                role="presentation"
              />
            {/each}

            <!-- X-axis date label (show every Nth to avoid overlap) -->
            {#if days.length <= 14 || bars.indexOf(bar) % Math.ceil(days.length / 10) === 0}
              <text
                x={bar.x + barWidth / 2}
                y={CHART_HEIGHT - 8}
                text-anchor="middle"
                fill="#9ca3af"
                font-size="10"
              >
                {bar.dateLabel}
              </text>
            {/if}
          {/each}
        </svg>

        <!-- Tooltip -->
        {#if hoveredBar}
          <div
            class="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10"
            style="left: {tooltipX}px; top: {tooltipY}px; transform: translate(-50%, -100%)"
          >
            <div class="font-medium mb-1">{hoveredBar.dateLabel}</div>
            {#each hoveredBar.segments as seg}
              <div class="flex items-center gap-1.5">
                <span class="inline-block w-2 h-2 rounded-sm" style="background: {seg.color}"></span>
                {seg.domain}: {formatCompactTime(seg.height / plotHeight * maxTotal)}
              </div>
            {/each}
            <div class="border-t border-gray-700 mt-1 pt-1 font-medium">
              Total: {formatCompactTime(hoveredBar.totalSeconds)}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>
