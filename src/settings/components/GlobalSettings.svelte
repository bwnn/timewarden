<script lang="ts">
  import type { GlobalSettings } from '$lib/types';
  import TimePicker from './TimePicker.svelte';

  interface Props {
    settings: GlobalSettings;
    onsave: (settings: GlobalSettings) => void;
  }

  let { settings, onsave }: Props = $props();

  // Local editing state — initialized with defaults, synced from prop via $effect
  let resetTime = $state('00:00');
  let notificationsEnabled = $state(true);
  let theme = $state<GlobalSettings['theme']>('system');
  let saving = $state(false);
  let saved = $state(false);

  // Sync local state when prop changes (initial load + after save)
  $effect(() => {
    resetTime = settings.resetTime;
    notificationsEnabled = settings.notificationsEnabled;
    theme = settings.theme;
  });

  let isDirty = $derived(
    resetTime !== settings.resetTime ||
    notificationsEnabled !== settings.notificationsEnabled ||
    theme !== settings.theme
  );

  async function save() {
    saving = true;
    onsave({
      ...settings,
      resetTime,
      notificationsEnabled,
      theme,
    });
    saving = false;
    saved = true;
    setTimeout(() => { saved = false; }, 2000);
  }
</script>

<section class="bg-white border border-gray-200 rounded-lg shadow-sm">
  <div class="px-6 py-4 border-b border-gray-200">
    <h2 class="text-lg font-semibold text-gray-900">General Settings</h2>
  </div>

  <div class="p-6 space-y-5">
    <!-- Default Reset Time -->
    <div class="flex items-center justify-between">
      <div>
        <label for="global-reset-time" class="block text-sm font-medium text-gray-700">
          Default Reset Time
        </label>
        <p class="text-xs text-gray-500 mt-0.5">When daily limits reset for all domains (unless overridden)</p>
      </div>
      <div class="w-28">
        <TimePicker value={resetTime} onchange={(v) => (resetTime = v)} />
      </div>
    </div>

    <!-- Notifications -->
    <div class="flex items-center justify-between">
      <div>
        <label for="notifications-toggle" class="block text-sm font-medium text-gray-700">
          Notifications
        </label>
        <p class="text-xs text-gray-500 mt-0.5">Get notified when time limits are approaching</p>
      </div>
      <label class="relative inline-flex items-center cursor-pointer">
        <input
          id="notifications-toggle"
          type="checkbox"
          bind:checked={notificationsEnabled}
          class="sr-only peer"
        />
        <div class="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600
                    after:content-[''] after:absolute after:top-0.5 after:start-0.5
                    after:bg-white after:rounded-full after:h-4 after:w-4
                    after:transition-all peer-checked:after:translate-x-full
                    peer-focus:ring-2 peer-focus:ring-blue-300"></div>
      </label>
    </div>

    <!-- Theme -->
    <div class="flex items-center justify-between">
      <div>
        <label for="theme-select" class="block text-sm font-medium text-gray-700">
          Theme
        </label>
        <p class="text-xs text-gray-500 mt-0.5">Choose your preferred appearance</p>
      </div>
      <select
        id="theme-select"
        bind:value={theme}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm
               focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  </div>

  <!-- Save bar -->
  {#if isDirty || saved}
    <div class="px-6 py-3 bg-gray-50 border-t border-gray-200 rounded-b-lg flex items-center justify-end gap-3">
      {#if saved}
        <span class="text-sm text-green-600">Settings saved</span>
      {/if}
      {#if isDirty}
        <button
          type="button"
          onclick={save}
          disabled={saving}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md
                 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      {/if}
    </div>
  {/if}
</section>
