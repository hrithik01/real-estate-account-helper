<script>
	// @ts-nocheck
	import { fly } from 'svelte/transition';
	import { dismissToast, toasts } from '$lib/toast.js';
	import Icon from './Icon.svelte';

	const ICONS = { success: 'check', error: 'alert', info: 'info' };
</script>

<div class="toaster" aria-live="polite">
	{#each $toasts as item (item.id)}
		<div class="toast {item.type}" role={item.type === 'error' ? 'alert' : 'status'} transition:fly={{ y: 12, duration: 160 }}>
			<span class="icon"><Icon name={ICONS[item.type]} size={14} stroke={2.25} /></span>
			<span class="message">{item.message}</span>
			<button type="button" on:click={() => dismissToast(item.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		bottom: 20px;
		right: 20px;
		z-index: 200;
		display: grid;
		gap: 8px;
		width: min(380px, calc(100vw - 32px));
	}
	.toast {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 12px 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		font-size: 13.5px;
	}
	.icon {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 999px;
		flex: none;
		color: #fff;
		background: var(--accent);
	}
	.success .icon {
		background: var(--pos);
	}
	.error .icon {
		background: var(--neg);
	}
	.message {
		flex: 1;
		padding-top: 1px;
		color: var(--text);
	}
	button {
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
	}
	button:hover {
		color: var(--text);
	}
</style>
