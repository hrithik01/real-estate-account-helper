<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { MASTER_OWNERS, PAYMENT_MODES } from '$lib/constants.js';

	const today = new Date().toISOString().slice(0, 10);
	const DEFAULT_PROJECT_STORAGE_KEY = 'balaji-default-project-id';
	const FORM_DATE_STORAGE_KEY = 'balaji-income-form-date';
	const PAGE_SIZE = 100;
	let entities = [];
	let projects = [];
	let accounts = [];
	let creditSources = [];
	let incomeList = [];
	let filteredIncomeList = [];
	let availableFormEntities = [];
	let availableDraftEntities = [];
	let editingId = null;
	let draft = {};
	let message = '';
	let formProjectsOpen = false;
	let draftProjectsOpen = false;
	let totalIncomeEntries = 0;
	let incomePage = 1;
	let incomeTotalPages = 1;
	let isIncomeLoading = false;
	let hasPendingIncomeFilters = false;

	let showProjects = false;
	let showType = false;
	let showSource = false;
	let showAttachment = false;
	let showAccount = false;
	let showTimestamp = false;

	let filterEntityId = 'all';
	let filterType = 'all';
	let filterSource = 'all';
	let filterProjectId = 'all';
	let filterTimestampFrom = '';
	let filterTimestampTo = '';
	let appliedFilterEntityId = 'all';
	let appliedFilterType = 'all';
	let appliedFilterSource = 'all';
	let appliedFilterProjectId = 'all';
	let appliedFilterTimestampFrom = '';
	let appliedFilterTimestampTo = '';
	let defaultProjectId = '';

	let form = {
		date: '',
		amount: '',
		entity_id: '',
		project_ids: [],
		account_id: '',
		payment_mode: 'cash',
		credit_source: 'other',
		master_owner: 'SHREE',
		comments: ''
	};

	const toggleSelection = (list, value) => {
		const normalized = String(value);
		return list.includes(normalized)
			? list.filter((item) => String(item) !== normalized)
			: [...list, normalized];
	};

	const getSelectedProjectNames = (selectedIds) => {
		const names = projects
			.filter((project) => selectedIds?.map(String).includes(String(project.id)))
			.map((project) => project.property_name);
		if (names.length === 0) return 'Select projects';
		return names.join(', ');
	};

	const getFilteredEntities = (entityList, selectedProjectIds, currentEntityId = '') => {
		const normalizedProjectIds = (selectedProjectIds || []).map(String);
		if (normalizedProjectIds.length === 0) return entityList;

		return entityList.filter((entity) => {
			if (currentEntityId && String(entity.id) === String(currentEntityId)) return true;
			return (entity.project_ids || []).map(String).some((projectId) => normalizedProjectIds.includes(projectId));
		});
	};

	const syncEntitySelection = (selectedProjectIds, entityId) => {
		if (!entityId) return '';
		const allowedEntities = getFilteredEntities(entities, selectedProjectIds, entityId);
		return allowedEntities.some((entity) => String(entity.id) === String(entityId)) ? entityId : '';
	};

	const persistDefaultProjectId = (projectId) => {
		defaultProjectId = String(projectId || '');
		if (typeof localStorage === 'undefined') return;
		if (defaultProjectId) {
			localStorage.setItem(DEFAULT_PROJECT_STORAGE_KEY, defaultProjectId);
		} else {
			localStorage.removeItem(DEFAULT_PROJECT_STORAGE_KEY);
		}
	};

	const updateFormProjectSelection = (projectId) => {
		form.project_ids = toggleSelection(form.project_ids || [], projectId);
		form.entity_id = syncEntitySelection(form.project_ids, form.entity_id);
		if ((form.project_ids || []).map(String).includes(String(projectId))) {
			persistDefaultProjectId(projectId);
		}
	};

	const updateDraftProjectSelection = (projectId) => {
		draft.project_ids = toggleSelection(draft.project_ids || [], projectId);
		draft.entity_id = syncEntitySelection(draft.project_ids, draft.entity_id);
	};

	const getDefaultProjectSelection = () =>
		defaultProjectId && projects.some((project) => String(project.id) === String(defaultProjectId))
			? [String(defaultProjectId)]
			: [];

	const applyDefaultProjectToForm = () => {
		const project_ids = getDefaultProjectSelection();
		form = {
			...form,
			project_ids,
			entity_id: syncEntitySelection(project_ids, form.entity_id)
		};
	};

	const formatINR = (value) =>
		new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);

	const toIsoDate = (value) => {
		const text = String(value || '').trim();
		if (!text) return '';
		if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

		const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
		if (!slashMatch) return '';

		const day = slashMatch[1].padStart(2, '0');
		const month = slashMatch[2].padStart(2, '0');
		const rawYear = Number(slashMatch[3]);
		const year = String(rawYear < 100 ? 2000 + rawYear : rawYear);
		return `${year}-${month}-${day}`;
	};

	const getPreferredFormDate = (rows) => {
		if (typeof localStorage !== 'undefined') {
			const storedDate = localStorage.getItem(FORM_DATE_STORAGE_KEY) || '';
			if (toIsoDate(storedDate)) return toIsoDate(storedDate);
		}

		const latestTransactionDate = toIsoDate(rows?.[0]?.date);
		return latestTransactionDate || today;
	};

	const getLatestTransactionProjectId = (rows) => {
		const projectId = rows?.[0]?.project_ids?.[0];
		return projectId ? String(projectId) : '';
	};

	const appendAmountZeros = (zeroCount) => {
		const currentValue = String(form.amount ?? '').trim();
		if (!currentValue) return;
		form = {
			...form,
			amount: `${currentValue}${'0'.repeat(zeroCount)}`
		};
	};

	const normalizedDate = (value) => String(value || '').slice(0, 10);
	const getRowTimestamp = (row) => row.created_at || row.updated_at || row.date;
	const normalizePageNumber = (value) => Math.max(1, Number.parseInt(String(value || '1'), 10) || 1);

	const createIncomeSearchParams = () => {
		const params = new URLSearchParams({
			page: String(incomePage),
			limit: String(PAGE_SIZE)
		});

		if (appliedFilterEntityId !== 'all') params.set('entityId', appliedFilterEntityId);
		if (appliedFilterType !== 'all') params.set('paymentMode', appliedFilterType);
		if (appliedFilterSource !== 'all') params.set('creditSource', appliedFilterSource);
		if (appliedFilterProjectId !== 'all') params.set('projectId', appliedFilterProjectId);
		if (appliedFilterTimestampFrom) params.set('timestampFrom', appliedFilterTimestampFrom);
		if (appliedFilterTimestampTo) params.set('timestampTo', appliedFilterTimestampTo);

		return params;
	};

	const applyIncomeFilters = async () => {
		appliedFilterEntityId = filterEntityId;
		appliedFilterType = filterType;
		appliedFilterSource = filterSource;
		appliedFilterProjectId = filterProjectId;
		appliedFilterTimestampFrom = filterTimestampFrom;
		appliedFilterTimestampTo = filterTimestampTo;
		incomePage = 1;
		await loadIncome();
	};

	const changeIncomePage = async (nextPage) => {
		const targetPage = Math.min(Math.max(1, nextPage), incomeTotalPages);
		if (targetPage === incomePage) return;
		incomePage = targetPage;
		await loadIncome();
	};

	const loadMasters = async () => {
		const [entitiesRes, projectsRes, accountsRes, optionsRes] = await Promise.all([
			fetch('/api/entities'),
			fetch('/api/projects'),
			fetch('/api/accounts'),
			fetch('/api/master-options')
		]);
		if (entitiesRes.ok) entities = await entitiesRes.json();
		if (projectsRes.ok) projects = await projectsRes.json();
		if (accountsRes.ok) accounts = await accountsRes.json();
		if (optionsRes.ok) {
			const options = await optionsRes.json();
			creditSources = options.credit_sources || [];
			if (!creditSources.includes(form.credit_source)) {
				form.credit_source = creditSources[0] || 'other';
			}
		}

		if (typeof localStorage !== 'undefined') {
			const storedDefaultProjectId = localStorage.getItem(DEFAULT_PROJECT_STORAGE_KEY) || '';
			persistDefaultProjectId(
				storedDefaultProjectId && projects.some((project) => String(project.id) === storedDefaultProjectId)
					? storedDefaultProjectId
					: ''
			);
		}

		applyDefaultProjectToForm();
	};

	const loadIncome = async () => {
		isIncomeLoading = true;
		try {
			const res = await fetch(`/api/income?${createIncomeSearchParams().toString()}`);
			if (!res.ok) return;

			const payload = await res.json();
			incomeList = payload.rows || [];
			filteredIncomeList = incomeList;
			totalIncomeEntries = payload.pagination?.totalCount || 0;
			incomeTotalPages = Math.max(1, payload.pagination?.totalPages || 1);
			incomePage = normalizePageNumber(payload.pagination?.page || incomePage);

			if (!defaultProjectId) {
				persistDefaultProjectId(getLatestTransactionProjectId(incomeList));
				if (!(form.project_ids || []).length) applyDefaultProjectToForm();
			}

			const preferredDate = getPreferredFormDate(incomeList);
			if (preferredDate && !form.date) {
				form = { ...form, date: preferredDate };
			}
		} finally {
			isIncomeLoading = false;
		}
	};

	const submitIncome = async () => {
		message = '';
		if (!form.entity_id) {
			message = 'Please select an entity.';
			return;
		}
		if (form.payment_mode === 'account' && !form.account_id) {
			message = 'Please select an account for account transactions.';
			return;
		}
		const payload = {
			...form,
			account_id: form.payment_mode === 'account' ? form.account_id : ''
		};
		const res = await fetch('/api/income', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			message = 'Income added.';
			const selectedFormDate = form.date || getPreferredFormDate(incomeList);
			form = {
				date: selectedFormDate,
				amount: '',
				entity_id: '',
				project_ids: [],
				account_id: '',
				payment_mode: 'cash',
				credit_source: 'other',
				master_owner: 'SHREE',
				comments: ''
			};
			applyDefaultProjectToForm();
			incomePage = 1;
			await loadIncome();
		} else {
			const error = await res.json();
			message = error.error || 'Failed to add income.';
		}
	};

	const startEdit = (row) => {
		editingId = row.id;
		draft = {
			date: row.date,
			amount: row.amount,
			entity_id: row.entity_id || '',
			project_ids: row.project_ids || [],
			account_id: row.account_id || '',
			payment_mode: row.payment_mode,
			credit_source: row.credit_source,
			master_owner: row.master_owner,
			comments: row.comments || ''
		};
	};

	const saveEdit = async (id) => {
		message = '';
		if (!draft.entity_id) {
			message = 'Please select an entity.';
			return;
		}
		if (draft.payment_mode === 'account' && !draft.account_id) {
			message = 'Please select an account for account transactions.';
			return;
		}
		const payload = {
			...draft,
			account_id: draft.payment_mode === 'account' ? draft.account_id : ''
		};
		const res = await fetch(`/api/income/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.ok) {
			message = 'Income updated.';
			editingId = null;
			await loadIncome();
		} else {
			const error = await res.json();
			message = error.error || 'Failed to update income.';
		}
	};

	const deleteIncome = async (id) => {
		if (!window.confirm('Delete this income entry?')) return;
		const res = await fetch(`/api/income/${id}`, { method: 'DELETE' });
		if (res.ok) {
			message = 'Income deleted.';
			await loadIncome();
		}
	};

	$: availableFormEntities = getFilteredEntities(entities, form.project_ids || [], form.entity_id);
	$: availableDraftEntities = getFilteredEntities(entities, draft.project_ids || [], draft.entity_id);
	$: hasPendingIncomeFilters =
		filterEntityId !== appliedFilterEntityId ||
		filterType !== appliedFilterType ||
		filterSource !== appliedFilterSource ||
		filterProjectId !== appliedFilterProjectId ||
		filterTimestampFrom !== appliedFilterTimestampFrom ||
		filterTimestampTo !== appliedFilterTimestampTo;
	$: if (typeof localStorage !== 'undefined' && form.date) {
		localStorage.setItem(FORM_DATE_STORAGE_KEY, form.date);
	}

	onMount(async () => {
		await loadMasters();
		await loadIncome();
	});
</script>

<section class="panel">
	<div class="row">
		<div>
			<h2>Income Entry</h2>
			<p class="muted">Add incoming transactions and map them to entity/project/account.</p>
		</div>
	</div>

	<div class="form-grid">
		<label><span>Date</span><input type="date" bind:value={form.date} /></label>
		<label>
			<span>Amount</span>
			<div class="amount-shortcut-field">
				<input type="number" min="1" step="1" bind:value={form.amount} />
				<div class="amount-shortcuts">
					<button type="button" class="secondary shortcut-button" on:click={() => appendAmountZeros(3)}>T</button>
					<button type="button" class="secondary shortcut-button" on:click={() => appendAmountZeros(5)}>L</button>
				</div>
			</div>
		</label>
		<label>
			<span>Entity *</span>
			<select bind:value={form.entity_id}><option value="">Select</option>{#each availableFormEntities as entity}<option value={entity.id}>{entity.name} ({entity.entity_code})</option>{/each}</select>
		</label>
		<label>
			<span>Projects (Optional, multiple)</span>
			<div class="multi-select">
				<button type="button" class="multi-trigger" on:click={() => (formProjectsOpen = !formProjectsOpen)}>
					{getSelectedProjectNames(form.project_ids)}
				</button>
				{#if formProjectsOpen}
					<div class="multi-menu">
						{#each projects as project}
							<label class="multi-option">
								<input
									type="checkbox"
									checked={form.project_ids?.map(String).includes(String(project.id))}
									on:change={() => updateFormProjectSelection(project.id)}
								/>
								<span>{project.property_name}</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		</label>
		<label>
			<span>Account</span>
			<select bind:value={form.account_id} disabled={form.payment_mode !== 'account'}><option value="">Select</option>{#each accounts as account}<option value={account.id}>{account.account_holder} ({account.bank_name})</option>{/each}</select>
		</label>
		<label>
			<span>Transaction Type</span>
			<select bind:value={form.payment_mode}>{#each PAYMENT_MODES as mode}<option value={mode}>{mode}</option>{/each}</select>
		</label>
		<label>
			<span>Credit Source</span>
			<select bind:value={form.credit_source}>{#each creditSources as source}<option value={source}>{source}</option>{/each}</select>
		</label>
		<label>
			<span>Attachment (HKJ / PKB / SHREE)</span>
			<select bind:value={form.master_owner}>{#each MASTER_OWNERS as owner}<option value={owner.key}>{owner.label}</option>{/each}</select>
		</label>
		<label class="wide"><span>Comments</span><input type="text" bind:value={form.comments} /></label>
	</div>
	<button on:click={submitIncome}>Add Income</button>
	{#if message}<p class="muted">{message}</p>{/if}
</section>

<section class="panel">
	<div class="table-header">
		<div>
			<h2>Income</h2>
			<p class="muted">Showing {filteredIncomeList.length} of {totalIncomeEntries} entries. {PAGE_SIZE} entries per page.</p>
		</div>
		<div class="pagination-controls">
			<button class="secondary" on:click={() => changeIncomePage(incomePage - 1)} disabled={isIncomeLoading || incomePage <= 1}>Previous</button>
			<span class="pagination-status">Page {incomePage} of {incomeTotalPages}</span>
			<button class="secondary" on:click={() => changeIncomePage(incomePage + 1)} disabled={isIncomeLoading || incomePage >= incomeTotalPages}>Next</button>
		</div>
	</div>
	<div class="detail-toggles">
		<label><input type="checkbox" bind:checked={showProjects} /> <span>Show projects</span></label>
		<label><input type="checkbox" bind:checked={showType} /> <span>Show type</span></label>
		<label><input type="checkbox" bind:checked={showSource} /> <span>Show source</span></label>
		<label><input type="checkbox" bind:checked={showAttachment} /> <span>Show attachment</span></label>
		<label><input type="checkbox" bind:checked={showAccount} /> <span>Show account</span></label>
		<label><input type="checkbox" bind:checked={showTimestamp} /> <span>Show timestamp</span></label>
	</div>
	<div class="filters-grid">
		<label><span>Timestamp From</span><input type="date" bind:value={filterTimestampFrom} /></label>
		<label><span>Timestamp To</span><input type="date" bind:value={filterTimestampTo} /></label>
		<label>
			<span>Entity Filter</span>
			<select bind:value={filterEntityId}>
				<option value="all">All</option>
				{#each entities as entity}
					<option value={String(entity.id)}>{entity.name} ({entity.entity_code})</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Type Filter</span>
			<select bind:value={filterType}>
				<option value="all">All</option>
				{#each PAYMENT_MODES as mode}
					<option value={mode}>{mode}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Source Filter</span>
			<select bind:value={filterSource}>
				<option value="all">All</option>
				{#each creditSources as source}
					<option value={source}>{source}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Project Filter</span>
			<select bind:value={filterProjectId}>
				<option value="all">All</option>
				{#each projects as project}
					<option value={String(project.id)}>{project.property_name}</option>
				{/each}
			</select>
		</label>
	</div>
	<div class="filter-actions">
		<button class="secondary" on:click={applyIncomeFilters} disabled={isIncomeLoading || !hasPendingIncomeFilters}>Execute</button>
		{#if hasPendingIncomeFilters}<span class="muted">Filters changed. Click Execute to refresh the entries.</span>{/if}
	</div>
	<table>
		<thead>
			<tr>
				<th>Date</th>
				{#if showTimestamp}<th>Timestamp</th>{/if}
				<th>Entity</th>
				{#if showProjects}<th>Projects</th>{/if}
				{#if showType}<th>Type</th>{/if}
				{#if showSource}<th>Source</th>{/if}
				{#if showAttachment}<th>Attachment</th>{/if}
				{#if showAccount}<th>Account</th>{/if}
				<th>Amount</th>
				<th>Comments</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#if filteredIncomeList.length === 0}
				<tr><td colspan={5 + (showProjects ? 1 : 0) + (showType ? 1 : 0) + (showSource ? 1 : 0) + (showAttachment ? 1 : 0) + (showAccount ? 1 : 0) + (showTimestamp ? 1 : 0)} class="muted">No income entries.</td></tr>
			{:else}
				{#each filteredIncomeList as row}
					<tr>
						<td>{#if editingId === row.id}<input type="date" bind:value={draft.date} />{:else}{row.date}{/if}</td>
						{#if showTimestamp}<td>{normalizedDate(getRowTimestamp(row)) || '-'}</td>{/if}
						<td>
							{#if editingId === row.id}
								<select bind:value={draft.entity_id}><option value="">Select</option>{#each availableDraftEntities as entity}<option value={entity.id}>{entity.name}</option>{/each}</select>
							{:else}
								{row.entity_name || '-'}
							{/if}
						</td>
						{#if showProjects}
							<td>
								{#if editingId === row.id}
									<div class="multi-select">
										<button type="button" class="multi-trigger" on:click={() => (draftProjectsOpen = !draftProjectsOpen)}>
											{getSelectedProjectNames(draft.project_ids)}
										</button>
										{#if draftProjectsOpen}
											<div class="multi-menu">
												{#each projects as project}
													<label class="multi-option">
														<input
															type="checkbox"
															checked={draft.project_ids?.map(String).includes(String(project.id))}
															on:change={() => updateDraftProjectSelection(project.id)}
														/>
														<span>{project.property_name}</span>
													</label>
												{/each}
											</div>
										{/if}
									</div>
								{:else}
									{row.project_names || '-'}
								{/if}
							</td>
						{/if}
						{#if showType}
							<td>{#if editingId === row.id}<select bind:value={draft.payment_mode}>{#each PAYMENT_MODES as mode}<option value={mode}>{mode}</option>{/each}</select>{:else}{row.payment_mode}{/if}</td>
						{/if}
						{#if showSource}
							<td>{#if editingId === row.id}<select bind:value={draft.credit_source}>{#each creditSources as source}<option value={source}>{source}</option>{/each}</select>{:else}{row.credit_source || '-'}{/if}</td>
						{/if}
						{#if showAttachment}
							<td>{#if editingId === row.id}<select bind:value={draft.master_owner}>{#each MASTER_OWNERS as owner}<option value={owner.key}>{owner.key}</option>{/each}</select>{:else}{row.master_owner}{/if}</td>
						{/if}
						{#if showAccount}
							<td>{#if editingId === row.id}<select bind:value={draft.account_id} disabled={draft.payment_mode !== 'account'}><option value="">Select</option>{#each accounts as account}<option value={account.id}>{account.account_holder}</option>{/each}</select>{:else}{row.account_holder || '-'}{/if}</td>
						{/if}
						<td>{#if editingId === row.id}<input type="number" min="1" step="1" bind:value={draft.amount} />{:else}{formatINR(row.amount)}{/if}</td>
						<td>{#if editingId === row.id}<input type="text" bind:value={draft.comments} />{:else}{row.comments || '-'}{/if}</td>
						<td>
							{#if editingId === row.id}
								<button class="secondary" on:click={() => saveEdit(row.id)}>Save</button>
								<button class="ghost" on:click={() => (editingId = null)}>Cancel</button>
							{:else}
								<button class="secondary" on:click={() => startEdit(row)}>Edit</button>
								<button class="ghost" on:click={() => deleteIncome(row.id)}>Delete</button>
							{/if}
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
	<div class="pagination-footer">
		<button class="secondary" on:click={() => changeIncomePage(incomePage - 1)} disabled={isIncomeLoading || incomePage <= 1}>Previous</button>
		<span class="pagination-status">Page {incomePage} of {incomeTotalPages}</span>
		<button class="secondary" on:click={() => changeIncomePage(incomePage + 1)} disabled={isIncomeLoading || incomePage >= incomeTotalPages}>Next</button>
	</div>
</section>

<style>
	.panel { background: var(--panel-bg); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
	.row { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
	.table-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
	.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 16px 0; }
	label { display: grid; gap: 6px; color: var(--muted); font-size: 14px; }
	label.multi-option { display: flex; align-items: center; gap: 8px; color: var(--text); }
	label.wide { grid-column: 1 / -1; }
	input, select, button { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); }
	button { background: var(--primary-bg); color: var(--primary-text); border: none; cursor: pointer; }
	button:disabled { opacity: 0.6; cursor: not-allowed; }
	button.secondary { background: var(--secondary-bg); color: var(--secondary-text); border: 1px solid var(--border); }
	button.ghost { background: transparent; color: var(--ghost-text); border: 1px solid var(--border); }
	.multi-select { position: relative; }
	.multi-trigger { width: 100%; text-align: left; background: var(--input-bg); color: var(--text); border: 1px solid var(--border); }
	.multi-menu { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 10; background: var(--panel-bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px; max-height: 220px; overflow: auto; display: grid; gap: 6px; }
	.detail-toggles { display: flex; gap: 12px; flex-wrap: wrap; margin: 10px 0 14px; }
	.detail-toggles label { display: flex; align-items: center; gap: 6px; }
	.filters-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 0 0 14px; }
	.filter-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 14px; }
	.amount-shortcut-field { display: grid; gap: 8px; }
	.amount-shortcuts { display: flex; gap: 8px; }
	.shortcut-button { min-width: 52px; }
	.pagination-controls, .pagination-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.pagination-footer { margin-top: 14px; justify-content: flex-end; }
	.pagination-status { color: var(--muted); font-size: 14px; }
	table { width: 100%; border-collapse: collapse; margin-top: 12px; }
	th, td { border-bottom: 1px solid var(--border); text-align: left; padding: 10px; vertical-align: top; }
	.muted { color: var(--muted); }
</style>
