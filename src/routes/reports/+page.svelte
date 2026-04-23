<script>
	// @ts-nocheck
	import { onMount } from 'svelte';

	const today = new Date().toISOString().slice(0, 10);
	let startDate = today;
	let endDate = today;
	let reportType = 'combined';
	let sortOrder = 'latest';
	let entities = [];
	let projects = [];
	let selectedEntityIds = [];
	let selectedProjectIds = [];
	let entitiesOpen = false;
	let projectsOpen = false;
	let report = null;
	let message = '';
	let showIncomeProjects = false;
	let showIncomeType = false;
	let showIncomeSource = false;
	let showIncomeAttachment = false;
	let showExpenseProjects = false;
	let showExpenseType = false;
	let showExpenseSource = false;
	let showExpenseAttachment = false;

	const formatINR = (value) =>
		new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);

	const loadFilters = async () => {
		const [entitiesRes, projectsRes] = await Promise.all([fetch('/api/entities'), fetch('/api/projects')]);
		if (entitiesRes.ok) entities = await entitiesRes.json();
		if (projectsRes.ok) projects = await projectsRes.json();
	};

	const toggleSelection = (list, value) => {
		const normalized = String(value);
		return list.includes(normalized)
			? list.filter((item) => String(item) !== normalized)
			: [...list, normalized];
	};

	const selectedEntityLabel = () => {
		const labels = entities
			.filter((entity) => selectedEntityIds.includes(String(entity.id)))
			.map((entity) => `${entity.name} (${entity.entity_code})`);
		if (labels.length === 0) return 'All entities';
		return labels.join(', ');
	};

	const selectedProjectLabel = () => {
		const labels = projects
			.filter((project) => selectedProjectIds.includes(String(project.id)))
			.map((project) => project.property_name);
		if (labels.length === 0) return 'All projects';
		return labels.join(', ');
	};

	const runReport = async () => {
		message = '';
		const entityIdsParam = selectedEntityIds.length > 0 ? selectedEntityIds.join(',') : 'all';
		const projectIdsParam = selectedProjectIds.length > 0 ? selectedProjectIds.join(',') : 'all';
		const res = await fetch(
			`/api/reports?start=${startDate}&end=${endDate}&reportType=${reportType}&sortOrder=${sortOrder}&entityIds=${entityIdsParam}&projectIds=${projectIdsParam}`
		);
		if (res.ok) {
			report = await res.json();
		} else {
			const error = await res.json();
			message = error.error || 'Failed to run report.';
		}
	};

	onMount(async () => {
		await loadFilters();
		await runReport();
	});
</script>

