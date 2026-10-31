<script>
	// @ts-nocheck
	import { MATERIAL_TYPE, PAYMENT_MODES, SERVICE_TYPE, UTILITY_TYPE } from '$lib/constants.js';
	import { amountInWords, labelize } from '$lib/format.js';
	import { companyKey, storage } from '$lib/api.js';
	import EntitySelect from './EntitySelect.svelte';
	import MultiSelect from './MultiSelect.svelte';

	export let kind = 'income';
	export let value;
	export let entities = [];
	export let entityTypes = [];
	export let projects = [];
	export let accounts = [];
	export let sources = [];
	export let heads = [];
	export let idPrefix = 'txn';
	export let amountInput = null;

	// Income is mostly from customers and owners; expenses go to everyone else.
	const INCOME_TYPES = ['customer', 'owner'];
	const typesKey = companyKey(`${kind}-entity-types`);

	const readStoredTypes = () => {
		try {
			const parsed = JSON.parse(storage.get(typesKey, 'null'));
			return Array.isArray(parsed) ? parsed : null;
		} catch {
			return null;
		}
	};

	let typeFilter = null; // null until chosen: then the saved or default selection applies
	$: allTypes = entityTypes.length ? entityTypes : [...new Set(entities.map((entity) => entity.entity_type))];
	$: if (typeFilter === null && allTypes.length > 0) {
		typeFilter = readStoredTypes() ?? allTypes.filter((type) => (kind === 'income') === INCOME_TYPES.includes(type));
	}
	$: typeOptions = allTypes.map((type) => ({ value: type, label: labelize(type) }));

	const onTypesChange = (event) => {
		typeFilter = event.detail;
		storage.set(typesKey, JSON.stringify(typeFilter));
	};

	$: sourceField = kind === 'income' ? 'credit_source' : 'expense_source';
	$: showSubtypes = kind === 'expense' && /material|service|utility/i.test(value[sourceField] || '');
	$: projectOptions = projects.map((project) => ({ value: String(project.id), label: project.property_name, hint: project.property_location }));
	$: selectedProjects = (value.project_ids || []).map(String);
	// Only offer entities attached to the chosen projects (the current choice always stays visible).
	$: entityOptions = entities.filter(
		(entity) =>
			String(entity.id) === String(value.entity_id) ||
			(((typeFilter ?? allTypes).includes(entity.entity_type)) &&
				(selectedProjects.length === 0 || (entity.project_ids || []).map(String).some((id) => selectedProjects.includes(id))))
	);
	// Keep a legacy source selectable while editing an entry that still uses it.
	$: sourceOptions = value[sourceField] && !sources.includes(value[sourceField]) ? [value[sourceField], ...sources] : sources;
	$: words = amountInWords(value.amount);

	const appendZeros = (count) => {
		const current = String(value.amount ?? '').trim();
		if (!current) return;
		value = { ...value, amount: `${current}${'0'.repeat(count)}` };
	};

	const onProjectsChange = (event) => {
		const ids = event.detail;
		let entity_id = value.entity_id;
		if (entity_id && ids.length > 0) {
			const entity = entities.find((item) => String(item.id) === String(entity_id));
			const linked = (entity?.project_ids || []).map(String).some((id) => ids.includes(id));
			if (!linked) entity_id = '';
		}
		value = { ...value, project_ids: ids, entity_id };
	};

	const setMode = (mode) => {
		value = { ...value, payment_mode: mode, account_id: mode === 'account' ? value.account_id : '' };
	};
</script>

