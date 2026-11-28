<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { api } from '$lib/api.js';
	import { PAYOUT_TYPES } from '$lib/constants.js';
	import { downloadCsvTables, slug } from '$lib/csv.js';
	import { formatDate, formatINR, todayIso, plural } from '$lib/format.js';
	import { downloadTablePdf, pdfMoneyColor } from '$lib/pdf.js';
	import { confirmDialog } from '$lib/confirm.js';
	import { createEntrySelection } from '$lib/entry-selection.js';
	import { toast } from '$lib/toast.js';
	import EntrySelectionToolbar from '$lib/components/EntrySelectionToolbar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import FinanceFields from './FinanceFields.svelte';
	import { monthlyBalances } from './balances.js';

	export let data;

	const blank = (date = todayIso(), entry_type = 'finance_taken') => ({
		date, entry_type, entity_id: '', amount: undefined, interest_rate: 1.5, interest_payout: 'monthly', comments: ''
	});
	const money = (paise) => formatINR(paise / 100);
	const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
	const monthLabel = (month) => monthFormatter.format(new Date(`${month}-01T00:00:00Z`));
	const payoutLabel = (value) => PAYOUT_TYPES.find((item) => item.value === value)?.label || value;
	const typeLabel = (row) => row.entry_type === 'payout' ? 'Payout' : 'Finance Taken';
	const matches = (row, query) => `${row.entity_name || ''} ${row.entity_code || ''} ${row.comments || ''} ${typeLabel(row)} ${row.amount}`.toLowerCase().includes(query);
	const selection = createEntrySelection();

	let asOf = todayIso();
	let entities = [];
	let entries = [];
	let lenders = [];
	let loading = true;
	let exporting = false;
	let loadRequest = 0;
	let loadError = '';
	let saving = false;
	let editSaving = false;
	let form = blank();
	let party = '';
	let search = '';
	let showHistory = false;
	let editing = null;
	let draft = null;

	$: selectedParty = lenders.find((entity) => String(entity.id) === party);
	$: scoped = selectedParty ? entries.filter((row) => String(row.entity_id) === String(selectedParty.id)) : entries;
	$: query = search.trim().toLowerCase();
	$: matchingRows = scoped.filter((row) => matches(row, query));
	$: matchingCount = matchingRows.length;
	$: selection.setRows(matchingRows);
	$: allRowsChecked = $selection.ids.size > 0 && $selection.ids.size === matchingCount;
	$: months = monthlyBalances(scoped, asOf);
	$: current = months[0];
	$: hasCredit = months.some((month) => month.credit > 0);

	const load = async () => {
		const request = ++loadRequest;
		loading = true;
		loadError = '';
		try {
			const result = await Promise.all([api('/api/entities'), api('/api/finance')]);
			if (request !== loadRequest) return;
			[entities, entries] = result;
			asOf = todayIso();
			const lenderIds = new Set(entries.filter((row) => row.entry_type === 'finance_taken' && row.date <= asOf).map((row) => row.entity_id));
			lenders = entities.filter((entity) => lenderIds.has(entity.id));
			if (party && !lenders.some((entity) => String(entity.id) === party)) party = '';
		} catch (err) {
			if (request === loadRequest) loadError = err.message;
		} finally {
			if (request === loadRequest) loading = false;
		}
	};

	const submit = async () => {
		if (saving) return;
		if (!form.entity_id) return toast.error('Select an entity.');
		saving = true;
		try {
			await api('/api/finance', { method: 'POST', body: form });
			toast.success(form.entry_type === 'payout' ? 'Payout recorded' : 'Finance taken recorded');
			form = blank(form.date, form.entry_type);
			await load();
		} catch (err) {
			toast.error(err.message);
		} finally {
			saving = false;
		}
	};

	const startEdit = (row) => {
		draft = {
			...blank(row.date, row.entry_type),
			entity_id: row.entity_id ? String(row.entity_id) : '',
			amount: row.amount,
			interest_rate: row.entry_type === 'payout' ? 1.5 : row.interest_rate,
			interest_payout: row.interest_payout,
			comments: row.comments || ''
		};
		editing = row;
	};

	const saveEdit = async () => {
		if (editSaving) return;
		if (!draft.entity_id) return toast.error('Select an entity.');
		editSaving = true;
		try {
			await api(`/api/finance/${editing.id}`, { method: 'PUT', body: draft });
			toast.success('Finance entry updated');
			editing = null;
			await load();
		} catch (err) {
			toast.error(err.message);
		} finally {
			editSaving = false;
		}
	};

	const remove = async (row) => {
		const ok = await confirmDialog({
			title: `Delete this ${typeLabel(row).toLowerCase()} entry?`,
			message: `${formatINR(row.amount)} · ${row.entity_name || 'Removed entity'} · ${formatDate(row.date)}`
		});
		if (!ok) return;
		try {
			await api(`/api/finance/${row.id}`, { method: 'DELETE' });
			toast.success('Finance entry deleted');
			await load();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const exportStatement = async (format) => {
		const isPdf = format === 'pdf';
		const moneyColumn = (label, field) => ({
			label, numeric: true, value: (row) => isPdf ? money(row[field]) : row[field] / 100
		});
		const sections = [
			{
				title: 'Monthly balances', rows: months,
				columns: [
					{ label: 'Month', value: (row) => isPdf ? monthLabel(row.month) : row.month },
					moneyColumn('Opening owed', 'opening'), moneyColumn('Finance taken', 'taken'),
					moneyColumn('Interest accrued', 'interest'), moneyColumn('Payouts', 'payouts'),
					moneyColumn('Interest outstanding', 'outstandingInterest'), moneyColumn('Interest due', 'due'),
					...(hasCredit ? [moneyColumn('Unapplied payouts', 'credit')] : []), moneyColumn('Net owed', 'owed')
				]
			},
			{
				title: 'Finance activity', rows: matchingRows,
				columns: [
					{ label: 'Date', width: 76, value: (row) => isPdf ? formatDate(row.date) : row.date },
					{ label: 'Entity', value: (row) => row.entity_name || 'Removed entity' },
					{ label: 'Amount', width: 85, numeric: true, value: (row) => isPdf ? formatINR(row.amount) : row.amount, color: (row) => pdfMoneyColor(row.entry_type === 'payout') },
					{ label: 'Type', width: 70, value: typeLabel },
					{ label: 'Interest terms', value: (row) => row.entry_type === 'payout' ? '' : `${row.interest_rate}% / month · ${payoutLabel(row.interest_payout)}` },
					{ label: 'Comments', value: (row) => row.comments }
				]
			}
		];
		const filename = `${slug(data.company.name)}-finance${selectedParty ? `-${slug(selectedParty.name)}` : ''}-${asOf}.${format}`;
		exporting = true;
		try {
			if (isPdf) {
				await downloadTablePdf(filename, {
					title: 'Finance statement', subtitle: data.company.name,
					details: [
						`Through ${formatDate(asOf)} · ${selectedParty?.name || 'All entities'}`,
						`Currently owed ${money(current.owed)} · Principal ${money(current.principal)} · Outstanding interest ${money(current.outstandingInterest)}`,
						query && `Activity search: ${search.trim()}`
					],
					landscape: true, sections
				});
			} else {
				downloadCsvTables(filename, sections);
			}
		} catch (err) {
			toast.error(err.message);
		} finally {
			exporting = false;
		}
	};

	onMount(load);
</script>

<div class="finance-workspace">
	<header class="page-header">
		<div>
			<p class="eyebrow">{data.company.name}</p>
			<h1>Finance</h1>
			<p class="no-print">Track borrowings, interest and payments in your independent finance book.</p>
			<p class="print-only">Finance statement through {formatDate(asOf)} · {selectedParty?.name || 'All entities'}</p>
		</div>
		<div class="page-actions no-print">
			<button type="button" class="btn" disabled={exporting || loading || !!loadError} on:click={() => exportStatement('csv')}>
				<Icon name="download" size={16} /> Export CSV
			</button>
			<button type="button" class="btn" disabled={exporting || loading || !!loadError} on:click={() => exportStatement('pdf')}>
				<Icon name="download" size={16} /> Export PDF
			</button>
		</div>
	</header>

	{#if loadError}
		<div class="load-error" role="alert">
			<span>Finance could not be loaded. {loadError}</span>
			<button class="btn btn-sm" type="button" on:click={load}>Retry</button>
		</div>
	{/if}

	<section class="card entry-card no-print">
		<div class="card-header">
			<div>
				<h2>Add entry</h2>
				<p>{form.entry_type === 'payout' ? 'Record a payment made to a party.' : 'Record money borrowed and its interest terms.'}</p>
			</div>
		</div>
		<form class="card-body" on:submit|preventDefault={submit}>
			<FinanceFields bind:value={form} {entities} prefix="finance-new" />
			<div class="form-actions">
				<button class="btn btn-primary" type="submit" disabled={saving || loading || !!loadError}>
					<Icon name="plus" size={15} />
					{saving ? 'Saving…' : form.entry_type === 'payout' ? 'Add payout' : 'Add finance taken'}
				</button>
			</div>
		</form>
	</section>

	<section class="balance-section" aria-labelledby="finance-balances">
		<div class="balance-heading">
			<div>
				<h2 id="finance-balances">Monthly balances</h2>
				<p>As of {formatDate(asOf)}</p>
			</div>
			<div class="scope no-print">
				<label class="label" for="finance-lender">Lender</label>
				<select id="finance-lender" class="select" bind:value={party} disabled={!lenders.length}>
					<option value="">All entities</option>
					{#each lenders as entity (entity.id)}
						<option value={String(entity.id)}>{entity.name}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="kpi-grid balance-kpis">
			<article class="kpi owed-kpi">
				<span class="kpi-label">Currently owed</span>
				<span class="kpi-value" class:skeleton={loading}>{loadError ? '—' : money(current.owed)}</span>
				<span class="kpi-foot">{monthLabel(current.month)}</span>
			</article>
			<article class="kpi">
				<span class="kpi-label">Outstanding principal</span>
				<span class="kpi-value" class:skeleton={loading}>{loadError ? '—' : money(current.principal)}</span>
				<span class="kpi-foot">{current.credit ? `${money(current.credit)} in unapplied payouts` : 'Borrowed balance'}</span>
			</article>
			<article class="kpi">
				<span class="kpi-label">Outstanding interest</span>
				<span class="kpi-value" class:skeleton={loading}>{loadError ? '—' : money(current.outstandingInterest)}</span>
				<span class="kpi-foot">{loadError ? 'Interest due' : `${money(current.due)} due under payout cycles`}</span>
			</article>
		</div>

		<div class="card statement">
			{#if loading || loadError}
				<div class="empty"><h3>{loading ? 'Loading balances…' : 'Balances unavailable'}</h3></div>
			{:else}
				<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll wide tables.) -->
				<div class="table-wrap" role="region" aria-label="Monthly balance table" tabindex="0">
					<table class="table balance-table">
						<thead>
							<tr>
								<th scope="col">Month</th><th scope="col" class="num">Opening owed</th>
								<th scope="col" class="num">Finance taken</th><th scope="col" class="num">Interest accrued</th>
								<th scope="col" class="num">Payouts</th><th scope="col" class="num">Interest outstanding</th>
								{#if hasCredit}<th scope="col" class="num">Unapplied payouts</th>{/if}
								<th scope="col" class="num net-column">Net owed</th>
							</tr>
						</thead>
						<tbody>
							{#each months as month, index (month.month)}
								<tr class:current-month={index === 0} class:earlier={index >= 12 && !showHistory}>
									<td class="primary">{monthLabel(month.month)}</td>
									<td class="num">{money(month.opening)}</td>
									<td class="num"><strong class:neg={month.taken}>{month.taken ? money(month.taken) : '—'}</strong></td>
									<td class="num">{month.interest ? money(month.interest) : '—'}</td>
									<td class="num"><strong class:pos={month.payouts}>{month.payouts ? `−${money(month.payouts)}` : '—'}</strong></td>
									<td class="num">
										{money(month.outstandingInterest)}
										{#if month.due < month.outstandingInterest}<span class="cell-sub">{money(month.due)} due</span>{/if}
									</td>
									{#if hasCredit}<td class="num">{money(month.credit)}</td>{/if}
									<td class="num net-column"><strong>{money(month.owed)}</strong></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="statement-footer">
					<p>Interest starts one month after the borrowing date and posts on that day each month, before any same-day payouts. Shorter months use their last day. Interest comes due at the selected payout cycle, and overdue interest earns interest at the next monthly anniversary. Payouts cover the same lender’s interest first, then the oldest principal. Any excess carries forward.</p>
					{#if months.length > 12}
						<button class="btn btn-sm no-print" type="button" aria-expanded={showHistory} on:click={() => (showHistory = !showHistory)}>
							{showHistory ? 'Show recent months' : 'Show earlier months'}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	<section class="card entries-card">
		<div class="card-header">
			<div>
				<h2>Finance activity</h2>
				<p class="no-print">{loading ? 'Loading entries…' : `${matchingCount} of ${plural(scoped.length, 'entry', 'entries')}`}</p>
			</div>
			<label class="search no-print">
				<Icon name="search" size={15} />
				<input class="input" bind:value={search} placeholder="Search activity" aria-label="Search finance activity" />
			</label>
		</div>
		<EntrySelectionToolbar {selection} rowCount={matchingCount} disabled={loading || !!loadError} />
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll wide tables.) -->
		<div class="table-wrap" role="region" aria-label="Finance activity table" tabindex="0">
			<table class="table activity-table">
				<thead>
					<tr>
						{#if $selection.active}
							<th scope="col" class="entry-selection-cell no-print">
								<input type="checkbox" aria-label="Select all visible entries" checked={allRowsChecked}
									indeterminate={$selection.ids.size > 0 && !allRowsChecked} disabled={loading || !!loadError || matchingCount === 0}
									on:change={(event) => selection.selectAll(event.currentTarget.checked)} />
							</th>
						{/if}
						<th scope="col">Date</th><th scope="col">Entity</th><th scope="col" class="num">Amount</th>
						<th scope="col">Type</th><th scope="col">Interest terms</th><th scope="col">Comments</th>
						<th scope="col" class="actions no-print"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each scoped as row (row.id)}
						{@const payout = row.entry_type === 'payout'}
						{@const checked = $selection.ids.has(row.id)}
						<tr class:search-hidden={!matches(row, query)} class:entry-unselected={$selection.ids.size > 0 && !checked}>
							{#if $selection.active}
								<td class="entry-selection-cell no-print">
									<input type="checkbox" aria-label="Select entry {row.id}" {checked} disabled={loading || !!loadError}
										on:change={(event) => selection.setChecked(row.id, event.currentTarget.checked)} />
								</td>
							{/if}
							<td class="date-cell">
								{formatDate(row.date)}
								{#if row.date > asOf}<span class="cell-sub">Scheduled</span>{/if}
							</td>
							<td class="primary">{row.entity_name || 'Removed entity'}{#if row.entity_code}<span class="cell-sub">{row.entity_code}</span>{/if}</td>
							<td class="num activity-amount"><strong class:pos={payout} class:neg={!payout}>{formatINR(row.amount)}</strong></td>
							<td><span class="type-badge" class:payout>{typeLabel(row)}</span></td>
							<td class="terms">{#if payout}—{:else}{row.interest_rate}% / month<span class="cell-sub">{payoutLabel(row.interest_payout)} payout</span>{/if}</td>
							<td>{row.comments || '—'}</td>
							<td class="actions no-print">
								<span class="row-actions">
									<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit entry" title="Edit entry" on:click={() => startEdit(row)}><Icon name="edit" size={15} /></button>
									<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete entry" title="Delete entry" on:click={() => remove(row)}><Icon name="trash" size={15} /></button>
								</span>
							</td>
						</tr>
					{/each}
					{#if !matchingCount}
						<tr class:no-print={scoped.length > 0}><td colspan={$selection.active ? 8 : 7}>
							<div class="empty"><h3>{loading ? 'Loading…' : scoped.length ? 'No matching entries' : 'No finance activity yet'}</h3></div>
						</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</section>
</div>

<Modal open={Boolean(editing)} title="Edit finance entry" width="680px" on:close={() => (editing = null)}>
	{#if draft}
		<form id="finance-edit" on:submit|preventDefault={saveEdit}>
			<FinanceFields bind:value={draft} {entities} prefix="finance-edit" />
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => (editing = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="finance-edit" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
	</svelte:fragment>
</Modal>

<style>
	.print-only { display: none; }
	.load-error, .form-actions, .balance-heading, .statement-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.load-error { background: var(--neg-soft); color: var(--neg); padding: 12px; border-radius: var(--radius); margin-bottom: 16px; }
	.form-actions { justify-content: flex-end; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
	.balance-section, .entries-card { margin-top: 28px; }
	.balance-heading { align-items: end; margin-bottom: 12px; }
	.balance-heading p { color: var(--muted); font-size: 13px; margin-top: 4px; }
	.scope { display: grid; gap: 4px; width: min(240px, 48%); }
	.balance-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 12px; }
	.kpi { min-width: 0; }
	.kpi-value { white-space: normal; overflow-wrap: anywhere; }
	.owed-kpi { border-color: var(--accent-border); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
	.balance-table { min-width: 780px; }
	.balance-table .num, .date-cell, .activity-amount, .terms { white-space: nowrap; }
	.balance-table td, .activity-amount { font-variant-numeric: tabular-nums; }
	.balance-table td.net-column, .balance-table th.net-column { background: var(--surface-2); color: var(--text); }
	.current-month td, .balance-table .current-month td.net-column { background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
	.balance-table td strong, .activity-amount strong { font-weight: 700; }
	.earlier, .search-hidden { display: none; }
	.statement-footer { align-items: start; padding: 12px 14px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
	.statement-footer button { flex: none; }
	.search { display: flex; position: relative; align-items: center; width: min(240px, 100%); color: var(--muted); }
	.search :global(svg) { position: absolute; left: 10px; pointer-events: none; }
	.search input { padding-left: 32px; }
	.activity-table { min-width: 680px; }
	.activity-table td { overflow-wrap: anywhere; }
	.activity-table td.primary { min-width: 132px; }
	.type-badge { display: inline-block; white-space: nowrap; padding: 2px 7px; border-radius: 6px; background: var(--neg-soft); color: var(--neg); font-size: 12px; font-weight: 650; }
	.type-badge.payout { background: var(--pos-soft); color: var(--pos); }
	.table-wrap:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	@media (max-width: 700px) {
		.balance-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.owed-kpi { grid-column: 1 / -1; }
		.kpi-value { font-size: 20px; }
		.statement-footer { flex-wrap: wrap; }
	}
	@media print {
		@page finance-statement {
			size: A4 landscape;
			margin: 12mm;
			background: #fff;
			@bottom-right {
				content: "Page " counter(page) " of " counter(pages);
				color: #475467;
				font-size: 9pt;
			}
		}
		:global(html:has(.finance-workspace)) { color-scheme: light !important; }
		.finance-workspace { page: finance-statement; }
		.print-only { display: block; }
		.page-header { margin-bottom: 14px; }
		.balance-section, .entries-card { margin-top: 16px; }
		.balance-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); break-inside: avoid; }
		.kpi, .owed-kpi { grid-column: auto; border: 1px solid #d0d5dd; background: #fff; box-shadow: none; }
		.kpi-value { font-size: 21px; color: #101828; }
		.kpi-label, .kpi-foot, .balance-heading p, .statement-footer, .cell-sub, .eyebrow, .print-only { color: #475467; }
		.card { border: 1px solid #d0d5dd; box-shadow: none; overflow: visible; background: #fff; }
		h1, h2, .table td, .table td.primary, .balance-table td.net-column { color: #101828; }
		.table th, .balance-table th.net-column { color: #344054; background: #f2f4f7; white-space: normal; }
		.table td, .table th { padding: 6px 8px; border-color: #d0d5dd; }
		.balance-table td, .balance-table td.net-column, .balance-table .current-month td.net-column { background: #fff; }
		.table-wrap { overflow: visible; }
		.table { min-width: 0; font-size: 10px; }
		.balance-table .num { white-space: normal; }
		.table thead { display: table-header-group; }
		.table tr { break-inside: avoid; }
		.earlier, .search-hidden { display: table-row; }
		.type-badge { background: transparent; padding-inline: 0; }
		.type-badge, strong.neg { color: #b42318; }
		.type-badge.payout, strong.pos { color: #067647; }
	}
</style>
