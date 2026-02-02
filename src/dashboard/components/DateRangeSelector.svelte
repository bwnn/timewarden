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

<div class="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
  {#each options as opt}
    <button
      type="button"
      class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {value === opt.value
        ? 'bg-blue-500 text-white shadow-sm'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}"
      onclick={() => onchange(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>
