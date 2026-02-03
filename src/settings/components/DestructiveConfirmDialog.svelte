<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmText: string;
    confirmLabel?: string;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    open,
    title,
    message,
    confirmText,
    confirmLabel = 'Confirm',
    onconfirm,
    oncancel,
  }: Props = $props();

  let inputValue = $state('');

  let canConfirm = $derived(inputValue === confirmText);

  // Reset input when dialog opens/closes
  $effect(() => {
    if (open) {
      inputValue = '';
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && canConfirm) {
      onconfirm();
    } else if (e.key === 'Escape') {
      oncancel();
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 bg-black/40 dark:bg-black/60"
      onclick={oncancel}
      role="presentation"
    ></div>

    <!-- Dialog -->
    <div
      class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6 z-10"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="destructive-dialog-title"
      aria-describedby="destructive-dialog-message"
    >
      <!-- Warning icon -->
      <div class="flex items-center gap-3 mb-3">
        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h3 id="destructive-dialog-title" class="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      </div>

      <p id="destructive-dialog-message" class="text-sm text-gray-600 dark:text-gray-400">{message}</p>

      <!-- Confirmation input -->
      <div class="mt-4">
        <label for="destructive-confirm-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Type <span class="font-mono font-bold text-gray-900 dark:text-gray-100">{confirmText}</span> to confirm
        </label>
        <input
          id="destructive-confirm-input"
          type="text"
          bind:value={inputValue}
          onkeydown={handleKeydown}
          placeholder={confirmText}
          autocomplete="off"
          class="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm shadow-sm
                 placeholder:text-gray-400 dark:placeholder:text-gray-500
                 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none"
        />
      </div>

      <div class="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onclick={oncancel}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md
                 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={onconfirm}
          disabled={!canConfirm}
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md
                 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500
                 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
