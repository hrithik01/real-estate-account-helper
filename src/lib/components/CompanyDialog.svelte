<script>
	// @ts-nocheck
	import { createEventDispatcher } from 'svelte';
	import { api } from '$lib/api.js';
	import { COMPANY_COLORS } from '$lib/constants.js';
	import { initials } from '$lib/format.js';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';

	export let open = false;
	/** Existing company to edit; null to create a new one. */
	export let company = null;
	/** Other companies, used for "copy lists from". */
	export let companies = [];

	const dispatch = createEventDispatcher();
	let form = {};
	let heads = [];
	let copyFrom = '';
	let saving = false;
	let errorMessage = '';
	let wasOpen = false;

	$: isEdit = Boolean(company?.id);

	const reset = () => {
		form = {
			name: company?.name || '',
			code: company?.code || '',
			legal_name: company?.legal_name || '',
			tax_id: company?.tax_id || '',
			phone: company?.phone || '',
			email: company?.email || '',
			address: company?.address || '',
			color: company?.color || COMPANY_COLORS[companies.length % COMPANY_COLORS.length]
		};
		heads = [{ name: 'Main', code: '', opening_balance: '' }];
		copyFrom = '';
		errorMessage = '';
		saving = false;
	};

	// Reset the form each time the dialog opens (single statement so it runs in order).
	$: {
		if (open && !wasOpen) reset();
		wasOpen = open;
	}

	const addHead = () => (heads = [...heads, { name: '', code: '', opening_balance: '' }]);
	const removeHead = (index) => (heads = heads.filter((_, i) => i !== index));

	const submit = async () => {
		errorMessage = '';
		if (!form.name.trim()) {
			errorMessage = 'Company name is required.';
			return;
		}
		saving = true;
		try {
			const saved = isEdit
				? await api(`/api/companies/${company.id}`, { method: 'PUT', body: form })
				: await api('/api/companies', {
						method: 'POST',
						body: { ...form, heads, copy_options_from: copyFrom || null }
					});
			dispatch('saved', saved);
		} catch (err) {
			errorMessage = err.message;
		} finally {
			saving = false;
		}
	};
</script>

<Modal
	{open}
	width="640px"
	title={isEdit ? 'Edit company' : 'Create a company'}
	description={isEdit ? 'Update the company profile shown on reports.' : 'Each company keeps its own books, masters and reports.'}
	on:close={() => dispatch('close')}
>
	<form id="company-form" on:submit|preventDefault={submit}>
		<div class="identity">
			<span class="avatar big" style="background: {form.color}">{form.code || initials(form.name)}</span>
			<div class="form-grid grow">
				<label class="field span-2">
					<span class="label">Company name <span class="req">*</span></span>
					<input class="input" bind:value={form.name} placeholder="e.g. Sunrise Developers" maxlength="80" autocomplete="off" />
				</label>
			</div>
		</div>

		<div class="form-grid">
			<label class="field">
				<span class="label">Short code</span>
				<input class="input" bind:value={form.code} placeholder={initials(form.name)} maxlength="4" style="text-transform: uppercase" />
				<span class="hint">Shown in the company switcher.</span>
			</label>
			<div class="field">
				<span class="label">Colour</span>
				<div class="swatches" role="radiogroup" aria-label="Company colour">
					{#each COMPANY_COLORS as color}
						<button type="button" class="swatch" class:active={form.color === color} style="background: {color}" role="radio" aria-checked={form.color === color} aria-label={color} on:click={() => (form.color = color)}>
							{#if form.color === color}<Icon name="check" size={14} stroke={2.5} />{/if}
						</button>
					{/each}
				</div>
			</div>
			<label class="field">
				<span class="label">Legal name</span>
				<input class="input" bind:value={form.legal_name} placeholder="Registered business name" />
			</label>
			<label class="field">
				<span class="label">GSTIN / PAN</span>
				<input class="input" bind:value={form.tax_id} placeholder="Optional" style="text-transform: uppercase" />
			</label>
			<label class="field">
				<span class="label">Phone</span>
				<input class="input" bind:value={form.phone} placeholder="Optional" inputmode="tel" />
			</label>
			<label class="field">
				<span class="label">Email</span>
				<input class="input" type="email" bind:value={form.email} placeholder="Optional" />
			</label>
			<label class="field span-all">
				<span class="label">Address</span>
				<input class="input" bind:value={form.address} placeholder="Printed on report headers" />
			</label>
		</div>

		{#if !isEdit}
			<div class="section">
				<div class="section-head">
					<div>
						<h3>Master balances</h3>
						<p class="muted">Partners, owners or books that every entry is attached to. You can change these later.</p>
					</div>
					<button type="button" class="btn btn-sm" on:click={addHead}><Icon name="plus" size={14} /> Add</button>
				</div>
				<div class="heads">
					{#each heads as head, index}
						<div class="head-row">
							<input class="input" bind:value={head.name} placeholder="Name, e.g. Partner A" aria-label="Master balance name" />
							<input class="input code" bind:value={head.code} placeholder="Auto" maxlength="12" aria-label="Code" style="text-transform: uppercase" />
							<input class="input" type="number" step="any" bind:value={head.opening_balance} placeholder="Opening ₹" aria-label="Opening balance" />
							<button type="button" class="btn btn-ghost btn-icon" aria-label="Remove" disabled={heads.length === 1} on:click={() => removeHead(index)}>
								<Icon name="x" />
							</button>
						</div>
					{/each}
				</div>
			</div>

			{#if companies.length > 0}
				<label class="field section">
					<span class="label">Start with custom lists from</span>
					<select class="select" bind:value={copyFrom}>
						<option value="">Defaults only</option>
						{#each companies as other}
							<option value={other.id}>{other.name}</option>
						{/each}
					</select>
					<span class="hint">Copies custom categories, entity types and property types. Transactions are never copied.</span>
				</label>
			{/if}
		{/if}

		{#if errorMessage}
			<p class="error" role="alert"><Icon name="alert" size={14} /> {errorMessage}</p>
		{/if}
	</form>

	<svelte:fragment slot="footer">
		<button type="button" class="btn" on:click={() => dispatch('close')}>Cancel</button>
		<button type="submit" form="company-form" class="btn btn-primary" disabled={saving}>
			{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create company'}
		</button>
	</svelte:fragment>
</Modal>

<style>
	.identity {
		display: flex;
		align-items: flex-end;
		gap: 14px;
		margin-bottom: 14px;
	}
	.grow {
		flex: 1;
	}
	.avatar.big {
		width: 52px;
		height: 52px;
		border-radius: 12px;
		font-size: 16px;
	}
	.swatches {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: center;
		min-height: 38px;
	}
	.swatch {
		width: 26px;
		height: 26px;
		border-radius: 8px;
		border: 2px solid transparent;
		cursor: pointer;
		color: #fff;
		display: grid;
		place-items: center;
		padding: 0;
	}
	.swatch.active {
		box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--border-strong);
	}
	.section {
		margin-top: 20px;
		padding-top: 18px;
		border-top: 1px solid var(--border);
	}
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 12px;
	}
	.section-head p {
		font-size: 13px;
		margin-top: 2px;
	}
	.heads {
		display: grid;
		gap: 8px;
	}
	.head-row {
		display: grid;
		grid-template-columns: 1.6fr 0.8fr 1fr auto;
		gap: 8px;
	}
	.error {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--neg-soft);
		color: var(--neg);
		font-size: 13px;
	}
	@media (max-width: 560px) {
		.head-row {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
