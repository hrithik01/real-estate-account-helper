<script>
	// @ts-nocheck
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	/** options: [{ value, label, hint? }]; value: array of selected values (strings). */
	export let options = [];
	export let value = [];
	export let placeholder = 'Select…';
	export let emptyLabel = 'Nothing to choose from yet.';
	export let id = undefined;

	const dispatch = createEventDispatcher();
	let open = false;
	let query = '';
	let root;
	let searchInput;

	$: selected = (value || []).map(String);
	$: selectedOptions = options.filter((option) => selected.includes(String(option.value)));
	$: filtered = query
		? options.filter((option) => `${option.label} ${option.hint || ''}`.toLowerCase().includes(query.toLowerCase()))
		: options;
	$: summary =
		selectedOptions.length === 0
			? placeholder
			: selectedOptions.length <= 2
				? selectedOptions.map((option) => option.label).join(', ')
				: `${selectedOptions[0].label} +${selectedOptions.length - 1} more`;

	const toggle = (optionValue) => {
		const key = String(optionValue);
		value = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
		dispatch('change', value);
	};

	const clear = () => {
		value = [];
		dispatch('change', value);
	};

	const setOpen = (next) => {
		open = next;
		if (open) {
			query = '';
			setTimeout(() => searchInput?.focus(), 0);
		}
	};

	const onWindowClick = (event) => {
		if (open && root && !root.contains(event.target)) open = false;
	};
	const onKeydown = (event) => {
		if (open && event.key === 'Escape') {
			event.stopPropagation();
			open = false;
		}
	};
</script>

<svelte:window on:mousedown={onWindowClick} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="ms" bind:this={root} on:keydown={onKeydown}>
	<button {id} type="button" class="trigger select" class:placeholder={selectedOptions.length === 0} aria-haspopup="listbox" aria-expanded={open} on:click={() => setOpen(!open)}>
		<span class="summary">{summary}</span>
	</button>
	{#if open}
		<div class="menu" role="listbox" aria-multiselectable="true">
			{#if options.length > 6}
				<div class="search">
					<Icon name="search" size={14} />
					<input bind:this={searchInput} bind:value={query} placeholder="Search…" aria-label="Search options" />
				</div>
			{/if}
			<div class="list">
				{#each filtered as option (option.value)}
					<label class="option">
						<input type="checkbox" checked={selected.includes(String(option.value))} on:change={() => toggle(option.value)} />
						<span class="label">{option.label}</span>
						{#if option.hint}<span class="hint">{option.hint}</span>{/if}
					</label>
				{:else}
					<p class="none">{options.length === 0 ? emptyLabel : 'No matches.'}</p>
				{/each}
			</div>
			{#if selectedOptions.length > 0}
				<div class="foot">
					<span>{selectedOptions.length} selected</span>
					<button type="button" class="btn btn-ghost btn-sm" on:click={clear}>Clear</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ms {
		position: relative;
		min-width: 0;
	}
	.trigger {
		text-align: left;
		cursor: pointer;
	}
	.trigger.placeholder {
		color: var(--subtle);
	}
	.summary {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		min-width: 100%;
		width: max-content;
		max-width: min(360px, 90vw);
		z-index: 50;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		color: var(--muted);
	}
	.search input {
		border: 0;
		outline: 0;
		background: transparent;
		width: 100%;
		color: var(--text);
	}
	.list {
		max-height: 260px;
		overflow-y: auto;
		padding: 4px;
	}
	.option {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		cursor: pointer;
		color: var(--text);
	}
	.option:hover {
		background: var(--surface-2);
	}
	.label {
		flex: 1;
	}
	.hint {
		font-size: 12px;
		color: var(--muted);
	}
	.none {
		padding: 12px;
		color: var(--muted);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 4px 4px 12px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--muted);
	}
</style>
