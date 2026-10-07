<script>
	// @ts-nocheck
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import Icon from './Icon.svelte';

	export let open = false;
	export let title = '';
	export let description = '';
	export let width = '560px';

	const dispatch = createEventDispatcher();
	let panel;
	let previouslyFocused = null;

	const close = () => dispatch('close');

	const onKeydown = (event) => {
		if (!open) return;
		if (event.key === 'Escape') {
			event.stopPropagation();
			close();
		}
		if (event.key === 'Tab' && panel) {
			const focusable = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
				(element) => !element.disabled && element.offsetParent !== null
			);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		}
	};

	const focusFirst = async () => {
		await tick();
		const target = panel?.querySelector('[data-autofocus], input:not([type=checkbox]):not([disabled]), select, textarea, button.btn-primary');
		target?.focus();
	};

	$: if (open) {
		if (typeof document !== 'undefined') previouslyFocused = document.activeElement;
		focusFirst();
	} else if (previouslyFocused) {
		previouslyFocused.focus?.();
		previouslyFocused = null;
	}

	onMount(() => () => previouslyFocused?.focus?.());
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div class="overlay" role="presentation" on:mousedown|self={close}>
		<div class="panel" role="dialog" aria-modal="true" aria-label={title} style="--w: {width}" bind:this={panel}>
			<header>
				<div>
					<h2>{title}</h2>
					{#if description}<p>{description}</p>{/if}
				</div>
				<button class="btn btn-ghost btn-icon" type="button" on:click={close} aria-label="Close">
					<Icon name="x" />
				</button>
			</header>
			<div class="body">
				<slot />
			</div>
			{#if $$slots.footer}
				<footer><slot name="footer" /></footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgba(10, 13, 20, 0.5);
		backdrop-filter: blur(2px);
		display: grid;
		place-items: start center;
		padding: 8vh 16px 16px;
		overflow-y: auto;
		animation: fade 0.12s ease;
	}
	.panel {
		width: min(var(--w), 100%);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: var(--shadow-lg);
		animation: pop 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 18px 20px 0;
	}
	header p {
		color: var(--muted);
		margin-top: 4px;
		font-size: 13px;
	}
	.body {
		padding: 18px 20px 20px;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 14px 20px;
		border-top: 1px solid var(--border);
		background: var(--surface-2);
		border-radius: 0 0 16px 16px;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}
</style>
