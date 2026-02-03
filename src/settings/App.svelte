<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import {
    getDashboardData,
    removeDomain as removeDomainMsg,
    saveDomainConfig as saveDomainConfigMsg,
    saveGlobalSettings as saveGlobalSettingsMsg,
} from '$lib/messaging';
import { applyTheme, initTheme } from '$lib/theme';
import type {
    DailyUsage,
    DayOfWeek,
    DomainConfig,
    GlobalSettings as GlobalSettingsType,
} from '$lib/types';
import { getCurrentPeriodDate } from '$lib/utils';
import ConfirmDialog from './components/ConfirmDialog.svelte';
import DestructiveConfirmDialog from './components/DestructiveConfirmDialog.svelte';
import DomainCard from './components/DomainCard.svelte';
import DomainConfigEditor from './components/DomainConfigEditor.svelte';
import GlobalSettingsComp from './components/GlobalSettings.svelte';

// -- State ---------------------------------------------------------

let domains = $state<DomainConfig[]>([]);
let settings = $state<GlobalSettingsType>({
    resetTime: '00:00',
    notificationsEnabled: true,
    gracePeriodSeconds: 60,
    theme: 'system',
    notificationRules: [],
});
let usageData = $state<DailyUsage[]>([]);
let loading = $state(true);
let loadError = $state('');
let cleanupTheme: (() => void) | null = null;

// UI state
let showAddForm = $state(false);
let selectedDomain = $state<string | null>(null);
let showDeleteConfirm = $state(false);
let deletingDomain = $state<string | null>(null);
let showDestructiveToggle = $state(false);
let destructiveToggleDomain = $state<string | null>(null);

// -- Derived -------------------------------------------------------

let existingDomains = $derived(domains.map((d) => d.domain));

// Lock detection: determine if the current period has started for the selected domain
let lockedDay = $derived.by((): DayOfWeek | null => {
    if (!selectedDomain) return null;

    const originalConfig = domains.find((d) => d.domain === selectedDomain);
    if (!originalConfig) return null;

    const periodDate = getCurrentPeriodDate(originalConfig, settings.resetTime);
    const daily = usageData.find((u) => u.date === periodDate);
    const domainUsage = daily?.domains.find((d) => d.domain === selectedDomain);

    if (!domainUsage) return null;

    const parts = periodDate.split('-').map(Number);
    const periodDateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return String(periodDateObj.getDay()) as DayOfWeek;
});

// Session-active lock: checks if a DomainUsage entry exists for the current period
function isDomainLocked(domain: string): boolean {
    const config = domains.find((d) => d.domain === domain);
    if (!config) return false;
    const periodDate = getCurrentPeriodDate(config, settings.resetTime);
    const daily = usageData.find((u) => u.date === periodDate);
    return daily?.domains.some((d) => d.domain === domain) ?? false;
}

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
        applyTheme(newSettings.theme);
    } catch (e) {
        console.error('[TimeWarden] Failed to save global settings:', e);
    }
}

// -- Handlers: Domain Selection ------------------------------------

function handleSelectDomain(domain: string) {
    if (selectedDomain === domain) {
        selectedDomain = null;
    } else {
        selectedDomain = domain;
        showAddForm = false;
    }
}

async function handleToggleDomain(domain: string, enabled: boolean) {
    // If disabling a domain with an active session, require destructive confirmation
    if (!enabled && isDomainLocked(domain)) {
        destructiveToggleDomain = domain;
        showDestructiveToggle = true;
        return;
    }
    await doToggleDomain(domain, enabled);
}

async function doToggleDomain(domain: string, enabled: boolean) {
    const config = domains.find((d) => d.domain === domain);
    if (!config) return;

    const updated = { ...$state.snapshot(config), enabled } as DomainConfig;
    try {
        await saveDomainConfigMsg(updated);
        domains = domains.map((d) => (d.domain === domain ? updated : d));
    } catch (e) {
        console.error('[TimeWarden] Failed to toggle domain:', e);
    }
}

function handleDestructiveToggleConfirm() {
    if (destructiveToggleDomain) {
        doToggleDomain(destructiveToggleDomain, false);
    }
    showDestructiveToggle = false;
    destructiveToggleDomain = null;
}

// -- Handlers: Add / Save / Delete ---------------------------------

async function handleAddDomain(config: DomainConfig) {
    await saveDomainConfigMsg(config);
    domains = [...domains, config];
    showAddForm = false;
}

async function handleSaveEdit(config: DomainConfig) {
    // Preserve the canonical enabled state from the domains array
    // (the toggle switch may have changed it while the editor was open)
    const currentDomain = domains.find((d) => d.domain === config.domain);
    const toSave = { ...config, enabled: currentDomain?.enabled ?? config.enabled };
    await saveDomainConfigMsg(toSave);
    domains = domains.map((d) => (d.domain === toSave.domain ? toSave : d));
}

function handleShowAdd() {
    showAddForm = true;
    selectedDomain = null;
}

function handleInlineDelete(domain: string) {
    deletingDomain = domain;
    showDeleteConfirm = true;
}

async function handleDeleteDomain() {
    const domain = deletingDomain;
    if (!domain) return;
    try {
        await removeDomainMsg(domain);
        domains = domains.filter((d) => d.domain !== domain);
        if (selectedDomain === domain) {
            selectedDomain = null;
        }
        showDeleteConfirm = false;
        deletingDomain = null;
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
              <DomainConfigEditor
                mode="add"
                {existingDomains}
                globalResetTime={settings.resetTime}
                onsave={handleAddDomain}
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
                <div role="listitem">
                  <DomainCard
                    {config}
                    isSelected={selectedDomain === config.domain}
                    ontoggle={handleToggleDomain}
                    onselect={handleSelectDomain}
                    ondelete={handleInlineDelete}
                  />

                  <!-- Inline edit panel -->
                  {#if selectedDomain === config.domain}
                    <DomainConfigEditor
                      mode="edit"
                      initialConfig={config}
                      globalResetTime={settings.resetTime}
                      {lockedDay}
                      onsave={handleSaveEdit}
                      oncancel={() => { selectedDomain = null; }}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</div>

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Domain"
  message={`Are you sure you want to delete "${deletingDomain}"? This will remove all settings for this domain. Usage history will be preserved.`}
  confirmLabel="Delete"
  onconfirm={handleDeleteDomain}
  oncancel={() => { showDeleteConfirm = false; deletingDomain = null; }}
/>

<!-- Destructive Toggle Confirmation Dialog -->
<DestructiveConfirmDialog
  open={showDestructiveToggle}
  title="Disable Active Domain"
  message={`"${destructiveToggleDomain}" has active usage this period. Disabling it will stop all tracking immediately.`}
  confirmText={destructiveToggleDomain ?? ''}
  confirmLabel="Disable"
  onconfirm={handleDestructiveToggleConfirm}
  oncancel={() => { showDestructiveToggle = false; destructiveToggleDomain = null; }}
/>
