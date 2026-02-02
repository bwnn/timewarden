<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { open, title, message, confirmLabel = 'Delete', onconfirm, oncancel }: Props = $props();
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/40"
      onclick={oncancel}
      onkeydown={(e) => { if (e.key === 'Escape') oncancel(); }}
      role="presentation"
    ></div>

    <!-- Dialog -->
    <div class="relative bg-white rounded-lg shadow-xl max-w-sm w-full p-6 z-10" role="dialog" aria-modal="true">
      <h3 class="text-lg font-semibold text-gray-900">{title}</h3>
      <p class="mt-2 text-sm text-gray-600">{message}</p>
      <div class="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onclick={oncancel}
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md
                 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={onconfirm}
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md
                 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
