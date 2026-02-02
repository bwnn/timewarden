<script lang="ts">
  type Range = '7d' | '14d' | '30d';

  interface Props {
    value: Range;
    onchange: (range: Range) => void;
  }

  let { value, onchange }: Props = $props();

  const options: { label: string; value: Range }[] = [
    { label: '7 days', value: '7d' },
    { label: '14 days', value: '14d' },
    { label: '30 days', value: '30d' },
  ];
</script>

<div class="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5" role="radiogroup" aria-label="Date range">
  {#each options as opt}
    <button
      type="button"
      role="radio"
      aria-checked={value === opt.value}
      class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {value === opt.value
        ? 'bg-blue-500 text-white shadow-sm'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'}"
      onclick={() => onchange(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>
