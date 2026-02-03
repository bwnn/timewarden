<script lang="ts">
import type { NotificationRule } from '$lib/types';

interface Props {
    rules: NotificationRule[];
    onchange: (rules: NotificationRule[]) => void;
}

let { rules, onchange }: Props = $props();

// -- Handlers -------------------------------------------------------

function addRule() {
    const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newRule: NotificationRule = {
        id,
        enabled: true,
        type: 'percentage',
        percentageUsed: 50,
    };
    onchange([...rules, newRule]);
}

function removeRule(id: string) {
    onchange(rules.filter((r) => r.id !== id));
}

function toggleRule(id: string) {
    onchange(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
}

function updateRuleType(id: string, type: 'percentage' | 'time') {
    onchange(
        rules.map((r) => {
            if (r.id !== id) return r;
            if (type === 'percentage') {
                return { ...r, type, percentageUsed: 50, timeRemainingSeconds: undefined };
            }
            return { ...r, type, timeRemainingSeconds: 300, percentageUsed: undefined };
        }),
    );
}

function updateRuleValue(id: string, value: number) {
    onchange(
        rules.map((r) => {
            if (r.id !== id) return r;
            if (r.type === 'percentage') {
                return { ...r, percentageUsed: Math.max(1, Math.min(100, value)) };
            }
            return { ...r, timeRemainingSeconds: Math.max(1, value) };
        }),
    );
}

function toggleCustomMessage(id: string) {
    onchange(
        rules.map((r) => {
            if (r.id !== id) return r;
            // Toggle: if title/message exist, clear them; otherwise set defaults
            if (r.title != null || r.message != null) {
                return { ...r, title: undefined, message: undefined };
            }
            return { ...r, title: 'TimeWarden — Running Low', message: '' };
        }),
    );
}

function updateRuleTitle(id: string, title: string) {
    onchange(rules.map((r) => (r.id === id ? { ...r, title } : r)));
}

function updateRuleMessage(id: string, message: string) {
    onchange(rules.map((r) => (r.id === id ? { ...r, message } : r)));
}

// Format time remaining value for display as M:SS
function formatTimeValue(seconds: number): { minutes: number; secs: number } {
    return {
        minutes: Math.floor(seconds / 60),
        secs: seconds % 60,
    };
}

function parseTimeInputs(minutes: number, secs: number): number {
    return Math.max(1, minutes * 60 + secs);
}

// Describe what a rule does in plain text
function describeRule(rule: NotificationRule): string {
    if (rule.type === 'percentage' && rule.percentageUsed != null) {
        const remaining = 100 - rule.percentageUsed;
        return `Fires when ${remaining}% of daily limit remains`;
    }
    if (rule.type === 'time' && rule.timeRemainingSeconds != null) {
        const mins = Math.floor(rule.timeRemainingSeconds / 60);
        const secs = rule.timeRemainingSeconds % 60;
        if (mins > 0 && secs > 0) return `Fires with ${mins}m ${secs}s remaining`;
        if (mins > 0) return `Fires with ${mins}m remaining`;
        return `Fires with ${secs}s remaining`;
    }
    return '';
}
</script>

<div class="space-y-3">
  {#each rules as rule (rule.id)}
    {@const isDefault = rule.id.startsWith('default-')}
    {@const hasCustomMessage = rule.title != null || rule.message != null}
    <div class="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3 {!rule.enabled ? 'opacity-60' : ''}">
      <!-- Rule header: toggle + type + value + delete -->
      <div class="flex items-center gap-3">
        <!-- Enable/disable toggle -->
        <label class="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={rule.enabled}
            onchange={() => toggleRule(rule.id)}
            class="sr-only peer"
            aria-label="Enable rule"
          />
          <div class="w-8 h-4.5 bg-gray-200 dark:bg-gray-600 rounded-full peer peer-checked:bg-blue-600
                      after:content-[''] after:absolute after:top-0.5 after:start-0.5
                      after:bg-white after:rounded-full after:h-3.5 after:w-3.5
                      after:transition-all peer-checked:after:translate-x-3.5
                      peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800"></div>
        </label>

        <!-- Type selector -->
        <select
          value={rule.type}
          onchange={(e) => updateRuleType(rule.id, (e.target as HTMLSelectElement).value as 'percentage' | 'time')}
          disabled={!rule.enabled}
          class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm shadow-sm
                 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="percentage">% of limit used</option>
          <option value="time">Time remaining</option>
        </select>

        <!-- Value input -->
        {#if rule.type === 'percentage'}
          <div class="flex items-center gap-1">
            <input
              type="number"
              value={rule.percentageUsed ?? 50}
              min="1"
              max="100"
              disabled={!rule.enabled}
              onchange={(e) => updateRuleValue(rule.id, parseInt((e.target as HTMLInputElement).value) || 50)}
              class="w-16 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm shadow-sm
                     focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="text-sm text-gray-500 dark:text-gray-400">%</span>
          </div>
        {:else}
          {@const tv = formatTimeValue(rule.timeRemainingSeconds ?? 300)}
          <div class="flex items-center gap-1">
            <input
              type="number"
              value={tv.minutes}
              min="0"
              disabled={!rule.enabled}
              onchange={(e) => updateRuleValue(
                rule.id,
                parseTimeInputs(parseInt((e.target as HTMLInputElement).value) || 0, tv.secs)
              )}
              class="w-14 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm shadow-sm
                     focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="text-xs text-gray-500 dark:text-gray-400">m</span>
            <input
              type="number"
              value={tv.secs}
              min="0"
              max="59"
              disabled={!rule.enabled}
              onchange={(e) => updateRuleValue(
                rule.id,
                parseTimeInputs(tv.minutes, parseInt((e.target as HTMLInputElement).value) || 0)
              )}
              class="w-14 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm shadow-sm
                     focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none
                     disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span class="text-xs text-gray-500 dark:text-gray-400">s</span>
          </div>
        {/if}

        <div class="flex-1"></div>

        <!-- Custom message toggle -->
        <button
          type="button"
          onclick={() => toggleCustomMessage(rule.id)}
          disabled={!rule.enabled}
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasCustomMessage ? 'Remove custom message' : 'Add custom message'}
          aria-label={hasCustomMessage ? 'Remove custom message' : 'Add custom message'}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            {#if hasCustomMessage}
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            {/if}
          </svg>
        </button>

        <!-- Delete button (not for default rules) -->
        {#if !isDefault}
          <button
            type="button"
            onclick={() => removeRule(rule.id)}
            class="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete rule"
            aria-label="Delete rule"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        {/if}
      </div>

      <!-- Description -->
      <p class="text-xs text-gray-500 dark:text-gray-400 ml-11">{describeRule(rule)}</p>

      <!-- Custom title/message (expanded) -->
      {#if hasCustomMessage && rule.enabled}
        <div class="ml-11 space-y-2">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block">
            <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Title</span>
            <input
              type="text"
              value={rule.title ?? ''}
              placeholder="TimeWarden — Running Low"
              onchange={(e) => updateRuleTitle(rule.id, (e.target as HTMLInputElement).value)}
              class="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm shadow-sm
                     placeholder:text-gray-400 dark:placeholder:text-gray-500
                     focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </label>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="block">
            <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
              Message
              <span class="font-normal text-gray-400 dark:text-gray-500">(use {'{domain}'} for domain name)</span>
            </span>
            <input
              type="text"
              value={rule.message ?? ''}
              placeholder="{'{domain}'}: approaching your daily limit."
              onchange={(e) => updateRuleMessage(rule.id, (e.target as HTMLInputElement).value)}
              class="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-2 py-1 text-sm shadow-sm
                     placeholder:text-gray-400 dark:placeholder:text-gray-500
                     focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </label>
        </div>
      {/if}
    </div>
  {/each}

  <!-- Add rule button -->
  <button
    type="button"
    onclick={addRule}
    class="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400
           bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 border-dashed rounded-md
           hover:bg-gray-50 dark:hover:bg-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
  >
    <span class="text-lg leading-none">+</span> Add Notification Rule
  </button>
</div>