<section class="panel">
	<h2>Reports</h2>
	<p class="muted">Generate income, expense, or combined report and filter by one or more entities/projects.</p>
	<div class="form-grid">
		<label><span>Start Date</span><input type="date" bind:value={startDate} /></label>
		<label><span>End Date</span><input type="date" bind:value={endDate} /></label>
		<label>
			<span>Report Type</span>
			<select bind:value={reportType}>
				<option value="income">Income</option>
				<option value="expense">Expense</option>
				<option value="combined">Combined</option>
			</select>
		</label>
		<label>
			<span>Date Order</span>
			<select bind:value={sortOrder}>
				<option value="latest">Latest to oldest</option>
				<option value="oldest">Oldest to latest</option>
			</select>
		</label>
		<label>
			<span>Entities</span>
			<div class="multi-select">
				<button type="button" class="multi-trigger" on:click={() => (entitiesOpen = !entitiesOpen)}>{selectedEntityLabel()}</button>
				{#if entitiesOpen}
					<div class="multi-menu">
						{#each entities as entity}
							<label class="multi-option">
								<input type="checkbox" checked={selectedEntityIds.includes(String(entity.id))} on:change={() => (selectedEntityIds = toggleSelection(selectedEntityIds, entity.id))} />
								<span>{entity.name} ({entity.entity_code})</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		</label>
		<label>
			<span>Projects</span>
			<div class="multi-select">
				<button type="button" class="multi-trigger" on:click={() => (projectsOpen = !projectsOpen)}>{selectedProjectLabel()}</button>
				{#if projectsOpen}
					<div class="multi-menu">
						{#each projects as project}
							<label class="multi-option">
								<input type="checkbox" checked={selectedProjectIds.includes(String(project.id))} on:change={() => (selectedProjectIds = toggleSelection(selectedProjectIds, project.id))} />
								<span>{project.property_name}</span>
							</label>
						{/each}
					</div>
				{/if}
			</div>
		</label>
	</div>
	<button on:click={runReport}>Run Report</button>
	{#if message}<p class="muted">{message}</p>{/if}
</section>

{#if report}
	{#if reportType !== 'expense'}
		<section class="panel">
			<h3>Income Columns</h3>
			<div class="detail-toggles">
				<label><input type="checkbox" bind:checked={showIncomeProjects} /> <span>Show income projects</span></label>
				<label><input type="checkbox" bind:checked={showIncomeType} /> <span>Show income type</span></label>
				<label><input type="checkbox" bind:checked={showIncomeSource} /> <span>Show income source</span></label>
				<label><input type="checkbox" bind:checked={showIncomeAttachment} /> <span>Show income attachment</span></label>
			</div>
		</section>
	{/if}

	{#if reportType !== 'income'}
		<section class="panel">
			<h3>Expense Columns</h3>
			<div class="detail-toggles">
				<label><input type="checkbox" bind:checked={showExpenseProjects} /> <span>Show expense projects</span></label>
				<label><input type="checkbox" bind:checked={showExpenseType} /> <span>Show expense type</span></label>
				<label><input type="checkbox" bind:checked={showExpenseSource} /> <span>Show expense source</span></label>
				<label><input type="checkbox" bind:checked={showExpenseAttachment} /> <span>Show expense attachment</span></label>
			</div>
		</section>
	{/if}

	<section class="panel">
		<h3>Summary</h3>
		<div class="grid">
			<div class="card"><h4>Total Income</h4><p class="amount-value">{formatINR(report.total_income)}</p></div>
			<div class="card"><h4>Total Expense</h4><p class="amount-value">{formatINR(report.total_expense)}</p></div>
			<div class="card"><h4>Net</h4><p class="amount-value">{formatINR(report.net)}</p></div>
		</div>
	</section>

	{#if reportType !== 'expense'}
		<section class="panel">
			<h3>Income Rows</h3>
			<p class="muted">Entity cumulative is calculated per entity in chronological order and stays the same regardless of display sort.</p>
			<table>
				<thead>
					<tr>
						<th>Date</th>
						<th>Entity</th>
						{#if showIncomeProjects}<th>Projects</th>{/if}
						{#if showIncomeType}<th>Type</th>{/if}
						{#if showIncomeSource}<th>Source</th>{/if}
						{#if showIncomeAttachment}<th>Attachment</th>{/if}
						<th>Amount</th>
						<th>Entity Cumulative</th>
						<th>Comments</th>
					</tr>
				</thead>
				<tbody>
					{#if report.rows.income.length === 0}
						<tr><td colspan={5 + (showIncomeProjects ? 1 : 0) + (showIncomeType ? 1 : 0) + (showIncomeSource ? 1 : 0) + (showIncomeAttachment ? 1 : 0)} class="muted">No income rows.</td></tr>
					{:else}
						{#each report.rows.income as row}
							<tr>
								<td>{row.date}</td>
								<td>{row.entity_name || '-'}</td>
								{#if showIncomeProjects}<td>{row.project_names || '-'}</td>{/if}
								{#if showIncomeType}<td>{row.payment_mode || '-'}</td>{/if}
								{#if showIncomeSource}<td>{row.source || '-'}</td>{/if}
								{#if showIncomeAttachment}<td>{row.master_owner || '-'}</td>{/if}
								<td>{formatINR(row.amount)}</td>
								<td>{formatINR(row.entity_cumulative)}</td>
								<td>{row.comments || '-'}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>
	{/if}

	{#if reportType !== 'income'}
		<section class="panel">
			<h3>Expense Rows</h3>
			<p class="muted">Entity cumulative is calculated per entity in chronological order and stays the same regardless of display sort.</p>
			<table>
				<thead>
					<tr>
						<th>Date</th>
						<th>Entity</th>
						{#if showExpenseProjects}<th>Projects</th>{/if}
						{#if showExpenseType}<th>Type</th>{/if}
						{#if showExpenseSource}<th>Source</th>{/if}
						{#if showExpenseAttachment}<th>Attachment</th>{/if}
						<th>Amount</th>
						<th>Entity Cumulative</th>
						<th>Comments</th>
					</tr>
				</thead>
				<tbody>
					{#if report.rows.expenses.length === 0}
						<tr><td colspan={5 + (showExpenseProjects ? 1 : 0) + (showExpenseType ? 1 : 0) + (showExpenseSource ? 1 : 0) + (showExpenseAttachment ? 1 : 0)} class="muted">No expense rows.</td></tr>
					{:else}
						{#each report.rows.expenses as row}
							<tr>
								<td>{row.date}</td>
								<td>{row.entity_name || '-'}</td>
								{#if showExpenseProjects}<td>{row.project_names || '-'}</td>{/if}
								{#if showExpenseType}<td>{row.payment_mode || '-'}</td>{/if}
								{#if showExpenseSource}<td>{row.source || '-'}</td>{/if}
								{#if showExpenseAttachment}<td>{row.master_owner || '-'}</td>{/if}
								<td>{formatINR(row.amount)}</td>
								<td>{formatINR(row.entity_cumulative)}</td>
								<td>{row.comments || '-'}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>
	{/if}
{/if}

<style>
	.panel { background: var(--panel-bg); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
	.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 16px 0; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
	.card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
	label { display: grid; gap: 6px; color: var(--muted); font-size: 14px; }
	label.multi-option { display: flex; align-items: center; gap: 8px; color: var(--text); }
	input, select, button { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); }
	button { background: var(--primary-bg); color: var(--primary-text); border: none; cursor: pointer; }
	.multi-select { position: relative; }
	.multi-trigger { width: 100%; text-align: left; background: var(--input-bg); color: var(--text); border: 1px solid var(--border); }
	.multi-menu { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 10; background: var(--panel-bg); border: 1px solid var(--border); border-radius: 10px; padding: 8px; max-height: 220px; overflow: auto; display: grid; gap: 6px; }
	.detail-toggles { display: flex; gap: 12px; flex-wrap: wrap; margin: 10px 0 4px; }
	.detail-toggles label { display: flex; align-items: center; gap: 6px; }
	table { width: 100%; border-collapse: collapse; margin-top: 12px; }
	th, td { border-bottom: 1px solid var(--border); text-align: left; padding: 10px; vertical-align: top; }
	.muted { color: var(--muted); }
</style>
