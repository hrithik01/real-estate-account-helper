<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { api, storage, companyKey } from '$lib/api.js';
	import { downloadCsv, slug } from '$lib/csv.js';
	import { amountInWords, formatDate, formatINR, plural, todayIso } from '$lib/format.js';
	import { confirmDialog } from '$lib/confirm.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';

	export let data;

	const blankSheet = () => ({ entity_id: '', title: '', comments: '' });
	const blankEntry = () => ({ date: todayIso(), entry_type: 'credit', amount: '', remarks: '' });
	const sheetName = (sheet) => sheet.title || sheet.entity_name || 'Deleted entity';

	let entities = [];
	let sheets = [];
	let entries = [];
	let selectedId = null;
	let loading = true;
	let loadingEntries = false;
	let saving = false;

	let sheetEditor = null; // { id?, form }
	let entryForm = blankEntry();
	let editingEntry = null;
	let draft = null;

	$: selected = sheets.find((sheet) => sheet.id === selectedId) || null;
	$: rows = entries.reduce((acc, entry) => {
		const previous = acc.length ? acc[acc.length - 1].balance : 0;
		acc.push({ ...entry, balance: previous + (entry.entry_type === 'credit' ? entry.amount : -entry.amount) });
		return acc;
	}, []);

	const loadSheets = async () => {
		sheets = await api('/api/sheets');
	};

	const loadEntries = async () => {
		if (!selectedId) {
			entries = [];
			return;
		}
		loadingEntries = true;
		try {
			entries = (await api(`/api/sheets/${selectedId}`)).entries;
		} catch (err) {
			toast.error(err.message);
		} finally {
			loadingEntries = false;
		}
	};

	const refresh = async () => {
		await loadSheets();
		await loadEntries();
	};

	const select = async (id) => {
		selectedId = id;
		entryForm = blankEntry();
		storage.set(companyKey('sheet'), id);
		await loadEntries();
	};

	const openNewSheet = () => (sheetEditor = { id: null, form: blankSheet() });
	const openEditSheet = (sheet) =>
		(sheetEditor = { id: sheet.id, form: { entity_id: sheet.entity_id ? String(sheet.entity_id) : '', title: sheet.title || '', comments: sheet.comments || '' } });

	const saveSheet = async () => {
		if (!sheetEditor.form.entity_id) return toast.error('Select an entity.');
		saving = true;
		try {
			if (sheetEditor.id) {
				await api(`/api/sheets/${sheetEditor.id}`, { method: 'PUT', body: sheetEditor.form });
				toast.success('Sheet updated');
				sheetEditor = null;
				await refresh();
			} else {
				const created = await api('/api/sheets', { method: 'POST', body: sheetEditor.form });
				toast.success('Sheet created');
				sheetEditor = null;
				await loadSheets();
				await select(created.id);
			}
		} catch (err) {
			toast.error(err.message);
		} finally {
			saving = false;
		}
	};

	const removeSheet = async (sheet) => {
		const ok = await confirmDialog({
			title: 'Delete this sheet?',
			message: `${sheetName(sheet)} and its ${plural(sheet.entry_count, 'entry', 'entries')} will be removed. Your income, expenses and balances are not affected.`
		});
		if (!ok) return;
		try {
			await api(`/api/sheets/${sheet.id}`, { method: 'DELETE' });
			toast.success('Sheet deleted');
			if (selectedId === sheet.id) await select(null);
			await loadSheets();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const addEntry = async () => {
		if (!(Number(entryForm.amount) > 0)) return toast.error('Enter an amount greater than zero.');
		saving = true;
		try {
			await api(`/api/sheets/${selectedId}/entries`, { method: 'POST', body: entryForm });
			toast.success(`${entryForm.entry_type === 'credit' ? 'Credit' : 'Debit'} added`);
			entryForm = { ...blankEntry(), date: entryForm.date, entry_type: entryForm.entry_type };
			await refresh();
		} catch (err) {
			toast.error(err.message);
		} finally {
			saving = false;
		}
	};

	const startEdit = (row) => {
		editingEntry = row;
		draft = { date: row.date, entry_type: row.entry_type, amount: row.amount, remarks: row.remarks || '' };
	};

	const saveEdit = async () => {
		try {
			await api(`/api/sheet-entries/${editingEntry.id}`, { method: 'PUT', body: draft });
			toast.success('Entry updated');
			editingEntry = null;
			await refresh();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const removeEntry = async (row) => {
		const ok = await confirmDialog({ title: 'Delete this entry?', message: `${row.entry_type === 'credit' ? 'Credit' : 'Debit'} ${formatINR(row.amount)} · ${formatDate(row.date)}` });
		if (!ok) return;
		try {
			await api(`/api/sheet-entries/${row.id}`, { method: 'DELETE' });
			toast.success('Entry deleted');
			await refresh();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const exportCsv = () =>
		downloadCsv(
			`${slug(sheetName(selected))}-sheet.csv`,
			[
				{ label: 'Date', value: (row) => row.date },
				{ label: 'Remarks', value: (row) => row.remarks },
				{ label: 'Credit', value: (row) => (row.entry_type === 'credit' ? row.amount : '') },
				{ label: 'Debit', value: (row) => (row.entry_type === 'debit' ? row.amount : '') },
				{ label: 'Net', value: (row) => row.balance }
			],
			rows
		);

	onMount(async () => {
		try {
			[entities, sheets] = await Promise.all([api('/api/entities'), api('/api/sheets')]);
			const remembered = Number(storage.get(companyKey('sheet')));
			const initial = sheets.find((sheet) => sheet.id === remembered) || sheets[0];
			if (initial) await select(initial.id);
		} catch (err) {
			toast.error(err.message);
		} finally {
			loading = false;
		}
	});
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{data.company.name}</p>
		<h1>Independent Sheets</h1>
		<p>Standalone credit and debit books for any entity. These sheets don't affect income, expenses or balances.</p>
	</div>
	<div class="page-actions">
		<button class="btn btn-primary" type="button" on:click={openNewSheet}><Icon name="plus" size={15} /> New sheet</button>
	</div>
</header>

{#if loading}
	<section class="card"><div class="card-body muted">Loading…</div></section>
{:else if sheets.length === 0}
	<section class="card">
		<div class="empty">
			<span class="empty-icon"><Icon name="clipboard" size={20} /></span>
			<h3>No sheets yet</h3>
			<p>Create a sheet for an entity to start tracking its credits and debits.</p>
			<button class="btn btn-primary" type="button" on:click={openNewSheet}><Icon name="plus" size={15} /> New sheet</button>
		</div>
	</section>
{:else}
	<section class="sheet-grid" aria-label="Sheets">
		{#each sheets as sheet (sheet.id)}
			<button type="button" class="sheet-card" class:active={sheet.id === selectedId} aria-pressed={sheet.id === selectedId} on:click={() => select(sheet.id)}>
				<span class="sheet-name">{sheetName(sheet)}</span>
				<span class="sheet-sub">{sheet.title && sheet.entity_name ? sheet.entity_name : plural(sheet.entry_count, 'entry', 'entries')}</span>
				<span class="sheet-net amount" class:pos={sheet.net > 0} class:neg={sheet.net < 0}>{formatINR(sheet.net)}</span>
			</button>
		{/each}
	</section>

	{#if selected}
		<section class="kpi-grid">
			<article class="kpi">
				<span class="kpi-label">Total credit</span>
				<span class="kpi-value pos">{formatINR(selected.total_credit)}</span>
				<span class="kpi-foot">{plural(entries.filter((e) => e.entry_type === 'credit').length, 'entry', 'entries')}</span>
			</article>
			<article class="kpi">
				<span class="kpi-label">Total debit</span>
				<span class="kpi-value neg">{formatINR(selected.total_debit)}</span>
				<span class="kpi-foot">{plural(entries.filter((e) => e.entry_type === 'debit').length, 'entry', 'entries')}</span>
			</article>
			<article class="kpi">
				<span class="kpi-label">Net result</span>
				<span class="kpi-value" class:pos={selected.net > 0} class:neg={selected.net < 0}>{formatINR(selected.net)}</span>
				<span class="kpi-foot">Credit − debit</span>
			</article>
		</section>

		<section class="card">
			<div class="card-header">
				<div>
					<h2>New entry · {sheetName(selected)}</h2>
					<p>{selected.comments || 'Record a credit or debit with a remark.'}</p>
				</div>
				<div class="page-actions">
					<button class="btn btn-sm" type="button" on:click={() => openEditSheet(selected)}><Icon name="edit" size={14} /> Edit sheet</button>
					<button class="btn btn-sm btn-danger-ghost" type="button" on:click={() => removeSheet(selected)}><Icon name="trash" size={14} /> Delete sheet</button>
				</div>
			</div>
			<form class="card-body" on:submit|preventDefault={addEntry}>
				<div class="form-grid">
					<label class="field"><span class="label">Date <span class="req">*</span></span><input class="input" type="date" bind:value={entryForm.date} required /></label>
					<label class="field">
						<span class="label">Type <span class="req">*</span></span>
						<select class="select" bind:value={entryForm.entry_type}><option value="credit">Credit</option><option value="debit">Debit</option></select>
					</label>
					<label class="field">
						<span class="label">Amount <span class="req">*</span></span>
						<input class="input" type="number" min="0" step="any" bind:value={entryForm.amount} placeholder="₹ 0" />
						<span class="hint">{amountInWords(entryForm.amount) ? `₹ ${amountInWords(entryForm.amount)}` : ' '}</span>
					</label>
					<label class="field"><span class="label">Remarks</span><input class="input" bind:value={entryForm.remarks} /></label>
				</div>
				<div class="form-actions">
					<button class="btn btn-primary" type="submit" disabled={saving}><Icon name="plus" size={15} /> {saving ? 'Saving…' : 'Add entry'}</button>
				</div>
			</form>
		</section>

		<section class="card">
			<div class="card-header">
				<div>
					<h2>Ledger</h2>
					<p>{plural(entries.length, 'entry', 'entries')} · oldest first</p>
				</div>
				<div class="page-actions">
					<button class="btn btn-sm" type="button" disabled={rows.length === 0} on:click={exportCsv}><Icon name="download" size={14} /> CSV</button>
				</div>
			</div>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr><th>Date</th><th>Remarks</th><th class="num">Credit</th><th class="num">Debit</th><th class="num">Net</th><th class="actions"><span class="sr-only">Actions</span></th></tr>
					</thead>
					<tbody>
						{#each rows as row (row.id)}
							<tr>
								<td>{formatDate(row.date)}</td>
								<td class="muted">{row.remarks || '—'}</td>
								<td class="num amount pos">{row.entry_type === 'credit' ? formatINR(row.amount) : ''}</td>
								<td class="num amount neg">{row.entry_type === 'debit' ? formatINR(row.amount) : ''}</td>
								<td class="num" class:pos={row.balance > 0} class:neg={row.balance < 0}>{formatINR(row.balance)}</td>
								<td class="actions">
									<span class="row-actions">
										<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit entry" on:click={() => startEdit(row)}><Icon name="edit" size={15} /></button>
										<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete entry" on:click={() => removeEntry(row)}><Icon name="trash" size={15} /></button>
									</span>
								</td>
							</tr>
						{:else}
							<tr><td colspan="6"><div class="empty"><span class="empty-icon"><Icon name="clipboard" size={20} /></span><h3>{loadingEntries ? 'Loading…' : 'No entries yet'}</h3></div></td></tr>
						{/each}
					</tbody>
					{#if rows.length > 0}
						<tfoot>
							<tr>
								<td colspan="2">Total</td>
								<td class="num pos">{formatINR(selected.total_credit)}</td>
								<td class="num neg">{formatINR(selected.total_debit)}</td>
								<td class="num" class:pos={selected.net > 0} class:neg={selected.net < 0}>{formatINR(selected.net)}</td>
								<td></td>
							</tr>
						</tfoot>
					{/if}
				</table>
			</div>
		</section>
	{/if}
{/if}

<Modal open={Boolean(sheetEditor)} title={sheetEditor?.id ? 'Edit sheet' : 'New sheet'} width="520px" on:close={() => (sheetEditor = null)}>
	{#if sheetEditor}
		<form id="sheet-form" class="form-grid" on:submit|preventDefault={saveSheet}>
			<label class="field span-all">
				<span class="label">Entity <span class="req">*</span></span>
				<select class="select" bind:value={sheetEditor.form.entity_id}>
					<option value="">Select entity…</option>
					{#each entities as entity (entity.id)}<option value={String(entity.id)}>{entity.name} ({entity.entity_code})</option>{/each}
				</select>
				<span class="hint">Add entities under Masters. An entity can have more than one sheet.</span>
			</label>
			<label class="field span-all"><span class="label">Sheet title</span><input class="input" bind:value={sheetEditor.form.title} placeholder="Optional, e.g. Plot 12 advance" /></label>
			<label class="field span-all"><span class="label">Comments</span><input class="input" bind:value={sheetEditor.form.comments} /></label>
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => (sheetEditor = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="sheet-form" disabled={saving}>{sheetEditor?.id ? 'Save changes' : 'Create sheet'}</button>
	</svelte:fragment>
</Modal>

<Modal open={Boolean(editingEntry)} title="Edit entry" width="520px" on:close={() => (editingEntry = null)}>
	{#if draft}
		<form id="entry-edit" class="form-grid" on:submit|preventDefault={saveEdit}>
			<label class="field"><span class="label">Date</span><input class="input" type="date" bind:value={draft.date} required /></label>
			<label class="field">
				<span class="label">Type</span>
				<select class="select" bind:value={draft.entry_type}><option value="credit">Credit</option><option value="debit">Debit</option></select>
			</label>
			<label class="field"><span class="label">Amount</span><input class="input" type="number" min="0" step="any" bind:value={draft.amount} /></label>
			<label class="field"><span class="label">Remarks</span><input class="input" bind:value={draft.remarks} /></label>
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => (editingEntry = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="entry-edit">Save changes</button>
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
	.sheet-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 12px;
		margin-bottom: 18px;
	}
	.sheet-card {
		display: grid;
		gap: 2px;
		text-align: left;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		cursor: pointer;
		color: var(--text);
		transition: border-color 0.12s ease, background 0.12s ease;
	}
	.sheet-card:hover {
		border-color: var(--border-strong);
	}
	.sheet-card:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
	.sheet-card.active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.sheet-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sheet-sub {
		font-size: 12px;
		color: var(--muted);
	}
	.sheet-net {
		margin-top: 6px;
		font-size: 16px;
	}
</style>
