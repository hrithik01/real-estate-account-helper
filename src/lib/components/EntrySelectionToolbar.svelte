<script>
	import { formatINR } from '$lib/format.js';

	/** @type {ReturnType<typeof import('$lib/entry-selection.js').createEntrySelection>} */
	export let selection;
	export let rowCount = 0;
	export let disabled = false;
	export let totalLabel = 'Selected total';

	/** @type {HTMLButtonElement} */
	let selectButton;
	const finish = () => {
		selection.close();
		selectButton.focus();
	};
</script>

<div class="selection-toolbar no-print">
	<div class="page-actions">
		<button class="btn btn-sm" type="button" title="Select all visible entries" bind:this={selectButton}
			disabled={disabled || rowCount === 0} on:click={() => selection.selectAll()}>
			Select all
		</button>
		{#if $selection.active}
			<button class="btn btn-sm btn-ghost" type="button" on:click={() => selection.selectAll(false)}>Uncheck all</button>
			<button class="btn btn-sm btn-ghost" type="button" on:click={finish}>Done</button>
		{/if}
	</div>
	<div class="selection-summary" role="status">
		{#if $selection.active}
			<span class="muted">{$selection.ids.size.toLocaleString('en-IN')} selected</span>
			<span>{totalLabel} <strong class="amount">{formatINR($selection.total)}</strong></span>
		{/if}
	</div>
</div>

<style>
	.selection-toolbar {
		align-items: center;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		justify-content: space-between;
		padding: 10px 20px;
	}
	.selection-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 13px;
	}
</style>
