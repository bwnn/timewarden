<script lang="ts">
  import type { DomainConfig, DayOfWeek, DayOverride } from '$lib/types';
  import { isValidDomain, normalizeDomain } from '$lib/domain-matcher';
  import { formatLimitSeconds } from '$lib/utils';
  import {
    DEFAULT_DAILY_LIMIT_SECONDS,
    DEFAULT_PAUSE_ALLOWANCE_SECONDS,
    MIN_LIMIT_SECONDS,
    MAX_LIMIT_SECONDS,
  } from '$lib/constants';
  import DayOverrideGrid from './DayOverrideGrid.svelte';
  import TimePicker from './TimePicker.svelte';

  interface Props {
    mode: 'add' | 'edit';
    initialConfig?: DomainConfig;
    existingDomains?: string[];
    globalResetTime: string;
    lockedDay?: DayOfWeek | null;
    onsave: (config: DomainConfig) => Promise<void>;
    oncancel: () => void;
  }

  let {
    mode,
    initialConfig,
    existingDomains = [],
    globalResetTime,
    lockedDay = null,
    onsave,
    oncancel,
  }: Props = $props();

  // -- Internal State ------------------------------------------------

  const defaultNewConfig: DomainConfig = {
    domain: '',
    dailyLimitSeconds: DEFAULT_DAILY_LIMIT_SECONDS,
    enabled: true,
    createdAt: new Date().toISOString(),
    pauseAllowanceSeconds: DEFAULT_PAUSE_ALLOWANCE_SECONDS,
    resetTime: null,
    dayOverrides: {},
  };

  function cloneConfig(c: DomainConfig): DomainConfig {
    return JSON.parse(JSON.stringify(c));
  }

  // Intentionally capture initial prop values only — the component owns its own state copy.
  // svelte-ignore state_referenced_locally
  let config = $state<DomainConfig>(
    initialConfig
      ? cloneConfig($state.snapshot(initialConfig) as DomainConfig)
      : cloneConfig(defaultNewConfig)
  );

  // Snapshot of the original for dirty detection / revert (edit mode only)
  // svelte-ignore state_referenced_locally
  let originalSnapshot: string | null =
    initialConfig ? JSON.stringify($state.snapshot(initialConfig)) : null;
  // svelte-ignore state_referenced_locally
  let originalConfig: DomainConfig | null =
    initialConfig ? cloneConfig($state.snapshot(initialConfig) as DomainConfig) : null;

  // svelte-ignore state_referenced_locally
  let domainInput = $state(mode === 'add' ? '' : config.domain);
  // svelte-ignore state_referenced_locally
  let showAdvanced = $state(mode === 'edit');
  let error = $state('');
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // -- Derived -------------------------------------------------------

  let limitHours = $derived(Math.floor(config.dailyLimitSeconds / 3600));
  let limitMinutes = $derived(Math.floor((config.dailyLimitSeconds % 3600) / 60));
  let limitSeconds = $derived(config.dailyLimitSeconds % 60);

  let useCustomReset = $derived(config.resetTime !== null);
  let effectiveResetTime = $derived(config.resetTime ?? globalResetTime);

  let isDirty = $derived(
    originalSnapshot !== null
      ? JSON.stringify($state.snapshot(config)) !== originalSnapshot
      : false
  );

  // Domain hint (add mode)
  let domainHint = $derived.by(() => {
    if (mode !== 'add') return '';
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

  // -- Handlers: Field Changes ---------------------------------------

  function handleLimitChange(newHours: number, newMins: number, newSecs: number) {
    const total = Math.max(
      MIN_LIMIT_SECONDS,
      Math.min(MAX_LIMIT_SECONDS, newHours * 3600 + newMins * 60 + newSecs)
    );
    config.dailyLimitSeconds = total;
  }

  function handleResetToggle(useCustom: boolean) {
    config.resetTime = useCustom ? globalResetTime : null;
  }

  function handleResetChange(time: string) {
    config.resetTime = time;
  }

  function handlePauseChange(value: number) {
    config.pauseAllowanceSeconds = Math.max(0, Math.min(3600, value));
  }

  function handleDayOverridesChange(overrides: Partial<Record<DayOfWeek, DayOverride>>) {
    config.dayOverrides = overrides;
  }

  // -- Handlers: Actions ---------------------------------------------

  function handleRevert() {
    if (originalConfig) {
      config = cloneConfig(originalConfig);
    }
  }

  async function handleSave() {
    error = '';

    // Validate domain in add mode
    if (mode === 'add') {
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
      config.domain = domain;
      config.createdAt = new Date().toISOString();
    }

    // Validate limit
    if (config.dailyLimitSeconds < MIN_LIMIT_SECONDS) {
      error = 'Limit must be at least 1 second.';
      return;
    }
    if (config.dailyLimitSeconds > MAX_LIMIT_SECONDS) {
      error = 'Limit cannot exceed 24 hours.';
      return;
    }

    saveStatus = 'saving';
    try {
      await onsave($state.snapshot(config) as DomainConfig);
      if (mode === 'edit') {
        // Update baseline for dirty tracking after successful save
        const snapshot = $state.snapshot(config) as DomainConfig;
        originalSnapshot = JSON.stringify(snapshot);
        originalConfig = cloneConfig(snapshot);
        saveStatus = 'saved';
        setTimeout(() => {
          if (saveStatus === 'saved') saveStatus = 'idle';
        }, 2000);
      }
      // In add mode, the parent will unmount this component (showAddForm = false)
    } catch {
      saveStatus = 'error';
    }
  }
</script>

<div
  class={mode === 'add'
    ? 'bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg shadow-sm'
    : 'border border-t-0 border-gray-200 dark:border-gray-700 rounded-b-lg bg-white dark:bg-gray-800'}
>
  {#if mode === 'add'}
    <div class="px-6 pt-6 pb-0">
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Add New Domain</h3>
    </div>
  {/if}

  <div class="p-6 space-y-6">
    <!-- Domain Input (add mode only) -->
    {#if mode === 'add'}
      <div>
        <label for="domain-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Domain
        </label>
        <input
          id="domain-input"
          type="text"
          bind:value={domainInput}
          placeholder="youtube.com"
          aria-describedby={domainHint ? 'domain-hint' : undefined}
          aria-invalid={error ? 'true' : undefined}
          onkeydown={(e) => { if (e.key === 'Enter') handleSave(); }}
          class="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 placeholder:text-gray-400 dark:placeholder:text-gray-500
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {#if domainHint}
          <p id="domain-hint" class="mt-1 text-xs text-gray-500 dark:text-gray-400">{domainHint}</p>
        {/if}
      </div>
    {/if}

    <!-- Default Daily Limit -->
    <div>
      <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Default Daily Limit</span>
      <div class="flex items-center gap-2">
        <label class="sr-only" for="limit-hours">Hours</label>
        <input
          id="limit-hours"
          type="number"
          value={limitHours}
          min="0"
          max="24"
          onchange={(e) =>
            handleLimitChange(
              parseInt((e.target as HTMLInputElement).value) || 0,
              limitMinutes,
              limitSeconds
            )}
          class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500 dark:text-gray-400">h</span>
        <label class="sr-only" for="limit-minutes">Minutes</label>
        <input
          id="limit-minutes"
          type="number"
          value={limitMinutes}
          min="0"
          max="59"
          onchange={(e) =>
            handleLimitChange(
              limitHours,
              parseInt((e.target as HTMLInputElement).value) || 0,
              limitSeconds
            )}
          class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500 dark:text-gray-400">m</span>
        <label class="sr-only" for="limit-seconds">Seconds</label>
        <input
          id="limit-seconds"
          type="number"
          value={limitSeconds}
          min="0"
          max="59"
          onchange={(e) =>
            handleLimitChange(
              limitHours,
              limitMinutes,
              parseInt((e.target as HTMLInputElement).value) || 0
            )}
          class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        <span class="text-sm text-gray-500 dark:text-gray-400">s</span>
        <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">
          ({formatLimitSeconds(config.dailyLimitSeconds)})
        </span>
      </div>
    </div>

    <!-- Advanced Options Toggle -->
    <div>
      <button
        type="button"
        onclick={() => (showAdvanced = !showAdvanced)}
        class="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <svg
          class="w-4 h-4 transition-transform duration-200 {showAdvanced ? 'rotate-90' : ''}"
          fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Advanced Options
      </button>
    </div>

    <!-- Advanced Options Section -->
    {#if showAdvanced}
      <div class="space-y-6">
        <!-- Domain Reset Time -->
        <fieldset>
          <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reset Time</legend>
          <div class="space-y-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reset-mode-{mode}"
                checked={!useCustomReset}
                onchange={() => handleResetToggle(false)}
                class="text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Use global default
                <span class="text-gray-400 dark:text-gray-500">({globalResetTime})</span>
              </span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reset-mode-{mode}"
                checked={useCustomReset}
                onchange={() => handleResetToggle(true)}
                class="text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">Custom reset time</span>
            </label>
            {#if useCustomReset}
              <div class="ml-6 w-28">
                <TimePicker
                  value={config.resetTime ?? globalResetTime}
                  onchange={handleResetChange}
                />
              </div>
            {/if}
          </div>
        </fieldset>

        <!-- Pause Allowance -->
        <div>
          <label for="pause-allowance-{mode}" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pause Allowance</label>
          <div class="flex items-center gap-2">
            <input
              id="pause-allowance-{mode}"
              type="number"
              value={Math.floor(config.pauseAllowanceSeconds / 60)}
              min="0"
              max="60"
              onchange={(e) =>
                handlePauseChange(
                  (parseInt((e.target as HTMLInputElement).value) || 0) * 60
                )}
              class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                     focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <span class="text-sm text-gray-500 dark:text-gray-400">minutes per day</span>
          </div>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Maximum time you can pause tracking per day</p>
        </div>

        <!-- Day Overrides -->
        <div>
          <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day Overrides</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Customize limits and reset times for specific days. Click "Default" to set a custom value.
          </p>
          <DayOverrideGrid
            dayOverrides={config.dayOverrides}
            defaultLimitSeconds={config.dailyLimitSeconds}
            defaultResetTime={effectiveResetTime}
            {lockedDay}
            onchange={handleDayOverridesChange}
          />
        </div>
      </div>
    {/if}

    <!-- Error message -->
    {#if error}
      <p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
    {/if}
  </div>

  <!-- Action Bar -->
  <div class="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg flex items-center justify-end gap-3">
    {#if saveStatus === 'saved'}
      <span class="text-sm text-green-600 dark:text-green-400" role="status">Saved!</span>
    {:else if saveStatus === 'error'}
      <span class="text-sm text-red-600 dark:text-red-400" role="alert">Save failed</span>
    {/if}
    {#if mode === 'edit' && isDirty}
      <button
        type="button"
        onclick={handleRevert}
        class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md
               hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
      >
        Revert Changes
      </button>
    {/if}
    <button
      type="button"
      onclick={oncancel}
      class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md
             hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-colors"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={handleSave}
      disabled={saveStatus === 'saving'}
      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md
             hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
             disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {#if saveStatus === 'saving'}
        Saving...
      {:else if mode === 'add'}
        Add Domain
      {:else}
        Save Changes
      {/if}
    </button>
  </div>
</div>
