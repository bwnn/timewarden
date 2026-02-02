<script lang="ts">
  import type { DomainConfig } from '$lib/types';
  import { formatLimitMinutes } from '$lib/utils';

  interface Props {
    config: DomainConfig;
    isSelected: boolean;
    ontoggle: (domain: string, enabled: boolean) => void;
    onselect: (domain: string) => void;
  }

  let { config, isSelected, ontoggle, onselect }: Props = $props();
</script>

<div
  class="flex items-center justify-between px-4 py-3 rounded-lg border transition-colors
         {isSelected
           ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
           : 'bg-white border-gray-200 hover:border-gray-300'}"
>
  <!-- Left side: domain info (clickable) -->
  <button
    type="button"
    class="flex flex-col text-left flex-1 min-w-0"
    onclick={() => onselect(config.domain)}
  >
    <span class="text-sm font-medium text-gray-900 truncate">{config.domain}</span>
    <span class="text-xs text-gray-500">
      {formatLimitMinutes(config.dailyLimitMinutes)}/day
      {#if !config.enabled}
        <span class="text-gray-400"> &middot; Disabled</span>
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
      />
      <div class="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600
                  after:content-[''] after:absolute after:top-0.5 after:start-0.5
                  after:bg-white after:rounded-full after:h-4 after:w-4
                  after:transition-all peer-checked:after:translate-x-full
                  peer-focus:ring-2 peer-focus:ring-blue-300"></div>
    </label>

    <!-- Edit button -->
    <button
      type="button"
      class="text-sm font-medium {isSelected ? 'text-blue-700' : 'text-blue-600 hover:text-blue-800'}"
      onclick={() => onselect(config.domain)}
    >
      {isSelected ? 'Close' : 'Edit'}
    </button>
  </div>
</div>
