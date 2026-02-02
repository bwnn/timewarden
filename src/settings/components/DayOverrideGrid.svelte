<script lang="ts">
  import type { DayOfWeek, DayOverride } from '$lib/types';
  import { getDayShortName, formatLimitMinutes } from '$lib/utils';
  import { MIN_LIMIT_MINUTES, MAX_LIMIT_MINUTES } from '$lib/constants';
  import TimePicker from './TimePicker.svelte';

  interface Props {
    dayOverrides: Partial<Record<DayOfWeek, DayOverride>>;
    defaultLimitMinutes: number;
    defaultResetTime: string;
    lockedDay: DayOfWeek | null;
    onchange: (overrides: Partial<Record<DayOfWeek, DayOverride>>) => void;
  }

  let { dayOverrides, defaultLimitMinutes, defaultResetTime, lockedDay, onchange }: Props = $props();

  // Days ordered Mon–Sun
  const days: DayOfWeek[] = ['1', '2', '3', '4', '5', '6', '0'];

  // ── Helpers ─────────────────────────────────────────────

  function hasLimit(day: DayOfWeek): boolean {
    return dayOverrides[day]?.limitMinutes !== undefined;
  }

  function hasReset(day: DayOfWeek): boolean {
    return dayOverrides[day]?.resetTime !== undefined;
  }

  function getLimitMinutes(day: DayOfWeek): number {
    return dayOverrides[day]?.limitMinutes ?? defaultLimitMinutes;
  }

  function getLimitHours(day: DayOfWeek): number {
    return Math.floor(getLimitMinutes(day) / 60);
  }

  function getLimitMins(day: DayOfWeek): number {
    return getLimitMinutes(day) % 60;
  }

  function getResetTime(day: DayOfWeek): string {
    return dayOverrides[day]?.resetTime ?? defaultResetTime;
  }

  function isLocked(day: DayOfWeek): boolean {
    return day === lockedDay;
  }

  // ── Mutations (emit new overrides to parent) ────────────

  function setLimitOverride(day: DayOfWeek, totalMinutes: number) {
    const clamped = Math.max(MIN_LIMIT_MINUTES, Math.min(MAX_LIMIT_MINUTES, totalMinutes));
    const newOverrides = { ...dayOverrides };
    newOverrides[day] = { ...(newOverrides[day] ?? {}), limitMinutes: clamped };
    onchange(newOverrides);
  }

  function clearLimitOverride(day: DayOfWeek) {
    const current = dayOverrides[day];
    if (!current) return;
    const updated: DayOverride = { ...current };
    delete updated.limitMinutes;
    const newOverrides = { ...dayOverrides };
    if (updated.resetTime === undefined) {
      delete newOverrides[day];
    } else {
      newOverrides[day] = updated;
    }
    onchange(newOverrides);
  }

  function enableLimitOverride(day: DayOfWeek) {
    setLimitOverride(day, defaultLimitMinutes);
  }

  function setResetOverride(day: DayOfWeek, time: string) {
    const newOverrides = { ...dayOverrides };
    newOverrides[day] = { ...(newOverrides[day] ?? {}), resetTime: time };
    onchange(newOverrides);
  }

  function clearResetOverride(day: DayOfWeek) {
    const current = dayOverrides[day];
    if (!current) return;
    const updated: DayOverride = { ...current };
    delete updated.resetTime;
    const newOverrides = { ...dayOverrides };
    if (updated.limitMinutes === undefined) {
      delete newOverrides[day];
    } else {
      newOverrides[day] = updated;
    }
    onchange(newOverrides);
  }

  function enableResetOverride(day: DayOfWeek) {
    setResetOverride(day, defaultResetTime);
  }

  function handleLimitHoursChange(day: DayOfWeek, newHours: number) {
    const currentMins = getLimitMins(day);
    setLimitOverride(day, newHours * 60 + currentMins);
  }

  function handleLimitMinsChange(day: DayOfWeek, newMins: number) {
    const currentHours = getLimitHours(day);
    setLimitOverride(day, currentHours * 60 + newMins);
  }
</script>

<div class="space-y-1">
  <!-- Header row -->
  <div class="grid grid-cols-[56px_1fr_1fr] gap-x-3 text-xs font-medium text-gray-500 uppercase tracking-wide px-2 pb-2">
    <div>Day</div>
    <div>Limit</div>
    <div>Reset Time</div>
  </div>

  {#each days as day (day)}
    {@const locked = isLocked(day)}
    {@const limitSet = hasLimit(day)}
    {@const resetSet = hasReset(day)}

    <div
      class="grid grid-cols-[56px_1fr_1fr] gap-x-3 items-center px-2 py-2 rounded-md
             {locked ? 'bg-amber-50 border border-amber-200' : 'hover:bg-gray-50'}"
    >
      <!-- Day name -->
      <div class="text-sm font-medium text-gray-700 flex items-center gap-1">
        {getDayShortName(day)}
        {#if locked}
          <span class="text-amber-500" title="Current period — values are locked">&#128274;</span>
        {/if}
      </div>

      <!-- Limit cell -->
      <div class="flex items-center gap-1 min-w-0">
        {#if locked}
          <span class="text-sm text-amber-700 font-medium">
            {formatLimitMinutes(getLimitMinutes(day))}
          </span>
          <span class="text-xs text-amber-500">(locked)</span>
        {:else if limitSet}
          <input
            type="number"
            value={getLimitHours(day)}
            min="0"
            max="24"
            onchange={(e) => handleLimitHoursChange(day, parseInt((e.target as HTMLInputElement).value) || 0)}
            class="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm text-center
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span class="text-xs text-gray-400">h</span>
          <input
            type="number"
            value={getLimitMins(day)}
            min="0"
            max="59"
            onchange={(e) => handleLimitMinsChange(day, parseInt((e.target as HTMLInputElement).value) || 0)}
            class="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm text-center
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span class="text-xs text-gray-400">m</span>
          <button
            type="button"
            onclick={() => clearLimitOverride(day)}
            class="ml-1 text-gray-400 hover:text-gray-600 text-sm leading-none"
            title="Revert to default"
          >&times;</button>
        {:else}
          <button
            type="button"
            onclick={() => enableLimitOverride(day)}
            class="text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50
                   px-2 py-1 rounded transition-colors truncate"
          >
            Default <span class="text-gray-400">({formatLimitMinutes(defaultLimitMinutes)})</span>
          </button>
        {/if}
      </div>

      <!-- Reset time cell -->
      <div class="flex items-center gap-1 min-w-0">
        {#if locked}
          <span class="text-sm text-amber-700 font-medium">
            {getResetTime(day)}
          </span>
          <span class="text-xs text-amber-500">(locked)</span>
        {:else if resetSet}
          <div class="w-28">
            <TimePicker
              value={getResetTime(day)}
              onchange={(v) => setResetOverride(day, v)}
            />
          </div>
          <button
            type="button"
            onclick={() => clearResetOverride(day)}
            class="ml-1 text-gray-400 hover:text-gray-600 text-sm leading-none"
            title="Revert to default"
          >&times;</button>
        {:else}
          <button
            type="button"
            onclick={() => enableResetOverride(day)}
            class="text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50
                   px-2 py-1 rounded transition-colors truncate"
          >
            Default <span class="text-gray-400">({defaultResetTime})</span>
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>
