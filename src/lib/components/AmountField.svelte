<script>
	import { amountInWords } from '$lib/format.js';

	export let id;
	/** @type {number | string | undefined} */
	export let value;
	export let min = 0;
	/** @type {number | 'any'} */
	export let step = 'any';
	export let required = false;

	/** @type {HTMLInputElement} */
	let input;
	$: words = amountInWords(value);

	/** @param {number} unit */
	const scale = (unit) => {
		const amount = Number(value);
		const scaled = Math.round(amount * unit * 100) / 100;
		if (amount > 0 && Number.isFinite(scaled)) value = scaled;
		input.focus();
	};

	/** @param {KeyboardEvent} event */
	const onAmountKey = (event) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const key = event.key.toLowerCase();
		if (key !== 't' && key !== 'l') return;
		event.preventDefault();
		if (!event.repeat) scale(key === 't' ? 1000 : 100000);
	};
</script>

<div class="field">
	<label class="label" for={id}>Amount <span class="req">*</span></label>
	<div class="amount-row">
		<span class="currency" aria-hidden="true">₹</span>
		<input class="input" {id} type="number" inputmode="decimal" {min} {step} {required}
			placeholder="0" bind:value bind:this={input} on:keydown={onAmountKey} aria-describedby="{id}-hint" />
		<button class="btn btn-sm" type="button" aria-label="T · Thousand" title="Multiply by 1,000" on:click={() => scale(1000)}>T</button>
		<button class="btn btn-sm" type="button" aria-label="L · Lakh" title="Multiply by 1,00,000" on:click={() => scale(100000)}>L</button>
	</div>
	<span id="{id}-hint" class="hint">{words ? `₹ ${words}` : 'T for thousand · L for lakh'}</span>
</div>

<style>
	.amount-row { position: relative; display: flex; align-items: center; gap: 5px; }
	.amount-row .input { min-width: 0; padding-inline-start: 25px; }
	.amount-row .btn { flex: none; min-width: 32px; height: 38px; padding: 0 6px; }
	.currency { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
</style>
