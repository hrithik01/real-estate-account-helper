<script>
	// @ts-nocheck
	import { PAYOUT_TYPES } from '$lib/constants.js';
	import { amountInWords } from '$lib/format.js';
	import EntitySelect from '$lib/components/EntitySelect.svelte';

	export let value;
	export let entities;
	export let prefix;

	let amountInput;
	$: isPayout = value.entry_type === 'payout';
	$: words = amountInWords(value.amount);

	const scale = (unit) => {
		const amount = Number(value.amount);
		if (amount > 0) value.amount = Math.round(amount * unit * 100) / 100;
		amountInput.focus();
	};

	const onAmountKey = (event) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		const unit = { t: 1000, l: 100000 }[event.key.toLowerCase()];
		if (!unit) return;
		event.preventDefault();
		if (!event.repeat) scale(unit);
	};
</script>

<fieldset class="entry-kind">
	<legend class="label">Entry type</legend>
	<div class="kind-options">
		<label class:chosen={!isPayout}>
			<input type="radio" name="{prefix}-type" value="finance_taken" bind:group={value.entry_type} />
			<span>Finance Taken</span>
		</label>
		<label class:chosen={isPayout}>
			<input type="radio" name="{prefix}-type" value="payout" bind:group={value.entry_type} />
			<span>Payout</span>
		</label>
	</div>
</fieldset>
<div class="finance-fields">
	<label class="field">
		<span class="label">Date <span class="req">*</span></span>
		<input class="input" type="date" bind:value={value.date} required />
	</label>
	<div class="field entity-field">
		<label class="label" for="{prefix}-entity">Entity <span class="req">*</span></label>
		<EntitySelect entities={entities} id="{prefix}-entity" bind:value={value.entity_id} />
	</div>
	<div class="field">
		<label class="label" for="{prefix}-amount">Amount <span class="req">*</span></label>
		<div class="amount-row">
			<span class="currency" aria-hidden="true">₹</span>
			<input class="input" id="{prefix}-amount" type="number" inputmode="decimal" min="0.01" step="0.01"
				placeholder="0" bind:value={value.amount} bind:this={amountInput} on:keydown={onAmountKey} required />
			<button class="btn btn-sm" type="button" aria-label="T · Thousand" title="Multiply by 1,000" on:click={() => scale(1000)}>T</button>
			<button class="btn btn-sm" type="button" aria-label="L · Lakh" title="Multiply by 1,00,000" on:click={() => scale(100000)}>L</button>
		</div>
		<span class="hint">{words ? `₹ ${words}` : 'T for thousand · L for lakh'}</span>
	</div>
	{#if !isPayout}
		<label class="field">
			<span class="label">Monthly interest (%)</span>
			<input class="input" type="number" min="0" step="0.01" inputmode="decimal" bind:value={value.interest_rate} required />
		</label>
		<label class="field">
			<span class="label">Interest payout cycle</span>
			<select class="select" bind:value={value.interest_payout}>
				{#each PAYOUT_TYPES as payout}<option value={payout.value}>{payout.label}</option>{/each}
			</select>
		</label>
	{/if}
</div>
<label class="field comments">
	<span class="label">Comments</span>
	<input class="input" bind:value={value.comments} placeholder={isPayout ? 'Payment reference or notes' : 'Agreement reference or notes'} />
</label>

<style>
	.entry-kind { min-inline-size: 0; padding: 0; margin: 0 0 18px; border: 0; }
	.entry-kind legend { margin-bottom: 7px; }
	.kind-options { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
	.kind-options label { position: relative; display: flex; align-items: center; min-height: 34px; padding: 4px 14px; border-radius: 7px; color: var(--muted); font-weight: 600; cursor: pointer; }
	.kind-options input { position: absolute; opacity: 0; }
	.kind-options .chosen { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm), 0 0 0 1px var(--border); }
	.kind-options label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
	.finance-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 14px 16px; align-items: start; }
	.comments { margin-top: 14px; }
	.amount-row { position: relative; display: flex; align-items: center; gap: 5px; }
	.amount-row .input { min-width: 0; padding-inline-start: 25px; }
	.amount-row .btn { flex: none; min-width: 32px; height: 38px; padding: 0 6px; }
	.currency { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
	.entity-field :global(.menu) { max-width: min(360px, 88vw); }
	@media (max-width: 530px) {
		.entity-field :global(.menu) { max-width: 100%; }
	}
</style>
