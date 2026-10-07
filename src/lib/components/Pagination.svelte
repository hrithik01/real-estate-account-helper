<script>
	// @ts-nocheck
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	export let page = 1;
	export let totalPages = 1;
	export let totalCount = 0;
	export let pageSize = 100;
	export let disabled = false;

	const dispatch = createEventDispatcher();
	$: from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
	$: to = Math.min(page * pageSize, totalCount);
</script>

<div class="pager">
	<span class="muted">{from}–{to} of {totalCount.toLocaleString('en-IN')}</span>
	<div class="controls">
		<button class="btn btn-sm btn-icon" type="button" aria-label="Previous page" disabled={disabled || page <= 1} on:click={() => dispatch('change', page - 1)}>
			<Icon name="chevronLeft" />
		</button>
		<span class="status">Page {page} of {totalPages}</span>
		<button class="btn btn-sm btn-icon" type="button" aria-label="Next page" disabled={disabled || page >= totalPages} on:click={() => dispatch('change', page + 1)}>
			<Icon name="chevronRight" />
		</button>
	</div>
</div>

<style>
	.pager {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		font-size: 13px;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.status {
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}
</style>
