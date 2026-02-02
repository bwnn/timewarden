<script lang="ts">
  interface Props {
    value: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
  }

  let { value, disabled = false, onchange }: Props = $props();
</script>

<input
  type="time"
  {value}
  {disabled}
  onchange={(e) => onchange?.((e.target as HTMLInputElement).value)}
  class="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm shadow-sm
         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none
         disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
/>
