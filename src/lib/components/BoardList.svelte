<script>
	// @ts-nocheck
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	export let title;
	export let subtitle = '';
	export let placeholder = 'Add item';
	export let emptyText = 'Nothing here yet.';
	export let icon = 'clipboard';
	/** [{ text, done }] */
	export let items = [];

	const dispatch = createEventDispatcher();
	let draft = '';

	$: openCount = items.filter((item) => !item.done).length;

	const add = () => {
		const text = draft.trim();
		if (!text) return;
		dispatch('change', [...items, { text, done: false }]);
		draft = '';
	};
	const toggle = (index) => dispatch('change', items.map((item, i) => (i === index ? { ...item, done: !item.done } : item)));
	const remove = (index) => dispatch('change', items.filter((_, i) => i !== index));
	const clearDone = () => dispatch('change', items.filter((item) => !item.done));
</script>

<section class="card board">
	<div class="card-header">
		<div class="title">
			<span class="board-icon"><Icon name={icon} size={15} /></span>
			<div>
				<h2>{title}</h2>
				{#if subtitle}<p>{subtitle}</p>{/if}
			</div>
		</div>
		<span class="badge">{openCount} open</span>
	</div>
	<form class="add" on:submit|preventDefault={add}>
		<input class="input" bind:value={draft} {placeholder} aria-label={placeholder} />
		<button class="btn btn-icon" type="submit" aria-label="Add" disabled={!draft.trim()}><Icon name="plus" /></button>
	</form>
	<ul>
		{#each items as item, index}
			<li class:done={item.done}>
				<label>
					<input type="checkbox" checked={item.done} on:change={() => toggle(index)} />
					<span>{item.text}</span>
				</label>
				<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Remove {item.text}" on:click={() => remove(index)}>
					<Icon name="x" size={14} />
				</button>
			</li>
		{:else}
			<li class="empty-row">{emptyText}</li>
		{/each}
	</ul>
	{#if items.some((item) => item.done)}
		<div class="foot"><button class="btn btn-ghost btn-sm" type="button" on:click={clearDone}>Clear completed</button></div>
	{/if}
</section>

<style>
	.board {
		display: flex;
		flex-direction: column;
		margin: 0;
	}
	.title {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.board-icon {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.add {
		display: flex;
		gap: 8px;
		padding: 14px 16px 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 6px 8px 10px;
		display: grid;
		gap: 2px;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 8px;
	}
	li:hover {
		background: var(--surface-2);
	}
	label {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		cursor: pointer;
		flex: 1;
		min-width: 0;
		color: var(--text);
	}
	label input {
		margin-top: 2px;
		flex: none;
	}
	label span {
		overflow-wrap: anywhere;
	}
	.done label span {
		text-decoration: line-through;
		color: var(--subtle);
	}
	.empty-row {
		color: var(--muted);
		font-size: 13px;
		padding: 10px 8px;
	}
	.foot {
		margin-top: auto;
		padding: 4px 12px 10px;
		text-align: right;
	}
</style>
