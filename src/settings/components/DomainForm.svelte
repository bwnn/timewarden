<script lang="ts">
  import type { DomainConfig } from '$lib/types';
  import { isValidDomain, normalizeDomain } from '$lib/domain-matcher';
  import {
    DEFAULT_DAILY_LIMIT_MINUTES,
    DEFAULT_PAUSE_ALLOWANCE_MINUTES,
    MIN_LIMIT_MINUTES,
    MAX_LIMIT_MINUTES,
  } from '$lib/constants';

  interface Props {
    existingDomains: string[];
    onsubmit: (config: DomainConfig) => void;
    oncancel: () => void;
  }

  let { existingDomains, onsubmit, oncancel }: Props = $props();

  let domainInput = $state('');
  let hours = $state(Math.floor(DEFAULT_DAILY_LIMIT_MINUTES / 60));
  let minutes = $state(DEFAULT_DAILY_LIMIT_MINUTES % 60);
  let error = $state('');

  // Live www. detection
  let wwwWarning = $derived.by(() => {
    const trimmed = domainInput.trim();
    if (!trimmed) return '';
    const { strippedWww, domain } = normalizeDomain(trimmed);
    if (strippedWww) {
      return `"www." will be removed. Will track "${domain}" (www.${domain} is treated as a different site).`;
    }
    return '';
  });

  function handleSubmit() {
    error = '';

    if (!domainInput.trim()) {
      error = 'Please enter a domain.';
      return;
    }

    const { domain } = normalizeDomain(domainInput);

    if (!isValidDomain(domain)) {
      error = 'Invalid domain. Enter a hostname like "youtube.com" (no http://, paths, or ports).';
      return;
    }

    if (existingDomains.includes(domain)) {
      error = `"${domain}" is already being tracked.`;
      return;
    }

    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes < MIN_LIMIT_MINUTES) {
      error = `Limit must be at least ${MIN_LIMIT_MINUTES} minute.`;
      return;
    }

    if (totalMinutes > MAX_LIMIT_MINUTES) {
      error = `Limit cannot exceed 24 hours (${MAX_LIMIT_MINUTES} minutes).`;
      return;
    }

    const config: DomainConfig = {
      domain,
      dailyLimitMinutes: totalMinutes,
      enabled: true,
      createdAt: new Date().toISOString(),
      pauseAllowanceMinutes: DEFAULT_PAUSE_ALLOWANCE_MINUTES,
      resetTime: null,
      dayOverrides: {},
    };

    onsubmit(config);
  }
</script>

<div class="bg-white border border-blue-200 rounded-lg shadow-sm p-6">
  <h3 class="text-base font-semibold text-gray-900 mb-4">Add New Domain</h3>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <!-- Domain Input -->
    <div>
      <label for="new-domain" class="block text-sm font-medium text-gray-700 mb-1">
        Domain
      </label>
      <input
        id="new-domain"
        type="text"
        bind:value={domainInput}
        placeholder="youtube.com"
        class="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm
               placeholder:text-gray-400
               focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
      {#if wwwWarning}
        <p class="mt-1 text-xs text-amber-600">{wwwWarning}</p>
      {/if}
    </div>

    <!-- Daily Limit -->
    <div>
      <span class="block text-sm font-medium text-gray-700 mb-1">Daily Limit</span>
      <div class="flex items-center gap-2">
        <input
          type="number"
          bind:value={hours}
          min="0"
          max="24"
          class="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500">hours</span>
        <input
          type="number"
          bind:value={minutes}
          min="0"
          max="59"
          class="w-20 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500">minutes</span>
      </div>
    </div>

    {#if error}
      <p class="text-sm text-red-600">{error}</p>
    {/if}

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-2">
      <button
        type="button"
        onclick={oncancel}
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md
               hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md
               hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Add Domain
      </button>
    </div>
  </form>
</div>
