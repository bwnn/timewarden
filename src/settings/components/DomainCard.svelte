<script lang="ts">
  import type { DomainConfig } from '$lib/types';
  import { formatLimitSeconds } from '$lib/utils';

  interface Props {
    config: DomainConfig;
    isSelected: boolean;
    ontoggle: (domain: string, enabled: boolean) => void;
    onselect: (domain: string) => void;
    ondelete: (domain: string) => void;
  }

  let { config, isSelected, ontoggle, onselect, ondelete }: Props = $props();
</script>

<div
  class="flex items-center justify-between px-4 py-3 rounded-lg border transition-colors
         {isSelected
           ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-800'
           : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}"
  role="listitem"
>
  <!-- Left side: domain info (clickable) -->
  <button
    type="button"
    class="flex flex-col text-left flex-1 min-w-0"
    onclick={() => onselect(config.domain)}
    aria-label="Edit {config.domain}"
    aria-expanded={isSelected}
  >
    <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{config.domain}</span>
    <span class="text-xs text-gray-500 dark:text-gray-400">
      {formatLimitSeconds(config.dailyLimitSeconds)}/day
      {#if !config.enabled}
        <span class="text-gray-400 dark:text-gray-500"> &middot; Disabled</span>
      {/if}
    </span>
  </button>

  <!-- Right side: controls -->
  <div class="flex items-center gap-3 ml-4 shrink-0">
    <!-- Toggle switch -->
    <label class="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={config.enabled}
        onchange={(e) => ontoggle(config.domain, (e.target as HTMLInputElement).checked)}
        class="sr-only peer"
        aria-label="Enable tracking for {config.domain}"
      />
      <div class="w-9 h-5 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-600
                  after:content-[''] after:absolute after:top-0.5 after:start-0.5
                  after:bg-white after:rounded-full after:h-4 after:w-4
                  after:transition-all peer-checked:after:translate-x-full
                  peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800"></div>
    </label>

    <!-- Edit button -->
    <button
      type="button"
      class="text-sm font-medium {isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300'}"
      onclick={() => onselect(config.domain)}
      aria-label="{isSelected ? 'Close' : 'Edit'} {config.domain}"
    >
      {isSelected ? 'Close' : 'Edit'}
    </button>

    <!-- Delete button -->
    <button
      type="button"
      onclick={(e) => { e.stopPropagation(); ondelete(config.domain); }}
      class="text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
      aria-label="Delete {config.domain}"
      title="Delete"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  </div>
</div>
