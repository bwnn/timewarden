<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type {
    DomainConfig,
    GlobalSettings as GlobalSettingsType,
    DailyUsage,
    DayOfWeek,
    DayOverride,
  } from '$lib/types';
  import {
    getDashboardData,
    saveDomainConfig as saveDomainConfigMsg,
    removeDomain as removeDomainMsg,
    saveGlobalSettings as saveGlobalSettingsMsg,
  } from '$lib/messaging';
  import { formatLimitSeconds, getCurrentPeriodDate } from '$lib/utils';
  import { MIN_LIMIT_SECONDS, MAX_LIMIT_SECONDS } from '$lib/constants';
  import { initTheme, applyTheme } from '$lib/theme';
  import GlobalSettingsComp from './components/GlobalSettings.svelte';
  import DomainCard from './components/DomainCard.svelte';
  import DomainForm from './components/DomainForm.svelte';
  import DayOverrideGrid from './components/DayOverrideGrid.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import TimePicker from './components/TimePicker.svelte';

  // -- State ---------------------------------------------------------

  let domains = $state<DomainConfig[]>([]);
  let settings = $state<GlobalSettingsType>({
    resetTime: '00:00',
    notificationsEnabled: true,
    gracePeriodSeconds: 60,
    theme: 'system',
  });
  let usageData = $state<DailyUsage[]>([]);
  let loading = $state(true);
  let loadError = $state('');
  let cleanupTheme: (() => void) | null = null;

  // UI state
  let showAddForm = $state(false);
  let selectedDomain = $state<string | null>(null);
  let editConfig = $state<DomainConfig | null>(null);
  let originalEditConfig = $state<DomainConfig | null>(null);
  let showDeleteConfirm = $state(false);
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // -- Derived -------------------------------------------------------

  let existingDomains = $derived(domains.map((d) => d.domain));

  let editLimitHours = $derived(
    editConfig ? Math.floor(editConfig.dailyLimitSeconds / 3600) : 0
  );
  let editLimitMinutes = $derived(
    editConfig ? Math.floor((editConfig.dailyLimitSeconds % 3600) / 60) : 0
  );
  let editLimitSeconds = $derived(
    editConfig ? editConfig.dailyLimitSeconds % 60 : 0
  );

  let editUseCustomReset = $derived(
    editConfig !== null && editConfig.resetTime !== null
  );

  let editEffectiveResetTime = $derived(
    editConfig?.resetTime ?? settings.resetTime
  );

  let isDirty = $derived(
    editConfig && originalEditConfig
      ? JSON.stringify($state.snapshot(editConfig)) !== JSON.stringify($state.snapshot(originalEditConfig))
      : false
  );

  // Lock detection: determine if the current period has started for the selected domain
  let lockedDay = $derived.by((): DayOfWeek | null => {
    if (!selectedDomain) return null;

    // Use the ORIGINAL saved config, not the edit copy
    const originalConfig = domains.find((d) => d.domain === selectedDomain);
    if (!originalConfig) return null;

    const periodDate = getCurrentPeriodDate(originalConfig, settings.resetTime);
    const daily = usageData.find((u) => u.date === periodDate);
    const domainUsage = daily?.domains.find((d) => d.domain === selectedDomain);

    if (!domainUsage) return null;

    // Determine the day of week of the period start date
    const parts = periodDate.split('-').map(Number);
    const periodDateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return String(periodDateObj.getDay()) as DayOfWeek;
  });

  // -- Data Loading --------------------------------------------------

  onMount(async () => {
    await loadData();
  });

  onDestroy(() => {
    if (cleanupTheme) cleanupTheme();
  });

  async function loadData() {
    try {
      loading = true;
      loadError = '';
      const data = await getDashboardData('30d');
      domains = data.domains;
      settings = data.settings;
      usageData = data.usage;

      // Initialize theme from settings
      if (!cleanupTheme) {
        cleanupTheme = initTheme(settings.theme);
      } else {
        applyTheme(settings.theme);
      }
    } catch (e) {
      loadError = 'Failed to load settings. Please try refreshing the page.';
      console.error('[TimeWarden] Failed to load settings:', e);
      if (!cleanupTheme) {
        cleanupTheme = initTheme('system');
      }
    } finally {
      loading = false;
    }
  }

  // -- Handlers: Global Settings -------------------------------------

  async function handleSaveGlobalSettings(newSettings: GlobalSettingsType) {
    try {
      await saveGlobalSettingsMsg(newSettings);
      settings = newSettings;
      // Apply the new theme immediately
      applyTheme(newSettings.theme);
    } catch (e) {
      console.error('[TimeWarden] Failed to save global settings:', e);
    }
  }

  // -- Handlers: Domain Selection & Edit -----------------------------

  function handleSelectDomain(domain: string) {
    if (selectedDomain === domain) {
      // Deselect
      selectedDomain = null;
      editConfig = null;
      originalEditConfig = null;
      saveStatus = 'idle';
    } else {
      selectedDomain = domain;
      const config = domains.find((d) => d.domain === domain);
      if (config) {
        editConfig = $state.snapshot(config) as DomainConfig;
        originalEditConfig = $state.snapshot(config) as DomainConfig;
      }
      showAddForm = false;
      saveStatus = 'idle';
    }
  }

  async function handleToggleDomain(domain: string, enabled: boolean) {
    const config = domains.find((d) => d.domain === domain);
    if (!config) return;

    const updated = { ...$state.snapshot(config), enabled } as DomainConfig;
    try {
      await saveDomainConfigMsg(updated);
      domains = domains.map((d) => (d.domain === domain ? updated : d));
      if (editConfig?.domain === domain) {
        editConfig = { ...editConfig, enabled };
      }
    } catch (e) {
      console.error('[TimeWarden] Failed to toggle domain:', e);
    }
  }

  // -- Handlers: Add Domain ------------------------------------------

  async function handleAddDomain(config: DomainConfig) {
    try {
      await saveDomainConfigMsg(config);
      domains = [...domains, config];
      showAddForm = false;
    } catch (e) {
      console.error('[TimeWarden] Failed to add domain:', e);
    }
  }

  function handleShowAdd() {
    showAddForm = true;
    selectedDomain = null;
    editConfig = null;
    saveStatus = 'idle';
  }

  // -- Handlers: Edit Fields -----------------------------------------

  function handleEditLimitChange(newHours: number, newMins: number, newSecs: number) {
    if (!editConfig) return;
    const total = Math.max(
      MIN_LIMIT_SECONDS,
      Math.min(MAX_LIMIT_SECONDS, newHours * 3600 + newMins * 60 + newSecs)
    );
    editConfig = { ...editConfig, dailyLimitSeconds: total };
  }

  function handleEditResetToggle(useCustom: boolean) {
    if (!editConfig) return;
    editConfig = {
      ...editConfig,
      resetTime: useCustom ? settings.resetTime : null,
    };
  }

  function handleEditResetChange(time: string) {
    if (!editConfig) return;
    editConfig = { ...editConfig, resetTime: time };
  }

  function handleEditPauseChange(value: number) {
    if (!editConfig) return;
    editConfig = {
      ...editConfig,
      pauseAllowanceSeconds: Math.max(0, Math.min(3600, value)),
    };
  }

  function handleDayOverridesChange(
    overrides: Partial<Record<DayOfWeek, DayOverride>>
  ) {
    if (!editConfig) return;
    editConfig = { ...editConfig, dayOverrides: overrides };
  }

  // -- Handlers: Save / Cancel / Delete ------------------------------

  async function handleSaveEdit() {
    if (!editConfig) return;
    try {
      saveStatus = 'saving';
      const snapshot = $state.snapshot(editConfig) as DomainConfig;
      await saveDomainConfigMsg(snapshot);
      domains = domains.map((d) =>
        d.domain === snapshot.domain ? snapshot : d
      );
      originalEditConfig = $state.snapshot(editConfig) as DomainConfig;
      saveStatus = 'saved';
      setTimeout(() => {
        if (saveStatus === 'saved') saveStatus = 'idle';
      }, 2000);
    } catch (e) {
      saveStatus = 'error';
      console.error('[TimeWarden] Failed to save domain config:', e);
    }
  }

  function handleCancelEdit() {
    selectedDomain = null;
    editConfig = null;
    originalEditConfig = null;
    saveStatus = 'idle';
  }

  function handleRevertEdit() {
    if (originalEditConfig) {
      editConfig = $state.snapshot(originalEditConfig) as DomainConfig;
    }
  }

  async function handleDeleteDomain() {
    if (!selectedDomain) return;
    try {
      await removeDomainMsg(selectedDomain);
      domains = domains.filter((d) => d.domain !== selectedDomain);
      selectedDomain = null;
      editConfig = null;
      originalEditConfig = null;
      showDeleteConfirm = false;
      saveStatus = 'idle';
    } catch (e) {
      console.error('[TimeWarden] Failed to delete domain:', e);
    }
  }
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <div class="max-w-2xl mx-auto px-4 py-8">
    <!-- Header -->
    <header class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">TimeWarden Settings</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure time limits for websites</p>
    </header>

    {#if loading}
      <div class="text-center py-12" role="status" aria-label="Loading">
        <p class="text-gray-500 dark:text-gray-400">Loading settings...</p>
      </div>
    {:else if loadError}
      <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4" role="alert">
        <p class="text-sm text-red-700 dark:text-red-400">{loadError}</p>
        <button
          type="button"
          onclick={loadData}
          class="mt-2 text-sm text-red-600 dark:text-red-400 underline hover:text-red-800 dark:hover:text-red-300"
        >
          Try again
        </button>
      </div>
    {:else}
      <div class="space-y-8">
        <!-- Global Settings -->
        <GlobalSettingsComp {settings} onsave={handleSaveGlobalSettings} />

        <!-- Tracked Domains -->
        <section aria-label="Tracked Domains">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Tracked Domains</h2>
            {#if !showAddForm}
              <button
                type="button"
                onclick={handleShowAdd}
                class="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400
                       bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              >
                <span class="text-lg leading-none">+</span> Add Domain
              </button>
            {/if}
          </div>

          <!-- Add Domain Form -->
          {#if showAddForm}
            <div class="mb-4">
              <DomainForm
                {existingDomains}
                onsubmit={handleAddDomain}
                oncancel={() => (showAddForm = false)}
              />
            </div>
          {/if}

          <!-- Domain List -->
          {#if domains.length === 0 && !showAddForm}
            <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
              <p class="text-gray-500 dark:text-gray-400 text-sm">No domains being tracked yet.</p>
              <p class="text-gray-400 dark:text-gray-500 text-xs mt-1">Click "Add Domain" to start tracking a website.</p>
            </div>
          {:else}
            <div class="space-y-2" role="list" aria-label="Configured domains">
              {#each domains as config (config.domain)}
                <DomainCard
                  {config}
                  isSelected={selectedDomain === config.domain}
                  ontoggle={handleToggleDomain}
                  onselect={handleSelectDomain}
                />
              {/each}
            </div>
          {/if}
        </section>

        <!-- Domain Edit Panel -->
        {#if editConfig && selectedDomain}
          <section class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm" aria-label="Edit domain: {editConfig.domain}">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Editing: <span class="text-blue-600 dark:text-blue-400">{editConfig.domain}</span>
              </h2>
            </div>

            <div class="p-6 space-y-6">
              <!-- Default Daily Limit -->
              <div>
                <span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Default Daily Limit</span>
                <div class="flex items-center gap-2">
                  <label class="sr-only" for="edit-limit-hours">Hours</label>
                  <input
                    id="edit-limit-hours"
                    type="number"
                    value={editLimitHours}
                    min="0"
                    max="24"
                    onchange={(e) =>
                      handleEditLimitChange(
                        parseInt((e.target as HTMLInputElement).value) || 0,
                        editLimitMinutes,
                        editLimitSeconds
                      )}
                    class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <span class="text-sm text-gray-500 dark:text-gray-400">h</span>
                  <label class="sr-only" for="edit-limit-minutes">Minutes</label>
                  <input
                    id="edit-limit-minutes"
                    type="number"
                    value={editLimitMinutes}
                    min="0"
                    max="59"
                    onchange={(e) =>
                      handleEditLimitChange(
                        editLimitHours,
                        parseInt((e.target as HTMLInputElement).value) || 0,
                        editLimitSeconds
                      )}
                    class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <span class="text-sm text-gray-500 dark:text-gray-400">m</span>
                  <label class="sr-only" for="edit-limit-seconds">Seconds</label>
                  <input
                    id="edit-limit-seconds"
                    type="number"
                    value={editLimitSeconds}
                    min="0"
                    max="59"
                    onchange={(e) =>
                      handleEditLimitChange(
                        editLimitHours,
                        editLimitMinutes,
                        parseInt((e.target as HTMLInputElement).value) || 0
                      )}
                    class="w-20 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                           focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <span class="text-sm text-gray-500 dark:text-gray-400">s</span>
                  <span class="text-xs text-gray-400 dark:text-gray-500 ml-2">
                    ({formatLimitSeconds(editConfig.dailyLimitSeconds)})
                  </span>
                </div>
              </div>

              <!-- Domain Reset Time -->
              <fieldset>
                <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reset Time</legend>
                <div class="space-y-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="reset-mode"
                      checked={!editUseCustomReset}
                      onchange={() => handleEditResetToggle(false)}
                      class="text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-sm text-gray-700 dark:text-gray-300">
                      Use global default
                      <span class="text-gray-400 dark:text-gray-500">({settings.resetTime})</span>
                    </span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="reset-mode"
                      checked={editUseCustomReset}
                      onchange={() => handleEditResetToggle(true)}
                      class="text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-sm text-gray-700 dark:text-gray-300">Custom reset time</span>
                  </label>
                  {#if editUseCustomReset}
                    <div class="ml-6 w-28">
                      <TimePicker
                        value={editConfig.resetTime ?? settings.resetTime}
                        onchange={handleEditResetChange}
                      />
                    </div>
                  {/if}
                </div>
              </fieldset>

              <!-- Pause Allowance -->
              <div>
                <label for="edit-pause" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pause Allowance</label>
                <div class="flex items-center gap-2">
                  <input
                    id="edit-pause"
                    type="number"
                    value={Math.floor(editConfig.pauseAllowanceSeconds / 60)}
                    min="0"
                    max="60"
                    onchange={(e) =>
                      handleEditPauseChange(
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
                  dayOverrides={editConfig.dayOverrides}
                  defaultLimitSeconds={editConfig.dailyLimitSeconds}
                  defaultResetTime={editEffectiveResetTime}
                  {lockedDay}
                  onchange={handleDayOverridesChange}
                />
              </div>
            </div>

            <!-- Action bar -->
            <div class="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 rounded-b-lg flex items-center justify-between">
              <button
                type="button"
                onclick={() => (showDeleteConfirm = true)}
                class="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              >
                Delete Domain
              </button>
              <div class="flex items-center gap-3">
                {#if saveStatus === 'saved'}
                  <span class="text-sm text-green-600 dark:text-green-400" role="status">Saved!</span>
                {:else if saveStatus === 'error'}
                  <span class="text-sm text-red-600 dark:text-red-400" role="alert">Save failed</span>
                {/if}
                {#if isDirty}
                  <button
                    type="button"
                    onclick={handleRevertEdit}
                    class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    Revert Changes
                  </button>
                {/if}
                <button
                  type="button"
                  onclick={handleCancelEdit}
                  class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onclick={handleSaveEdit}
                  disabled={saveStatus === 'saving'}
                  class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </section>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Domain"
  message={`Are you sure you want to delete "${selectedDomain}"? This will remove all settings for this domain. Usage history will be preserved.`}
  confirmLabel="Delete"
  onconfirm={handleDeleteDomain}
  oncancel={() => (showDeleteConfirm = false)}
/>
