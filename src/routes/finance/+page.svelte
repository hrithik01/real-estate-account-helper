<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { api, storage } from '$lib/api.js';
	import { PAYOUT_TYPES } from '$lib/constants.js';
	import { amountInWords, formatDate, formatINR, todayIso, plural } from '$lib/format.js';
	import { confirmDialog } from '$lib/confirm.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';

	export let data;

	const payoutLabel = (value) => PAYOUT_TYPES.find((item) => item.value === value)?.label || value;
	const blank = () => ({ date: todayIso(), entity_id: '', amount: '', interest_rate: 1.5, interest_payout: 'monthly', comments: '' });

	let entities = [];
	let entries = [];
	let loading = true;
	let saving = false;
	let form = blank();
	let search = '';
	let editing = null;
	let draft = null;
	let showInterest = storage.get('ledger-finance-interest', '1') === '1';
	let showPayout = storage.get('ledger-finance-payout', '1') === '1';

	$: filtered = entries.filter((row) =>
		search ? `${row.entity_name || ''} ${row.comments || ''} ${row.amount}`.toLowerCase().includes(search.toLowerCase()) : true
	);
	$: totalPrincipal = filtered.reduce((sum, row) => sum + Number(row.amount || 0), 0);
	$: weightedRate = totalPrincipal > 0 ? filtered.reduce((sum, row) => sum + row.amount * row.interest_rate, 0) / totalPrincipal : 0;
	$: lenders = new Set(filtered.map((row) => row.entity_id)).size;

	const load = async () => {
		loading = true;
		try {
			[entities, entries] = await Promise.all([api('/api/entities'), api('/api/finance')]);
		} catch (err) {
			toast.error(err.message);
		} finally {
			loading = false;
		}
	};

	const submit = async () => {
		if (!form.entity_id) return toast.error('Select an entity.');
		if (!(Number(form.amount) > 0)) return toast.error('Enter an amount greater than zero.');
		saving = true;
		try {
			await api('/api/finance', { method: 'POST', body: form });
			toast.success('Finance entry added');
			form = { ...blank(), date: form.date };
			await load();
		} catch (err) {
			toast.error(err.message);
		} finally {
			saving = false;
		}
	};

	const startEdit = (row) => {
		editing = row;
		draft = {
			date: row.date,
			entity_id: row.entity_id ? String(row.entity_id) : '',
			amount: row.amount,
			interest_rate: row.interest_rate,
			interest_payout: row.interest_payout,
			comments: row.comments || ''
		};
	};

	const saveEdit = async () => {
		try {
			await api(`/api/finance/${editing.id}`, { method: 'PUT', body: draft });
			toast.success('Finance entry updated');
			editing = null;
			await load();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const remove = async (row) => {
		const ok = await confirmDialog({ title: 'Delete this finance entry?', message: `${formatINR(row.amount)} · ${row.entity_name || 'No entity'} · ${formatDate(row.date)}` });
		if (!ok) return;
		try {
			await api(`/api/finance/${row.id}`, { method: 'DELETE' });
			toast.success('Finance entry deleted');
			if (editing?.id === row.id) editing = null;
			await load();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const toggle = (which) => {
		if (which === 'interest') storage.set('ledger-finance-interest', (showInterest = !showInterest) ? '1' : '0');
		else storage.set('ledger-finance-payout', (showPayout = !showPayout) ? '1' : '0');
	};

	onMount(load);
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{data.company.name}</p>
		<h1>Finance</h1>
		<p>Track borrowed or lent capital and its interest terms. These entries don't affect income, expenses or balances.</p>
	</div>
</header>

<section class="kpi-grid">
	<article class="kpi">
		<span class="kpi-label">Total principal</span>
		<span class="kpi-value" class:skeleton={loading}>{formatINR(totalPrincipal)}</span>
		<span class="kpi-foot">{plural(filtered.length, 'entry', 'entries')}</span>
	</article>
	<article class="kpi">
		<span class="kpi-label">Weighted interest</span>
		<span class="kpi-value" class:skeleton={loading}>{weightedRate.toFixed(2)}%</span>
		<span class="kpi-foot">Average rate weighted by amount</span>
	</article>
	<article class="kpi">
		<span class="kpi-label">Counterparties</span>
		<span class="kpi-value" class:skeleton={loading}>{lenders}</span>
		<span class="kpi-foot">Distinct entities</span>
	</article>
</section>

<section class="card">
	<div class="card-header">
		<div>
			<h2>New finance entry</h2>
			<p>Default interest is 1.5% with a monthly payout.</p>
		</div>
	</div>
	<form class="card-body" on:submit|preventDefault={submit}>
		<div class="form-grid">
			<label class="field"><span class="label">Date <span class="req">*</span></span><input class="input" type="date" bind:value={form.date} required /></label>
			<label class="field">
				<span class="label">Entity <span class="req">*</span></span>
				<select class="select" bind:value={form.entity_id}>
					<option value="">Select entity…</option>
					{#each entities as entity (entity.id)}<option value={String(entity.id)}>{entity.name} ({entity.entity_code})</option>{/each}
				</select>
			</label>
			<label class="field">
				<span class="label">Amount <span class="req">*</span></span>
				<input class="input" type="number" min="0" step="any" bind:value={form.amount} placeholder="₹ 0" />
				<span class="hint">{amountInWords(form.amount) ? `₹ ${amountInWords(form.amount)}` : ' '}</span>
			</label>
			<label class="field"><span class="label">Interest (%)</span><input class="input" type="number" min="0" step="0.01" bind:value={form.interest_rate} /></label>
			<label class="field">
				<span class="label">Interest payout</span>
				<select class="select" bind:value={form.interest_payout}>{#each PAYOUT_TYPES as payout}<option value={payout.value}>{payout.label}</option>{/each}</select>
			</label>
			<label class="field span-all"><span class="label">Comments</span><input class="input" bind:value={form.comments} /></label>
		</div>
		<div class="form-actions">
			<button class="btn btn-primary" type="submit" disabled={saving}><Icon name="plus" size={15} /> {saving ? 'Saving…' : 'Add finance entry'}</button>
		</div>
	</form>
</section>

<section class="card">
	<div class="card-header">
		<div>
			<h2>Finance entries</h2>
			<p>{filtered.length} of {entries.length} shown</p>
		</div>
		<div class="page-actions">
			<button type="button" class="toggle-chip" class:on={showInterest} aria-pressed={showInterest} on:click={() => toggle('interest')}>Interest</button>
			<button type="button" class="toggle-chip" class:on={showPayout} aria-pressed={showPayout} on:click={() => toggle('payout')}>Payout cycle</button>
			<input class="input search" bind:value={search} placeholder="Search entity or comments" aria-label="Search finance entries" />
		</div>
	</div>
	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Date</th><th>Entity</th><th class="num">Amount</th>
					{#if showInterest}<th class="num">Interest</th>{/if}
					{#if showPayout}<th>Payout</th>{/if}
					<th>Comments</th><th class="actions"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as row (row.id)}
					<tr>
						<td>{formatDate(row.date)}</td>
						<td class="primary">{row.entity_name || '—'}</td>
						<td class="num amount">{formatINR(row.amount)}</td>
						{#if showInterest}<td class="num">{row.interest_rate}%</td>{/if}
						{#if showPayout}<td><span class="badge">{payoutLabel(row.interest_payout)}</span></td>{/if}
						<td class="muted">{row.comments || '—'}</td>
						<td class="actions">
							<span class="row-actions">
								<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit entry" on:click={() => startEdit(row)}><Icon name="edit" size={15} /></button>
								<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete entry" on:click={() => remove(row)}><Icon name="trash" size={15} /></button>
							</span>
						</td>
					</tr>
				{:else}
					<tr><td colspan="7"><div class="empty"><span class="empty-icon"><Icon name="finance" size={20} /></span><h3>{loading ? 'Loading…' : entries.length ? 'No entries match' : 'No finance entries yet'}</h3></div></td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<Modal open={Boolean(editing)} title="Edit finance entry" width="600px" on:close={() => (editing = null)}>
	{#if draft}
		<form id="finance-edit" class="form-grid" on:submit|preventDefault={saveEdit}>
			<label class="field"><span class="label">Date</span><input class="input" type="date" bind:value={draft.date} required /></label>
			<label class="field">
				<span class="label">Entity</span>
				<select class="select" bind:value={draft.entity_id}>
					<option value="">Select entity…</option>
					{#each entities as entity (entity.id)}<option value={String(entity.id)}>{entity.name} ({entity.entity_code})</option>{/each}
				</select>
			</label>
			<label class="field"><span class="label">Amount</span><input class="input" type="number" min="0" step="any" bind:value={draft.amount} /></label>
			<label class="field"><span class="label">Interest (%)</span><input class="input" type="number" min="0" step="0.01" bind:value={draft.interest_rate} /></label>
			<label class="field">
				<span class="label">Interest payout</span>
				<select class="select" bind:value={draft.interest_payout}>{#each PAYOUT_TYPES as payout}<option value={payout.value}>{payout.label}</option>{/each}</select>
			</label>
			<label class="field span-all"><span class="label">Comments</span><input class="input" bind:value={draft.comments} /></label>
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => (editing = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="finance-edit">Save changes</button>
	</svelte:fragment>
</Modal>

<style>
	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.search {
		width: 240px;
		height: 30px;
	}
</style>