<div class="form-grid">
	<label class="field">
		<span class="label">Date <span class="req">*</span></span>
		<input class="input" type="date" bind:value={value.date} required />
	</label>

	<div class="field">
		<label class="label" for="{idPrefix}-amount">Amount <span class="req">*</span></label>
		<div class="amount-row">
			<span class="prefix">₹</span>
			<input
				id="{idPrefix}-amount"
				class="input amount-input"
				type="number"
				min="0"
				step="any"
				inputmode="decimal"
				placeholder="0"
				bind:value={value.amount}
				bind:this={amountInput}
				required
			/>
			<button type="button" class="btn btn-sm" title="Append 000 (thousand)" on:click={() => appendZeros(3)}>T</button>
			<button type="button" class="btn btn-sm" title="Append 00000 (lakh)" on:click={() => appendZeros(5)}>L</button>
		</div>
		<span class="hint">{words ? `₹ ${words}` : 'T adds 000 · L adds 00000'}</span>
	</div>

	<div class="field">
		<label class="label" for="{idPrefix}-projects">Projects</label>
		<MultiSelect id="{idPrefix}-projects" options={projectOptions} value={selectedProjects} placeholder="Any project" emptyLabel="No projects yet. Add them in Masters." on:change={onProjectsChange} />
	</div>

	<div class="field">
		<label class="label" for="{idPrefix}-entity-types">Show entity types</label>
		<MultiSelect id="{idPrefix}-entity-types" options={typeOptions} value={typeFilter ?? []} noun="types" placeholder="No types" emptyLabel="No entity types yet." on:change={onTypesChange} />
		<span class="hint">{kind === 'income' ? 'Customers and owners by default.' : 'Everyone except customers and owners by default.'}</span>
	</div>

	<div class="field">
		<label class="label" for="{idPrefix}-entity">Entity <span class="req">*</span></label>
		<EntitySelect id="{idPrefix}-entity" entities={entityOptions} bind:value={value.entity_id} emptyLabel="No entities match the selected types." />
		<span class="hint">
			{#if entityOptions.length < entities.length}Showing {entityOptions.length} of {entities.length} entities{selectedProjects.length > 0 ? ' for the selected projects and types' : ' for the selected types'}.{:else}&nbsp;{/if}
		</span>
	</div>

	<div class="field">
		<span class="label">Payment mode</span>
		<div class="segmented" role="radiogroup" aria-label="Payment mode">
			{#each PAYMENT_MODES as mode}
				<button type="button" role="radio" aria-checked={value.payment_mode === mode} class:active={value.payment_mode === mode} on:click={() => setMode(mode)}>{mode}</button>
			{/each}
		</div>
	</div>

	<label class="field">
		<span class="label">Account {#if value.payment_mode === 'account'}<span class="req">*</span>{/if}</span>
		<select class="select" bind:value={value.account_id} disabled={value.payment_mode !== 'account'}>
			<option value="">{value.payment_mode === 'account' ? 'Select account…' : 'Not needed for cash'}</option>
			{#each accounts as account (account.id)}
				<option value={String(account.id)}>{account.account_holder} · {account.bank_name}</option>
			{/each}
		</select>
	</label>

	<label class="field">
		<span class="label">{kind === 'income' ? 'Credit source' : 'Expense source'}</span>
		<select class="select" bind:value={value[sourceField]}>
			{#each sourceOptions as source}
				<option value={source}>{labelize(source)}</option>
			{/each}
		</select>
	</label>

	{#if showSubtypes}
		<label class="field">
			<span class="label">Material type</span>
			<select class="select" bind:value={value.material_type}>
				<option value="">N/A</option>
				{#each MATERIAL_TYPE as item}<option value={item}>{labelize(item.replace(/^MATERIAL_/, ''))}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span class="label">Service type</span>
			<select class="select" bind:value={value.service_type}>
				<option value="">N/A</option>
				{#each SERVICE_TYPE as item}<option value={item}>{labelize(item.replace(/^SERVICE_/, ''))}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span class="label">Utility type</span>
			<select class="select" bind:value={value.utility_type}>
				<option value="">N/A</option>
				{#each UTILITY_TYPE as item}<option value={item}>{labelize(item.replace(/^(UTILITY|BILL)_/, ''))}</option>{/each}
			</select>
		</label>
	{/if}

	<label class="field">
		<span class="label">Master balance</span>
		<select class="select" bind:value={value.master_owner}>
			{#each heads as head (head.id)}
				<option value={head.code}>{head.name} ({head.code})</option>
			{/each}
		</select>
	</label>

	<label class="field span-all">
		<span class="label">Comments</span>
		<input class="input" bind:value={value.comments} placeholder="Notes, reference numbers, plot details…" />
	</label>
</div>

<style>
	.amount-row {
		display: flex;
		align-items: center;
		gap: 6px;
		position: relative;
	}
	.prefix {
		position: absolute;
		left: 12px;
		color: var(--muted);
		pointer-events: none;
	}
	.amount-input {
		padding-left: 26px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.amount-row .btn {
		flex: none;
		width: 32px;
		padding: 0;
		height: 38px;
	}
	.segmented {
		width: 100%;
	}
	.segmented button {
		flex: 1;
	}
</style>
