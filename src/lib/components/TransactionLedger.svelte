<script>
	// @ts-nocheck
	import { onMount, tick } from 'svelte';
	import { api, companyKey, storage } from '$lib/api.js';
	import { PAYMENT_MODES } from '$lib/constants.js';
	import { formatDate, formatINR, formatTimestamp, labelize, plural, todayIso } from '$lib/format.js';
	import { downloadCsv, slug } from '$lib/csv.js';
	import { confirmDialog } from '$lib/confirm.js';
	import { toast } from '$lib/toast.js';
	import Icon from './Icon.svelte';
	import Modal from './Modal.svelte';
	import Pagination from './Pagination.svelte';
	import TransactionForm from './TransactionForm.svelte';

	/** 'income' | 'expense' */
	export let kind;
	export let company;

	const PAGE_SIZE = 100;
	const isIncome = kind === 'income';
	const label = isIncome ? 'Income' : 'Expense';
	const endpoint = isIncome ? '/api/income' : '/api/expenses';
	const sourceField = isIncome ? 'credit_source' : 'expense_source';
	const SUBTYPE_PATTERN = /material|service|utility/i;
	const COLUMN_DEFS = [
		{ key: 'timestamp', label: 'Entered on' },
		{ key: 'projects', label: 'Projects' },
		{ key: 'type', label: 'Mode' },
		{ key: 'source', label: 'Category' },
		{ key: 'head', label: 'Master balance' },
		{ key: 'account', label: 'Account' }
	];
	const EMPTY_FILTERS = {
		q: '',
		start: '',
		end: '',
		entityId: 'all',
		projectId: 'all',
		paymentMode: 'all',
		source: 'all',
		head: 'all',
		timestampFrom: '',
		timestampTo: ''
	};

	const keys = {
		date: companyKey(`${kind}-form-date`),
		project: companyKey('default-project'),
		columns: `ledger:${kind}-columns`,
		entityComments: `ledger:${kind}-entity-comments`
	};

	let entities = [];
	let entityTypes = [];
	let projects = [];
	let accounts = [];
	let sources = [];
	let heads = [];
	let mastersLoaded = false;

	let rows = [];
	let pagination = { page: 1, totalPages: 1, totalCount: 0, totalAmount: 0 };
	let page = 1;
	let loading = true;
	let saving = false;
	let exporting = false;

	let filters = { ...EMPTY_FILTERS };
	let applied = { ...EMPTY_FILTERS };
	let showMoreFilters = false;
	let columns = readColumns();
	let showEntityComments = storage.get(keys.entityComments) === '1';

	let form = blankForm();
	let amountInput;
	let editing = null;
	let draft = null;
	let editSaving = false;

	function readColumns() {
		try {
			const stored = JSON.parse(storage.get(keys.columns, '{}'));
			return Object.fromEntries(COLUMN_DEFS.map((column) => [column.key, Boolean(stored[column.key])]));
		} catch {
			return {};
		}
	}

	function blankForm(date = '') {
		return {
			date,
			amount: '',
			entity_id: '',
			project_ids: [],
			account_id: '',
			payment_mode: 'cash',
			[sourceField]: sources.includes('other') ? 'other' : sources[0] || 'other',
			material_type: '',
			service_type: '',
			utility_type: '',
			master_owner: heads[0]?.code || '',
			comments: ''
		};
	}

	const defaultProject = () => {
		// Fall back once to the default project saved by the single-company version.
		const id = storage.get(keys.project) || storage.get('balaji-default-project-id');
		return id && projects.some((project) => String(project.id) === id) ? [id] : [];
	};

	const toPayload = (values) => {
		const payload = { ...values, account_id: values.payment_mode === 'account' ? values.account_id : '' };
		if (!isIncome && !SUBTYPE_PATTERN.test(values.expense_source || '')) {
			payload.material_type = '';
			payload.service_type = '';
			payload.utility_type = '';
		}
		return payload;
	};

	const validate = (values) => {
		if (!values.date) return 'Choose a date.';
		if (!(Number(values.amount) > 0)) return 'Enter an amount greater than zero.';
		if (!values.entity_id) return 'Select an entity.';
		if (values.payment_mode === 'account' && !values.account_id) return 'Select an account for account transactions.';
		return '';
	};

	const queryString = (extra = {}) => {
		const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...extra });
		for (const [key, value] of Object.entries(applied)) {
			if (value && value !== 'all') params.set(key, value);
		}
		return params.toString();
	};

	const loadMasters = async () => {
		const [entityRows, projectRows, accountRows, options, headRows] = await Promise.all([
			api('/api/entities'),
			api('/api/projects'),
			api('/api/accounts'),
			api('/api/master-options'),
			api('/api/heads')
		]);
		entities = entityRows;
		entityTypes = options.entity_types;
		projects = projectRows;
		accounts = accountRows;
		sources = isIncome ? options.credit_sources : options.expense_sources;
		heads = headRows;
		mastersLoaded = true;
	};

	const loadRows = async () => {
		loading = true;
		try {
			const payload = await api(`${endpoint}?${queryString()}`);
			rows = payload.rows;
			pagination = payload.pagination;
			page = pagination.page;
		} catch (err) {
			toast.error(err.message);
		} finally {
			loading = false;
		}
	};

	/*
	 * Expenses repeat the last *entered* expense (by entry time, not by its ledger date):
	 * its date, source, projects and master balance carry over to the next form.
	 */
	const carryOver = (entry) => {
		const source = entry[sourceField];
		return {
			date: entry.date,
			[sourceField]: source || blankForm()[sourceField],
			project_ids: (entry.project_ids || []).map(String).filter((id) => projects.some((project) => String(project.id) === id)),
			master_owner: heads.some((head) => head.code === entry.master_owner) ? entry.master_owner : blankForm().master_owner
		};
	};

	const initForm = async () => {
		if (!isIncome) {
			try {
				const lastEntered = (await api(`${endpoint}?limit=1&sort=entered`)).rows[0];
				if (/^\d{4}-\d{2}-\d{2}$/.test(lastEntered?.date || '')) {
					form = { ...blankForm(), ...carryOver(lastEntered) };
					return;
				}
			} catch {
				/* fall through to the stored defaults */
			}
		}
		// Default date: the latest entry's date, else the last date used here, else today.
		let latestDate = '';
		let latestProject = '';
		try {
			const latest = await api(`${endpoint}?limit=1`);
			latestDate = latest.rows[0]?.date || '';
			latestProject = latest.rows[0]?.project_ids?.[0] ? String(latest.rows[0].project_ids[0]) : '';
		} catch {
			/* fall through to stored values */
		}
		if (!storage.get(keys.project) && latestProject) storage.set(keys.project, latestProject);
		const date = /^\d{4}-\d{2}-\d{2}$/.test(latestDate) ? latestDate : storage.get(keys.date) || todayIso();
		form = { ...blankForm(date), project_ids: defaultProject() };
	};

	const applyFilters = async () => {
		applied = { ...filters };
		page = 1;
		await loadRows();
	};

	const resetFilters = async () => {
		filters = { ...EMPTY_FILTERS };
		await applyFilters();
	};

	const changePage = async (event) => {
		page = event.detail;
		await loadRows();
		document.querySelector('.ledger-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	};

	const submit = async () => {
		const problem = validate(form);
		if (problem) return toast.error(problem);
		saving = true;
		try {
			await api(endpoint, { method: 'POST', body: toPayload(form) });
			toast.success(`${label} of ${formatINR(form.amount)} added`);
			// The entry just saved is now the last one entered, so expenses keep its choices.
			form = isIncome
				? { ...blankForm(form.date), project_ids: defaultProject() }
				: { ...blankForm(), ...carryOver(form) };
			page = 1;
			await loadRows();
			await tick();
			amountInput?.focus();
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
			amount: row.amount,
			entity_id: row.entity_id ? String(row.entity_id) : '',
			project_ids: (row.project_ids || []).map(String),
			account_id: row.account_id ? String(row.account_id) : '',
			payment_mode: row.payment_mode,
			[sourceField]: row[sourceField],
			material_type: row.material_type || '',
			service_type: row.service_type || '',
			utility_type: row.utility_type || '',
			master_owner: row.master_owner,
			comments: row.comments || ''
		};
	};

	const saveEdit = async () => {
		const problem = validate(draft);
		if (problem) return toast.error(problem);
		editSaving = true;
		try {
			await api(`${endpoint}/${editing.id}`, { method: 'PUT', body: toPayload(draft) });
			toast.success(`${label} updated`);
			editing = null;
			await loadRows();
		} catch (err) {
			toast.error(err.message);
		} finally {
			editSaving = false;
		}
	};

	const remove = async (row) => {
		const ok = await confirmDialog({
			title: `Delete this ${label.toLowerCase()}?`,
			message: `${formatINR(row.amount)} · ${row.entity_name || 'No entity'} · ${formatDate(row.date)}. ${row.account_id ? 'The linked account balance will be adjusted back. ' : ''}This cannot be undone.`
		});
		if (!ok) return;
		try {
			await api(`${endpoint}/${row.id}`, { method: 'DELETE' });
			toast.success(`${label} deleted`);
			if (editing?.id === row.id) editing = null;
			await loadRows();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const exportCsv = async () => {
		exporting = true;
		try {
			const payload = await api(`${endpoint}?${queryString({ all: '1' })}`);
			downloadCsv(
				`${slug(company.name)}-${kind}-${todayIso()}.csv`,
				[
					{ label: 'Date', value: (row) => row.date },
					{ label: 'Entity', value: (row) => row.entity_name },
					{ label: 'Entity code', value: (row) => row.entity_code },
					...(isIncome ? [] : [{ label: 'Comments', value: (row) => row.comments }]),
					{ label: 'Projects', value: (row) => row.project_names },
					{ label: 'Mode', value: (row) => row.payment_mode },
					{ label: 'Account', value: (row) => (row.account_holder ? `${row.account_holder} (${row.bank_name})` : '') },
					{ label: 'Category', value: (row) => row.source },
					...(isIncome
						? []
						: [
								{ label: 'Material type', value: (row) => row.material_type },
								{ label: 'Service type', value: (row) => row.service_type },
								{ label: 'Utility type', value: (row) => row.utility_type }
							]),
					{ label: 'Master balance', value: (row) => row.head_name || row.master_owner },
					{ label: 'Amount', value: (row) => row.amount },
					...(isIncome ? [{ label: 'Comments', value: (row) => row.comments }] : []),
					{ label: 'Entered on', value: (row) => row.created_at }
				],
				payload.rows
			);
			toast.success(`Exported ${payload.rows.length} entries`);
		} catch (err) {
			toast.error(err.message);
		} finally {
			exporting = false;
		}
	};

	const toggleColumn = (key) => {
		columns = { ...columns, [key]: !columns[key] };
		storage.set(keys.columns, JSON.stringify(columns));
	};

	$: storage.set(keys.entityComments, showEntityComments ? '1' : '0');
	$: if (form.date) storage.set(keys.date, form.date);
	// Remember the most recently picked project as the default for the next entry.
	$: if (mastersLoaded && form.project_ids?.length) storage.set(keys.project, String(form.project_ids.at(-1)));
	$: pendingFilters = JSON.stringify(filters) !== JSON.stringify(applied);
	$: activeFilterCount = Object.entries(applied).filter(([key, value]) => value && value !== 'all' && EMPTY_FILTERS[key] !== value).length;
	$: extraFilterCount = ['paymentMode', 'source', 'head', 'timestampFrom', 'timestampTo'].filter((key) => filters[key] && filters[key] !== 'all').length;
	$: visibleColumnCount = 4 + Object.values(columns).filter(Boolean).length;

	onMount(async () => {
		try {
			await loadMasters();
		} catch (err) {
			toast.error(err.message);
		}
		await Promise.all([initForm(), loadRows()]);
	});
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{company.name}</p>
		<h1>{label === 'Income' ? 'Income' : 'Expenses'}</h1>
		<p>{isIncome ? 'Record money coming in and map it to entities, projects and accounts.' : 'Record money going out with its entity, project, account and category.'}</p>
	</div>
</header>

<section class="card entry-card">
	<div class="card-header">
		<div>
			<h2>New {label.toLowerCase()} entry</h2>
			<p>Press Enter in any field to save. The form keeps your date and default project.</p>
		</div>
	</div>
	<form class="card-body" on:submit|preventDefault={submit}>
		{#if mastersLoaded && heads.length > 0}
			<TransactionForm {kind} bind:value={form} bind:amountInput {entities} {entityTypes} {projects} {accounts} {sources} {heads} idPrefix="new-{kind}" />
			{#if entities.length === 0}
				<p class="notice"><Icon name="info" size={14} /> Add an entity in <a href="/masters?tab=entities">Masters</a> before recording entries.</p>
			{/if}
			<div class="form-actions">
				<button class="btn" type="button" on:click={() => (form = { ...blankForm(form.date), project_ids: defaultProject() })}>Clear</button>
				<button class="btn btn-primary" type="submit" disabled={saving}>
					<Icon name="plus" size={15} />
					{saving ? 'Saving…' : `Add ${label.toLowerCase()}`}
				</button>
			</div>
		{:else if mastersLoaded}
			<p class="notice"><Icon name="info" size={14} /> Add a master balance in <a href="/masters?tab=balances">Masters</a> first.</p>
		{:else}
			<div class="skeleton" style="height: 180px"></div>
		{/if}
	</form>
</section>

<section class="card ledger-card">
	<div class="card-header">
		<div>
			<h2>{isIncome ? 'Income' : 'Expense'} ledger</h2>
			<p>
				{plural(pagination.totalCount, 'entry', 'entries')} · <strong class="amount">{formatINR(pagination.totalAmount)}</strong>
				{#if activeFilterCount > 0}<span class="badge badge-accent">{activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}</span>{/if}
			</p>
		</div>
		<div class="page-actions">
			<button class="btn btn-sm" type="button" on:click={exportCsv} disabled={exporting || pagination.totalCount === 0}>
				<Icon name="download" size={14} />
				{exporting ? 'Exporting…' : 'Export CSV'}
			</button>
		</div>
	</div>

	<form class="filters" on:submit|preventDefault={applyFilters}>
		<div class="toolbar">
			<label class="field grow">
				<span class="label">Search</span>
				<span class="search">
					<Icon name="search" size={14} />
					<input class="input" bind:value={filters.q} placeholder="Comments, entity, project, amount…" />
				</span>
			</label>
			<label class="field">
				<span class="label">Entity</span>
				<select class="select" bind:value={filters.entityId}>
					<option value="all">All entities</option>
					{#each entities as entity (entity.id)}<option value={String(entity.id)}>{entity.name} ({entity.entity_code})</option>{/each}
				</select>
			</label>
			<label class="field">
				<span class="label">Project</span>
				<select class="select" bind:value={filters.projectId}>
					<option value="all">All projects</option>
					{#each projects as project (project.id)}<option value={String(project.id)}>{project.property_name}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span class="label">Date from</span>
				<input class="input" type="date" bind:value={filters.start} />
			</label>
			<label class="field">
				<span class="label">Date to</span>
				<input class="input" type="date" bind:value={filters.end} />
			</label>
		</div>

		{#if showMoreFilters}
			<div class="toolbar more">
				<label class="field">
					<span class="label">Mode</span>
					<select class="select" bind:value={filters.paymentMode}>
						<option value="all">All modes</option>
						{#each PAYMENT_MODES as mode}<option value={mode}>{labelize(mode)}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span class="label">Category</span>
					<select class="select" bind:value={filters.source}>
						<option value="all">All categories</option>
						{#each sources as source}<option value={source}>{labelize(source)}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span class="label">Master balance</span>
					<select class="select" bind:value={filters.head}>
						<option value="all">All</option>
						{#each heads as head (head.id)}<option value={head.code}>{head.name}</option>{/each}
					</select>
				</label>
				<label class="field">
					<span class="label">Entered from</span>
					<input class="input" type="date" bind:value={filters.timestampFrom} />
				</label>
				<label class="field">
					<span class="label">Entered to</span>
					<input class="input" type="date" bind:value={filters.timestampTo} />
				</label>
			</div>
		{/if}

		<div class="filter-actions">
			<button class="btn btn-sm btn-ghost" type="button" on:click={() => (showMoreFilters = !showMoreFilters)}>
				<Icon name="filter" size={14} />
				{showMoreFilters ? 'Fewer filters' : 'More filters'}
				{#if !showMoreFilters && extraFilterCount > 0}<span class="badge badge-accent">{extraFilterCount}</span>{/if}
			</button>
			<span class="spacer"></span>
			{#if pendingFilters}<span class="pending">Filters changed — apply to refresh</span>{/if}
			{#if activeFilterCount > 0 || pendingFilters}
				<button class="btn btn-sm btn-ghost" type="button" on:click={resetFilters}>Reset</button>
			{/if}
			<button class="btn btn-sm btn-primary" type="submit" disabled={loading || !pendingFilters}>Apply filters</button>
		</div>
	</form>

	<div class="columns-bar">
		<span class="muted"><Icon name="columns" size={14} /> Columns</span>
		{#each COLUMN_DEFS as column}
			<button type="button" class="toggle-chip" class:on={columns[column.key]} aria-pressed={columns[column.key]} on:click={() => toggleColumn(column.key)}>
				{#if columns[column.key]}<Icon name="check" size={12} stroke={2.5} />{/if}
				{column.label}
			</button>
		{/each}
		{#if isIncome}
			<label class="check entity-comments-toggle">
				<input type="checkbox" bind:checked={showEntityComments} />
				Entity comments
			</label>
		{/if}
	</div>

	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Date</th>
					{#if columns.timestamp}<th>Entered on</th>{/if}
					<th>Entity</th>
					{#if !isIncome}
						<th class="center">Comments</th>
						<th class="num">Amount</th>
						{#if columns.head}<th class="center">Master balance</th>{/if}
					{/if}
					{#if columns.projects}<th>Projects</th>{/if}
					{#if columns.type}<th>Mode</th>{/if}
					{#if columns.source}<th>Category</th>{/if}
					{#if isIncome && columns.head}<th>Master balance</th>{/if}
					{#if columns.account}<th>Account</th>{/if}
					{#if isIncome}<th class="num">Amount</th>{/if}
					{#if isIncome}<th>Comments</th>{/if}
					<th class="actions"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#if loading && rows.length === 0}
					{#each Array(5) as _}
						<tr>
							<td colspan={visibleColumnCount + 1}><div class="skeleton" style="height: 18px"></div></td>
						</tr>
					{/each}
				{:else if rows.length === 0}
					<tr>
						<td colspan={visibleColumnCount + 1}>
							<div class="empty">
								<span class="empty-icon"><Icon name={isIncome ? 'income' : 'expense'} size={20} /></span>
								<h3>{activeFilterCount > 0 ? 'No entries match these filters' : `No ${label.toLowerCase()} entries yet`}</h3>
								<p>{activeFilterCount > 0 ? 'Try widening the filters or reset them.' : 'Entries you add above will appear here.'}</p>
							</div>
						</td>
					</tr>
				{:else}
					{#each rows as row (row.id)}
						<tr class:dim={loading}>
							<td class="nowrap">{formatDate(row.date)}</td>
							{#if columns.timestamp}<td class="nowrap muted">{formatTimestamp(row.created_at)}</td>{/if}
							<td class="primary">
								{row.entity_name || '—'}
								{#if row.entity_code || (isIncome && showEntityComments && row.entity_comments)}
									<span class="cell-sub">
										{#if row.entity_code}{labelize(row.entity_type)}{/if}
										{#if isIncome && showEntityComments && row.entity_comments}({row.entity_comments}){/if}
									</span>
								{/if}
							</td>
							{#if !isIncome}
								<td class="comments center"><span class="cell-clamp" title={row.comments || ''}>{row.comments || '—'}</span></td>
								<td class="num amount">{formatINR(row.amount)}</td>
								{#if columns.head}<td class="center">{row.head_name || row.master_owner}</td>{/if}
							{/if}
							{#if columns.projects}<td>{row.project_names || '—'}</td>{/if}
							{#if columns.type}<td><span class="badge">{labelize(row.payment_mode)}</span></td>{/if}
							{#if columns.source}
								<td>
									{labelize(row.source)}
									{#if row.material_type || row.service_type || row.utility_type}
										<span class="cell-sub">{[row.material_type, row.service_type, row.utility_type].filter(Boolean).map((item) => labelize(item.replace(/^(MATERIAL|SERVICE|UTILITY|BILL)_/, ''))).join(' · ')}</span>
									{/if}
								</td>
							{/if}
							{#if isIncome && columns.head}<td>{row.head_name || row.master_owner}</td>{/if}
							{#if columns.account}<td>{row.account_holder ? `${row.account_holder}` : '—'}{#if row.bank_name}<span class="cell-sub">{row.bank_name}</span>{/if}</td>{/if}
							{#if isIncome}<td class="num amount pos">{formatINR(row.amount)}</td>{/if}
							{#if isIncome}<td class="comments"><span class="cell-clamp" title={row.comments || ''}>{row.comments || '—'}</span></td>{/if}
							<td class="actions">
								<span class="row-actions">
									<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit entry" title="Edit" on:click={() => startEdit(row)}><Icon name="edit" size={15} /></button>
									<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete entry" title="Delete" on:click={() => remove(row)}><Icon name="trash" size={15} /></button>
								</span>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<div class="card-footer">
		<Pagination page={pagination.page} totalPages={pagination.totalPages} totalCount={pagination.totalCount} pageSize={PAGE_SIZE} disabled={loading} on:change={changePage} />
	</div>
</section>

<Modal open={Boolean(editing)} title="Edit {label.toLowerCase()}" description={editing ? `Entry #${editing.id} · entered ${formatTimestamp(editing.created_at)}` : ''} width="760px" on:close={() => (editing = null)}>
	{#if draft}
		<form id="edit-{kind}" on:submit|preventDefault={saveEdit}>
			<TransactionForm {kind} bind:value={draft} {entities} {entityTypes} {projects} {accounts} {sources} {heads} idPrefix="edit-{kind}" />
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn btn-ghost btn-danger-ghost delete-left" type="button" on:click={() => remove(editing)}><Icon name="trash" size={14} /> Delete</button>
		<button class="btn" type="button" on:click={() => (editing = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="edit-{kind}" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
	</svelte:fragment>
</Modal>

<style>
	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.notice {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: 10px;
		background: var(--warn-soft);
		color: var(--warn);
		font-size: 13px;
	}
	.notice a {
		color: inherit;
		font-weight: 600;
	}
	.card-header p {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.card-header .amount {
		color: var(--text);
	}
	.filters {
		padding: 16px 20px 12px;
		border-bottom: 1px solid var(--border);
		display: grid;
		gap: 12px;
	}
	.filters .field {
		min-width: 150px;
		flex: 1 1 150px;
	}
	.filters .field.grow {
		flex: 2 1 240px;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--muted);
	}
	.search :global(svg) {
		position: absolute;
		left: 11px;
	}
	.search .input {
		padding-left: 32px;
	}
	.filter-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1;
	}
	.pending {
		font-size: 12.5px;
		color: var(--warn);
	}
	.columns-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		padding: 10px 20px;
		border-bottom: 1px solid var(--border);
		font-size: 12.5px;
	}
	.columns-bar > span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-right: 4px;
	}
	.entity-comments-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: 8px;
		cursor: pointer;
	}
	.nowrap {
		white-space: nowrap;
	}
	.comments {
		min-width: 220px;
		color: var(--muted);
	}
	tr.dim td {
		opacity: 0.55;
	}
	.delete-left {
		margin-right: auto;
	}
	.table td.amount.pos {
		color: var(--pos);
	}
</style>
