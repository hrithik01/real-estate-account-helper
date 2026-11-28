<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { api, storage, companyKey } from '$lib/api.js';
	import { downloadCsv, slug } from '$lib/csv.js';
	import { downloadTablePdf, pdfMoneyColor } from '$lib/pdf.js';
	import { formatDate, formatINR, labelize, plural, todayIso } from '$lib/format.js';
	import { confirmDialog } from '$lib/confirm.js';
	import { createEntrySelection } from '$lib/entry-selection.js';
	import { toast } from '$lib/toast.js';
	import AmountField from '$lib/components/AmountField.svelte';
	import EntrySelectionToolbar from '$lib/components/EntrySelectionToolbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';

	export let data;

	const blankSheet = () => ({ entity_id: '', title: '', comments: '' });
	const blankEntry = () => ({ date: todayIso(), entry_type: 'credit', amount: '', remarks: '' });
	const sheetName = (sheet) => sheet.title || sheet.entity_name || 'Deleted entity';
	const EMPTY_FILTERS = { q: '', entryType: 'both', start: '', end: '' };
	const compareLatest = (left, right) => right.date.localeCompare(left.date) || right.id - left.id;
	const compareEntered = (left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id;
	const compareAmount = (left, right) => right.amount - left.amount || compareLatest(left, right);
	const sortComparators = { date: compareLatest, entered: compareEntered, amount: compareAmount };
	const signedAmount = (row) => (row.entry_type === 'debit' ? -row.amount : row.amount);
	const selection = createEntrySelection(signedAmount);

	let entities = [];
	let sheets = [];
	let entries = [];
	let selectedId = null;
	let loading = true;
	let loadingEntries = false;
	let entriesRequestId = 0;
	let saving = false;
	let exporting = false;
	let filters = { ...EMPTY_FILTERS };
	let applied = { ...EMPTY_FILTERS };
	let sort = 'date';

	let sheetEditor = null; // { id?, form }
	let entryForm = blankEntry();
	let editingEntry = null;
	let draft = null;

	$: selected = sheets.find((sheet) => sheet.id === selectedId) || null;
	$: pendingFilters = Object.keys(EMPTY_FILTERS).some((key) => filters[key] !== applied[key]);
	$: activeFilterCount = Object.keys(EMPTY_FILTERS).filter((key) => applied[key] !== EMPTY_FILTERS[key]).length;
	$: search = applied.q.toLowerCase();
	$: matchingRows = entries.filter((row) => {
		if (applied.entryType !== 'both' && row.entry_type !== applied.entryType) return false;
		if (applied.start && row.date < applied.start) return false;
		if (applied.end && row.date > applied.end) return false;
		if (!search) return true;
		const amount = signedAmount(row);
		const fields = [row.remarks, row.entry_type, row.date, formatDate(row.date), amount, formatINR(amount)];
		return fields.join(' ').toLowerCase().includes(search);
	});
	$: totals = matchingRows.reduce((summary, row) => {
		summary[row.entry_type].amount += row.amount;
		summary[row.entry_type].count += 1;
		return summary;
	}, { credit: { amount: 0, count: 0 }, debit: { amount: 0, count: 0 } });
	$: net = totals.credit.amount - totals.debit.amount;
	$: visibleRows = sort === 'oldest' ? matchingRows : [...matchingRows].sort(sortComparators[sort]);
	$: selection.setRows(visibleRows);
	$: allRowsChecked = $selection.ids.size > 0 && $selection.ids.size === visibleRows.length;

	const applyFilters = () => {
		filters = { ...filters, q: filters.q.trim() };
		applied = { ...filters };
	};

	const resetFilters = () => {
		filters = { ...EMPTY_FILTERS };
		applied = { ...EMPTY_FILTERS };
	};

	const loadSheets = async () => {
		sheets = await api('/api/sheets');
	};

	const loadEntries = async () => {
		const requestId = ++entriesRequestId;
		if (!selectedId) {
			entries = [];
			loadingEntries = false;
			return;
		}
		loadingEntries = true;
		try {
			const payload = await api(`/api/sheets/${selectedId}`);
			if (requestId === entriesRequestId) entries = payload.entries;
		} catch (err) {
			if (requestId === entriesRequestId) toast.error(err.message);
		} finally {
			if (requestId === entriesRequestId) loadingEntries = false;
		}
	};

	const refresh = async () => {
		await loadSheets();
		await loadEntries();
	};

	const select = async (id) => {
		if (id !== selectedId) {
			selection.close();
			entries = [];
		}
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

	const exportLedger = async (format) => {
		const isPdf = format === 'pdf';
		const exportRows = visibleRows.map((row) => ({ ...row, amount: signedAmount(row) }));
		const columns = [
			{ label: 'Date', width: 75, value: (row) => row.totalLabel || (isPdf ? formatDate(row.date) : row.date) },
			{
				label: 'Amount', width: 95, numeric: true,
				value: (row) => isPdf ? formatINR(row.amount) : row.amount,
				color: (row) => pdfMoneyColor(row.entry_type === 'credit')
			},
			{ label: 'Remarks', value: (row) => row.remarks }
		];
		const totalRows = [
			{ totalLabel: 'Total credit', entry_type: 'credit', amount: totals.credit.amount },
			{ totalLabel: 'Total debit', entry_type: 'debit', amount: totals.debit.amount }
		];
		const filename = `${slug(sheetName(selected)) || 'independent'}-sheet.${format}`;
		exporting = true;
		try {
			if (isPdf) {
				await downloadTablePdf(filename, {
					title: sheetName(selected),
					subtitle: `${data.company.name} · Independent Sheets`,
					details: [
						`${plural(visibleRows.length, 'entry', 'entries')} · Net ${formatINR(net)}`,
						applied.entryType !== 'both' && `Type: ${labelize(applied.entryType)}`,
						applied.start && `Date from ${formatDate(applied.start)}`,
						applied.end && `Date to ${formatDate(applied.end)}`,
						applied.q && `Search: ${applied.q}`
					],
					sections: [{ columns, rows: exportRows, totals: totalRows }]
				});
			} else {
				downloadCsv(filename, columns, [...exportRows, ...totalRows]);
			}
		} catch (err) {
			toast.error(err.message);
		} finally {
			exporting = false;
		}
	};

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
				<span class="kpi-label">{activeFilterCount ? 'Filtered credit' : 'Total credit'}</span>
				<span class="kpi-value pos">{loadingEntries ? '…' : formatINR(totals.credit.amount)}</span>
				<span class="kpi-foot">{loadingEntries ? 'Loading…' : plural(totals.credit.count, 'entry', 'entries')}</span>
			</article>
			<article class="kpi">
				<span class="kpi-label">{activeFilterCount ? 'Filtered debit' : 'Total debit'}</span>
				<span class="kpi-value neg">{loadingEntries ? '…' : formatINR(totals.debit.amount)}</span>
				<span class="kpi-foot">{loadingEntries ? 'Loading…' : plural(totals.debit.count, 'entry', 'entries')}</span>
			</article>
			<article class="kpi">
				<span class="kpi-label">{activeFilterCount ? 'Filtered net' : 'Net result'}</span>
				<span class="kpi-value" class:pos={net > 0} class:neg={net < 0}>{loadingEntries ? '…' : formatINR(net)}</span>
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
					<AmountField id="new-sheet-amount" bind:value={entryForm.amount} />
					<label class="field"><span class="label">Remarks</span><input class="input" bind:value={entryForm.remarks} /></label>
				</div>
				<div class="form-actions">
					<button class="btn btn-primary" type="submit" disabled={saving}><Icon name="plus" size={15} /> {saving ? 'Saving…' : 'Add entry'}</button>
				</div>
			</form>
		</section>

		<section class="card ledger-card">
			<div class="card-header">
				<div>
					<h2>Ledger</h2>
					<p aria-live="polite">
						{#if loadingEntries}
							Loading…
						{:else}
							<span>{plural(matchingRows.length, 'entry', 'entries')} · Net <strong class="amount">{formatINR(net)}</strong></span>
						{/if}
						{#if activeFilterCount}<span class="badge badge-accent">{plural(activeFilterCount, 'filter')}</span>{/if}
					</p>
				</div>
				<div class="page-actions">
					<label class="sort-control">
						<span class="field-label">Sort by</span>
						<select class="select" bind:value={sort}>
							<option value="date">Date (latest first)</option>
							<option value="oldest">Date (oldest first)</option>
							<option value="entered">Entered on (latest first)</option>
							<option value="amount">Amount (high to low)</option>
						</select>
					</label>
					<button class="btn btn-sm" type="button" disabled={exporting || loadingEntries || visibleRows.length === 0} on:click={() => exportLedger('csv')}><Icon name="download" size={14} /> Export CSV</button>
					<button class="btn btn-sm" type="button" disabled={exporting || loadingEntries || visibleRows.length === 0} on:click={() => exportLedger('pdf')}><Icon name="download" size={14} /> Export PDF</button>
				</div>
			</div>
			<form class="filters" on:submit|preventDefault={applyFilters}>
				<div class="toolbar">
					<label class="field grow">
						<span class="label">Search</span>
						<span class="search">
							<Icon name="search" size={14} />
							<input class="input" type="search" bind:value={filters.q} placeholder="Remarks, type, date, amount…" />
						</span>
					</label>
					<label class="field">
						<span class="label">Type</span>
						<select class="select" bind:value={filters.entryType}>
							<option value="both">Both</option>
							<option value="credit">Credit</option>
							<option value="debit">Debit</option>
						</select>
					</label>
					<label class="field"><span class="label">Date from</span><input class="input" type="date" bind:value={filters.start} /></label>
					<label class="field"><span class="label">Date to</span><input class="input" type="date" bind:value={filters.end} /></label>
				</div>
				<div class="filter-actions">
					<span class="spacer"></span>
					{#if pendingFilters}<span class="pending">Filters changed — apply to refresh</span>{/if}
					{#if activeFilterCount || pendingFilters}
						<button class="btn btn-sm btn-ghost" type="button" on:click={resetFilters}>Reset</button>
					{/if}
					<button class="btn btn-sm btn-primary" type="submit" disabled={loadingEntries || !pendingFilters}>Apply filters</button>
				</div>
			</form>
			<EntrySelectionToolbar {selection} rowCount={visibleRows.length} disabled={loadingEntries} totalLabel="Selected net" />
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr>
							{#if $selection.active}
								<th scope="col" class="entry-selection-cell no-print">
									<input type="checkbox" aria-label="Select all visible entries" checked={allRowsChecked}
										indeterminate={$selection.ids.size > 0 && !allRowsChecked} disabled={loadingEntries || visibleRows.length === 0}
										on:change={(event) => selection.selectAll(event.currentTarget.checked)} />
								</th>
							{/if}
							<th>Date</th><th class="num">Amount</th><th>Remarks</th><th class="actions"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each visibleRows as row (row.id)}
							{@const checked = $selection.ids.has(row.id)}
							<tr class:entry-unselected={$selection.ids.size > 0 && !checked}>
								{#if $selection.active}
									<td class="entry-selection-cell no-print">
										<input type="checkbox" aria-label="Select entry {row.id}" {checked} disabled={loadingEntries}
											on:change={(event) => selection.setChecked(row.id, event.currentTarget.checked)} />
									</td>
								{/if}
								<td>{formatDate(row.date)}</td>
								<td class="num amount"><strong class:pos={row.entry_type === 'credit'} class:neg={row.entry_type === 'debit'}>{formatINR(signedAmount(row))}</strong></td>
								<td class="muted">{row.remarks || '—'}</td>
								<td class="actions">
									<span class="row-actions">
										<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit entry" on:click={() => startEdit(row)}><Icon name="edit" size={15} /></button>
										<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete entry" on:click={() => removeEntry(row)}><Icon name="trash" size={15} /></button>
									</span>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan={$selection.active ? 5 : 4}>
									<div class="empty">
										<span class="empty-icon"><Icon name="clipboard" size={20} /></span>
										<h3>{loadingEntries ? 'Loading…' : activeFilterCount ? 'No entries match these filters' : 'No entries yet'}</h3>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
					{#if !loadingEntries && (visibleRows.length || activeFilterCount)}
						<tfoot>
							<tr>
								{#if $selection.active}<td class="entry-selection-cell no-print"></td>{/if}
								<td>Total credit</td>
								<td class="num"><strong class="pos">{formatINR(totals.credit.amount)}</strong></td>
								<td colspan="2"></td>
							</tr>
							<tr>
								{#if $selection.active}<td class="entry-selection-cell no-print"></td>{/if}
								<td>Total debit</td>
								<td class="num"><strong class="neg">{formatINR(totals.debit.amount)}</strong></td>
								<td colspan="2"></td>
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
			<AmountField id="edit-sheet-amount" bind:value={draft.amount} />
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
