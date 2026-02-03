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

  // Live matching-behavior hint
  let domainHint = $derived.by(() => {
    const trimmed = domainInput.trim();
    if (!trimmed) return '';
    const { hasWww, domain } = normalizeDomain(trimmed);
    if (!isValidDomain(domain)) return '';
    if (hasWww) {
      const bare = domain.slice(4);
      return `Will match ${domain} only. Use "${bare}" to match both ${bare} and ${domain}.`;
    }
    return `Will match both ${domain} and www.${domain}.`;
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

<div class="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg shadow-sm p-6">
  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Add New Domain</h3>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    <!-- Domain Input -->
    <div>
      <label for="new-domain" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Domain
      </label>
      <input
        id="new-domain"
        type="text"
        bind:value={domainInput}
        placeholder="youtube.com"
        aria-describedby={domainHint ? 'domain-hint' : undefined}
        aria-invalid={error ? 'true' : undefined}
        class="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
               placeholder:text-gray-400 dark:placeholder:text-gray-500
               focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      />
      {#if domainHint}
        <p id="domain-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{domainHint}</p>
      {/if}
    </div>

    <!-- Daily Limit -->
    <fieldset>
      <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Limit</legend>
      <div class="flex items-center gap-2">
        <label class="sr-only" for="add-limit-hours">Hours</label>
        <input
          id="add-limit-hours"
          type="number"
          bind:value={hours}
          min="0"
          max="24"
          class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500 dark:text-gray-400">hours</span>
        <label class="sr-only" for="add-limit-minutes">Minutes</label>
        <input
          id="add-limit-minutes"
          type="number"
          bind:value={minutes}
          min="0"
          max="59"
          class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500 dark:text-gray-400">minutes</span>
      </div>
    </fieldset>

    {#if error}
      <p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
    {/if}

    <!-- Actions -->
    <div class="flex justify-end gap-3 pt-2">
      <button
        type="button"
        onclick={oncancel}
        class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md
               hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
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
