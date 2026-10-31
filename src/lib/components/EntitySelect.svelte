<script>
	// @ts-nocheck
	import { createEventDispatcher, tick } from 'svelte';
	import { initials, labelize } from '$lib/format.js';
	import Icon from './Icon.svelte';

	/** entities: [{ id, name, entity_type, entity_code, comments }]; value: selected entity id (string). */
	export let entities = [];
	export let value = '';
	export let id = undefined;
	export let placeholder = 'Select entity…';
	export let emptyLabel = 'No entities to show.';

	const dispatch = createEventDispatcher();
	let open = false;
	let query = '';
	let active = 0;
	let root;
	let searchInput;
	let listEl;

	$: selected = entities.find((entity) => String(entity.id) === String(value)) || null;
	$: needle = query.trim().toLowerCase();
	$: filtered = needle
		? entities.filter((entity) =>
				`${entity.name} ${entity.comments || ''} ${entity.entity_code || ''} ${labelize(entity.entity_type)}`.toLowerCase().includes(needle)
			)
		: entities;
	$: if (active >= filtered.length) active = Math.max(0, filtered.length - 1);

	const setOpen = async (next) => {
		open = next;
		if (!open) return;
		query = '';
		active = Math.max(0, entities.findIndex((entity) => String(entity.id) === String(value)));
		await tick();
		searchInput?.focus();
		scrollActive();
	};

	const scrollActive = () => listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });

	const choose = (entity) => {
		value = String(entity.id);
		open = false;
		dispatch('change', value);
	};

	const onKeydown = async (event) => {
		if (!open) return;
		if (event.key === 'Escape') {
			event.stopPropagation();
			open = false;
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (filtered.length === 0) return;
			active = (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
			await tick();
			scrollActive();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (filtered[active]) choose(filtered[active]);
		}
	};

	const onWindowClick = (event) => {
		if (open && root && !root.contains(event.target)) open = false;
	};
</script>

<svelte:window on:mousedown={onWindowClick} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="es" bind:this={root} on:keydown={onKeydown}>
	<button {id} type="button" class="trigger select" class:placeholder={!selected} aria-haspopup="listbox" aria-expanded={open} on:click={() => setOpen(!open)}>
		{#if selected}
			<span class="summary">{selected.name}</span>
			<span class="code">{selected.entity_code}</span>
		{:else}
			<span class="summary">{placeholder}</span>
		{/if}
	</button>
	{#if open}
		<div class="menu">
			<div class="search">
				<Icon name="search" size={14} />
				<input bind:this={searchInput} bind:value={query} placeholder="Search name, details or type…" aria-label="Search entities" />
			</div>
			<div class="list" role="listbox" bind:this={listEl}>
				{#each filtered as entity, index (entity.id)}
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div
						class="option"
						class:current={String(entity.id) === String(value)}
						class:active={index === active}
						data-active={index === active}
						role="option"
						aria-selected={String(entity.id) === String(value)}
						tabindex="-1"
						on:mouseenter={() => (active = index)}
						on:click={() => choose(entity)}
					>
						<span class="avatar-mark" aria-hidden="true">{initials(entity.name)}</span>
						<span class="body">
							<span class="name">{entity.name}</span>
							{#if entity.comments}<span class="sub">{entity.comments}</span>{/if}
						</span>
						<span class="meta">
							<span class="badge">{labelize(entity.entity_type)}</span>
							{#if String(entity.id) === String(value)}<Icon name="check" size={14} stroke={2.25} />{/if}
						</span>
					</div>
				{:else}
					<p class="none">{entities.length === 0 ? emptyLabel : 'No matches.'}</p>
				{/each}
			</div>
			<div class="foot">{filtered.length} of {entities.length} {entities.length === 1 ? 'entity' : 'entities'} · ↑↓ to move, Enter to pick</div>
		</div>
	{/if}
</div>

<style>
	.es {
		position: relative;
		min-width: 0;
	}
	.trigger {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		cursor: pointer;
	}
	.trigger.placeholder {
		color: var(--subtle);
	}
	.summary {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.code {
		flex: none;
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		min-width: 100%;
		width: max-content;
		max-width: min(480px, 92vw);
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
		padding: 9px 12px;
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
		max-height: 320px;
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
	.option.active {
		background: var(--surface-3);
	}
	.option.current .name {
		color: var(--accent);
	}
	.avatar-mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 11px;
		font-weight: 700;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
	}
	.name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		font-size: 12.5px;
		line-height: 1.35;
		color: var(--muted);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--accent);
	}
	.none {
		padding: 14px 12px;
		color: var(--muted);
	}
	.foot {
		padding: 6px 12px;
		border-top: 1px solid var(--border);
		font-size: 11.5px;
		color: var(--muted);
	}
</style>
