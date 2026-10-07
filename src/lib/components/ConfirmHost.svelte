<script>
	// @ts-nocheck
	import { confirmState } from '$lib/confirm.js';
	import Modal from './Modal.svelte';

	const settle = (value) => {
		$confirmState?.resolve(value);
		confirmState.set(null);
	};
</script>

<Modal open={Boolean($confirmState)} title={$confirmState?.title || ''} width="440px" on:close={() => settle(false)}>
	{#if $confirmState?.message}<p class="muted">{$confirmState.message}</p>{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => settle(false)}>Cancel</button>
		<button class="btn {$confirmState?.danger ? 'btn-danger' : 'btn-primary'}" type="button" on:click={() => settle(true)} data-autofocus>
			{$confirmState?.confirmLabel || 'Confirm'}
		</button>
	</svelte:fragment>
</Modal>
