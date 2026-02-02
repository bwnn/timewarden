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

  // Days ordered Mon-Sun
  const days: DayOfWeek[] = ['1', '2', '3', '4', '5', '6', '0'];

  // -- Helpers ---------------------------------------------------

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

  // -- Mutations (emit new overrides to parent) ------------------

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

<div class="space-y-1" role="grid" aria-label="Day override settings">
  <!-- Header row -->
  <div class="grid grid-cols-[56px_1fr_1fr] gap-x-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-2 pb-2" role="row">
    <div role="columnheader">Day</div>
    <div role="columnheader">Limit</div>
    <div role="columnheader">Reset Time</div>
  </div>

  {#each days as day (day)}
    {@const locked = isLocked(day)}
    {@const limitSet = hasLimit(day)}
    {@const resetSet = hasReset(day)}

    <div
      class="grid grid-cols-[56px_1fr_1fr] gap-x-3 items-center px-2 py-2 rounded-md
             {locked ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}"
      role="row"
    >
      <!-- Day name -->
      <div class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1" role="rowheader">
        {getDayShortName(day)}
        {#if locked}
          <span class="text-amber-500" title="Current period - values are locked" aria-label="Locked">&#128274;</span>
        {/if}
      </div>

      <!-- Limit cell -->
      <div class="flex items-center gap-1 min-w-0" role="gridcell">
        {#if locked}
          <span class="text-sm text-amber-700 dark:text-amber-400 font-medium">
            {formatLimitMinutes(getLimitMinutes(day))}
          </span>
          <span class="text-xs text-amber-500 dark:text-amber-500">(locked)</span>
        {:else if limitSet}
          <label class="sr-only" for="limit-h-{day}">Hours for {getDayShortName(day)}</label>
          <input
            id="limit-h-{day}"
            type="number"
            value={getLimitHours(day)}
            min="0"
            max="24"
            onchange={(e) => handleLimitHoursChange(day, parseInt((e.target as HTMLInputElement).value) || 0)}
            class="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-1.5 py-1 text-sm text-center
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span class="text-xs text-gray-400 dark:text-gray-500">h</span>
          <label class="sr-only" for="limit-m-{day}">Minutes for {getDayShortName(day)}</label>
          <input
            id="limit-m-{day}"
            type="number"
            value={getLimitMins(day)}
            min="0"
            max="59"
            onchange={(e) => handleLimitMinsChange(day, parseInt((e.target as HTMLInputElement).value) || 0)}
            class="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-1.5 py-1 text-sm text-center
                   focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <span class="text-xs text-gray-400 dark:text-gray-500">m</span>
          <button
            type="button"
            onclick={() => clearLimitOverride(day)}
            class="ml-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm leading-none"
            title="Revert to default"
            aria-label="Clear limit override for {getDayShortName(day)}"
          >&times;</button>
        {:else}
          <button
            type="button"
            onclick={() => enableLimitOverride(day)}
            class="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30
                   px-2 py-1 rounded transition-colors truncate"
          >
            Default <span class="text-gray-400 dark:text-gray-500">({formatLimitMinutes(defaultLimitMinutes)})</span>
          </button>
        {/if}
      </div>

      <!-- Reset time cell -->
      <div class="flex items-center gap-1 min-w-0" role="gridcell">
        {#if locked}
          <span class="text-sm text-amber-700 dark:text-amber-400 font-medium">
            {getResetTime(day)}
          </span>
          <span class="text-xs text-amber-500 dark:text-amber-500">(locked)</span>
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
            class="ml-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm leading-none"
            title="Revert to default"
            aria-label="Clear reset time override for {getDayShortName(day)}"
          >&times;</button>
        {:else}
          <button
            type="button"
            onclick={() => enableResetOverride(day)}
            class="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30
                   px-2 py-1 rounded transition-colors truncate"
          >
            Default <span class="text-gray-400 dark:text-gray-500">({defaultResetTime})</span>
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>
