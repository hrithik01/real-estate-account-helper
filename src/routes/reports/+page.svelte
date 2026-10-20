<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { api, storage } from '$lib/api.js';
	import { formatDate, formatINR, formatShortDate, labelize, todayIso, toIsoDate, plural } from '$lib/format.js';
	import { downloadCsv, slug } from '$lib/csv.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';

	export let data;

	const PRESETS = [
		{ key: 'this-month', label: 'This month' },
		{ key: 'last-month', label: 'Last month' },
		{ key: 'last-3-months', label: 'Last 3 months' },
		{ key: 'this-fy', label: 'This financial year' },
		{ key: 'last-fy', label: 'Last financial year' },
		{ key: 'last-year', label: 'Last 12 months' },
		{ key: 'last-3-years', label: 'Last 3 years' },
		{ key: 'last-5-years', label: 'Last 5 years' }
	];
	const COLUMN_DEFS = [
		{ key: 'projects', label: 'Projects' },
		{ key: 'type', label: 'Mode' },
		{ key: 'source', label: 'Source' },
		{ key: 'head', label: 'Master balance' }
	];

	let startDate = todayIso();
	let endDate = todayIso();
	let preset = '';
	let reportType = 'combined';
	let sortOrder = 'latest';
	let entities = [];
	let projects = [];
	let selectedEntityIds = [];
	let selectedProjectIds = [];
	let report = null;
	let running = false;
	let columns = readColumns();
	let showEntityComments = storage.get('ledger:report-entity-comments') === '1';
	let showEntityCumulative = storage.get('ledger:report-entity-cumulative') !== '0';
	let showEntityType = storage.get('ledger:report-entity-type') !== '0';

	function readColumns() {
		try {
			const stored = JSON.parse(storage.get('ledger:report-columns', '{}'));
			return {
				income: Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, Boolean(stored.income?.[c.key])])),
				expense: Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, Boolean(stored.expense?.[c.key])]))
			};
		} catch {
			return { income: {}, expense: {} };
		}
	}

	const toggleColumn = (side, key) => {
		columns = { ...columns, [side]: { ...columns[side], [key]: !columns[side][key] } };
		storage.set('ledger:report-columns', JSON.stringify(columns));
	};

	const applyPreset = (key) => {
		preset = key;
		if (!key) return;
		const now = new Date();
		let start = new Date(now);
		let end = new Date(now);
		const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
		if (key === 'this-month') start = new Date(now.getFullYear(), now.getMonth(), 1);
		if (key === 'last-month') {
			start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			end = new Date(now.getFullYear(), now.getMonth(), 0);
		}
		if (key === 'last-3-months') start.setMonth(start.getMonth() - 3);
		if (key === 'this-fy') start = new Date(fyStartYear, 3, 1);
		if (key === 'last-fy') {
			start = new Date(fyStartYear - 1, 3, 1);
			end = new Date(fyStartYear, 2, 31);
		}
		if (key === 'last-year') start.setFullYear(start.getFullYear() - 1);
		if (key === 'last-3-years') start.setFullYear(start.getFullYear() - 3);
		if (key === 'last-5-years') start.setFullYear(start.getFullYear() - 5);
		startDate = toIsoDate(start);
		endDate = toIsoDate(end);
	};

	const sourceTotals = (rows = []) => {
		const totals = new Map();
		for (const row of rows) {
			const key = String(row.source || '').trim() || 'Unspecified';
			totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
		}
		const grand = [...totals.values()].reduce((sum, value) => sum + value, 0);
		return [...totals.entries()]
			.map(([source, total]) => ({ source, total, share: grand ? total / grand : 0 }))
			.filter((item) => item.total !== 0)
			.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
	};

	$: entityOptions = entities.map((entity) => ({ value: String(entity.id), label: entity.name, hint: entity.entity_code }));
	$: projectOptions = projects.map((project) => ({ value: String(project.id), label: project.property_name }));
	$: sections = report
		? [
				...(report.reportType !== 'expense'
					? [{ side: 'income', title: 'Income', rows: report.rows.income, total: report.total_income, sources: sourceTotals(report.rows.income) }]
					: []),
				...(report.reportType !== 'income'
					? [{ side: 'expense', title: 'Expenses', rows: report.rows.expenses, total: report.total_expense, sources: sourceTotals(report.rows.expenses) }]
					: [])
			]
		: [];
	$: storage.set('ledger:report-entity-comments', showEntityComments ? '1' : '0');
	$: storage.set('ledger:report-entity-cumulative', showEntityCumulative ? '1' : '0');
	$: storage.set('ledger:report-entity-type', showEntityType ? '1' : '0');
	$: reportProjectNames = report
		? projects.filter((p) => report.projectIds.includes(p.id)).map((p) => p.property_name)
		: [];
	$: filterSummary = [
		selectedEntityIds.length ? `${selectedEntityIds.length} entit${selectedEntityIds.length === 1 ? 'y' : 'ies'}` : 'All entities',
		selectedProjectIds.length
			? projects.filter((p) => selectedProjectIds.includes(String(p.id))).map((p) => p.property_name).join(', ')
			: 'All projects'
	].join(' · ');

	const runReport = async () => {
		if (startDate > endDate) return toast.error('Start date must be on or before the end date.');
		running = true;
		try {
			const params = new URLSearchParams({
				start: startDate,
				end: endDate,
				reportType,
				sortOrder,
				entityIds: selectedEntityIds.length ? selectedEntityIds.join(',') : 'all',
				projectIds: selectedProjectIds.length ? selectedProjectIds.join(',') : 'all'
			});
			report = await api(`/api/reports?${params}`);
		} catch (err) {
			toast.error(err.message);
		} finally {
			running = false;
		}
	};

	const exportCsv = () => {
		const rows = sections.flatMap((section) => section.rows.map((row) => ({ ...row, side: section.side })));
		downloadCsv(
			`${slug(data.company.name)}-report-${report.start}-to-${report.end}.csv`,
			[
				{ label: 'Type', value: (row) => (row.side === 'income' ? 'Income' : 'Expense') },
				{ label: 'Date', value: (row) => row.date },
				{ label: 'Entity', value: (row) => row.entity_name },
				{ label: 'Projects', value: (row) => row.project_names },
				{ label: 'Mode', value: (row) => row.payment_mode },
				{ label: 'Source', value: (row) => row.source },
				{ label: 'Master balance', value: (row) => row.head_name || row.master_owner },
				{ label: 'Amount', value: (row) => row.amount },
				{ label: 'Entity cumulative', value: (row) => row.entity_cumulative },
				{ label: 'Comments', value: (row) => row.comments }
			],
			rows
		);
	};

	onMount(async () => {
		applyPreset('this-fy');
		try {
			[entities, projects] = await Promise.all([api('/api/entities'), api('/api/projects')]);
		} catch (err) {
			toast.error(err.message);
		}
		await runReport();
	});
</script>

<header class="page-header no-print">
	<div>
		<p class="eyebrow">{data.company.name}</p>
		<h1>Reports</h1>
		<p>Income, expense or combined statements with entity running totals and source breakdowns.</p>
	</div>
	<div class="page-actions">
		<button class="btn" type="button" on:click={exportCsv} disabled={!report}><Icon name="download" size={15} /> Export CSV</button>
		<button class="btn" type="button" on:click={() => window.print()} disabled={!report}><Icon name="printer" size={15} /> Print</button>
	</div>
</header>

<section class="card no-print">
	<form class="card-body" on:submit|preventDefault={runReport}>
		<div class="form-grid">
			<label class="field">
				<span class="label">Quick range</span>
				<select class="select" bind:value={preset} on:change={(event) => applyPreset(event.currentTarget.value)}>
					<option value="">Custom</option>
					{#each PRESETS as item}<option value={item.key}>{item.label}</option>{/each}
				</select>
			</label>
			<label class="field"><span class="label">From</span><input class="input" type="date" bind:value={startDate} on:input={() => (preset = '')} /></label>
			<label class="field"><span class="label">To</span><input class="input" type="date" bind:value={endDate} on:input={() => (preset = '')} /></label>
			<div class="field">
				<span class="label">Report type</span>
				<div class="segmented" role="radiogroup" aria-label="Report type">
					{#each ['combined', 'income', 'expense'] as type}
						<button type="button" role="radio" aria-checked={reportType === type} class:active={reportType === type} on:click={() => (reportType = type)}>{type}</button>
					{/each}
				</div>
			</div>
			<div class="field">
				<label class="label" for="report-entities">Entities</label>
				<MultiSelect id="report-entities" options={entityOptions} bind:value={selectedEntityIds} placeholder="All entities" />
			</div>
			<div class="field">
				<label class="label" for="report-projects">Projects</label>
				<MultiSelect id="report-projects" options={projectOptions} bind:value={selectedProjectIds} placeholder="All projects" />
			</div>
			<label class="field">
				<span class="label">Date order</span>
				<select class="select" bind:value={sortOrder}>
					<option value="latest">Latest first</option>
					<option value="oldest">Oldest first</option>
				</select>
			</label>
			<div class="field run">
				<button class="btn btn-primary" type="submit" disabled={running}><Icon name="refresh" size={15} /> {running ? 'Running…' : 'Run report'}</button>
			</div>
		</div>
	</form>
</section>

{#if report}
	<div class="print-only letterhead">
		<div>
			<h1>{data.company.legal_name || data.company.name}</h1>
			{#if reportProjectNames.length}<h2 class="letterhead-project">{reportProjectNames.join(', ')}</h2>{/if}
			{#if data.company.address}<p>{data.company.address}</p>{/if}
			<p>
				{[data.company.tax_id ? `GSTIN/PAN: ${data.company.tax_id}` : '', data.company.phone, data.company.email].filter(Boolean).join(' · ')}
			</p>
		</div>
		<div class="letterhead-meta">
			<strong>{labelize(report.reportType)} report</strong>
			<p>{formatDate(report.start)} – {formatDate(report.end)}</p>
			<p>{filterSummary}</p>
			<p>Generated {formatDate(todayIso())}</p>
		</div>
	</div>

	<section class="kpi-grid summary" style="--kpi-count: {report.reportType === 'combined' ? 3 : 1}">
		{#if report.reportType !== 'expense'}
		<article class="kpi">
			<span class="kpi-label"><span class="kpi-dot no-print" style="background: var(--series-income)"></span>Total income</span>
			<span class="kpi-value income">{formatINR(report.total_income)}</span>
			<span class="kpi-foot">{plural(report.rows.income.length, 'entry', 'entries')}</span>
		</article>
		{/if}
		{#if report.reportType !== 'income'}
		<article class="kpi">
			<span class="kpi-label"><span class="kpi-dot no-print" style="background: var(--series-expense)"></span>Total expense</span>
			<span class="kpi-value expense">{formatINR(report.total_expense)}</span>
			<span class="kpi-foot">{plural(report.rows.expenses.length, 'entry', 'entries')}</span>
		</article>
		{/if}
		{#if report.reportType === 'combined'}
		<article class="kpi">
			<span class="kpi-label">Net</span>
			<span class="kpi-value" class:pos={report.net > 0} class:neg={report.net < 0}>{formatINR(report.net)}</span>
			<span class="kpi-foot no-print">{formatDate(report.start)} – {formatDate(report.end)}</span>
		</article>
		{/if}
	</section>

	{#if report.heads.length > 0}
		<section class="card heads-section">
			<div class="card-header"><h2>Master balances</h2></div>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr>
							<th>Master balance</th>
							{#if report.reportType !== 'expense'}<th class="num">Income</th>{/if}
							{#if report.reportType !== 'income'}<th class="num">Expense</th>{/if}
							{#if report.reportType === 'combined'}<th class="num">Net</th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each report.heads as head (head.code)}
							<tr>
								<td class="primary">{head.name}</td>
								{#if report.reportType !== 'expense'}<td class="num amount income">{formatINR(head.income)}</td>{/if}
								{#if report.reportType !== 'income'}<td class="num amount expense">{formatINR(head.expense)}</td>{/if}
								{#if report.reportType === 'combined'}<td class="num amount">{formatINR(head.net)}</td>{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	{#each sections as section (section.side)}
		{#if section.sources.length > 0}
		<section class="card source-section">
				<div class="sources">
					<h3>{section.title} by source</h3>
					<table class="table compact">
						<thead><tr><th>Source</th><th class="share-col">Share</th><th class="num">Amount</th></tr></thead>
						<tbody>
							{#each section.sources as item}
								<tr>
									<td class="primary">{labelize(item.source)}</td>
									<td class="share-col">
										<span class="share">
											<span class="bar"><span style="width: {Math.max(2, item.share * 100)}%; background: var(--series-{section.side})"></span></span>
											<span class="num muted">{(item.share * 100).toFixed(1)}%</span>
										</span>
									</td>
									<td class="num amount {section.side}">{formatINR(item.total)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
		</section>
		{/if}
	{/each}

	{#each sections as section (section.side)}
		<section class="card report-section">
			<div class="card-header">
				<div>
					<h2>{section.title}</h2>
					{#if showEntityCumulative}<p class="no-print">Entity cumulative is a running total per entity in date order, regardless of display order.</p>{/if}
				</div>
				<div class="chip-row no-print">
					{#each COLUMN_DEFS as column}
						<button type="button" class="toggle-chip" class:on={columns[section.side][column.key]} aria-pressed={columns[section.side][column.key]} on:click={() => toggleColumn(section.side, column.key)}>{column.label}</button>
					{/each}
					<label class="check entity-comments-toggle">
						<input type="checkbox" bind:checked={showEntityCumulative} />
						Entity cumulative
					</label>
					<label class="check entity-comments-toggle">
						<input type="checkbox" bind:checked={showEntityType} />
						Entity type
					</label>
					<label class="check entity-comments-toggle">
						<input type="checkbox" bind:checked={showEntityComments} />
						Entity comments
					</label>
				</div>
			</div>
			<div class="table-wrap">
				<table class="table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Entity</th>
							{#if columns[section.side].projects}<th>Projects</th>{/if}
							{#if columns[section.side].type}<th>Mode</th>{/if}
							{#if columns[section.side].source}<th>Source</th>{/if}
							{#if columns[section.side].head}<th>Master balance</th>{/if}
							<th class="num">Amount</th>
							{#if showEntityCumulative}<th class="num">Entity cumulative</th>{/if}
							<th>Comments</th>
						</tr>
					</thead>
					<tbody>
						{#each section.rows as row (row.id)}
							<tr>
								<td class="nowrap">{formatShortDate(row.date)}</td>
								<td class="primary">
									{row.entity_name || '—'}
									{#if (showEntityType && row.entity_type) || (showEntityComments && row.entity_comments)}
										<span class="cell-sub">
											{#if showEntityType && row.entity_type}{labelize(row.entity_type)}{/if}
											{#if showEntityComments && row.entity_comments}({row.entity_comments}){/if}
										</span>
									{/if}
								</td>
								{#if columns[section.side].projects}<td>{row.project_names || '—'}</td>{/if}
								{#if columns[section.side].type}<td>{labelize(row.payment_mode)}</td>{/if}
								{#if columns[section.side].source}<td>{labelize(row.source)}</td>{/if}
								{#if columns[section.side].head}<td>{row.head_name || row.master_owner}</td>{/if}
								<td class="num amount {section.side}">{formatINR(row.amount)}</td>
								{#if showEntityCumulative}<td class="num {section.side}">{formatINR(row.entity_cumulative)}</td>{/if}
								<td class="comments">{row.comments || '—'}</td>
							</tr>
						{:else}
							<tr><td colspan="9"><div class="empty"><h3>No {section.title.toLowerCase()} in this period</h3></div></td></tr>
						{/each}
					</tbody>
					{#if section.rows.length > 0}
						<tfoot>
							<tr>
								<td colspan={2 + Object.values(columns[section.side]).filter(Boolean).length}>Total · {plural(section.rows.length, 'entry', 'entries')}</td>
								<td class="num amount {section.side}">{formatINR(section.total)}</td>
								<td colspan={showEntityCumulative ? 2 : 1}></td>
							</tr>
						</tfoot>
					{/if}
				</table>
			</div>
		</section>
	{/each}
{/if}

<style>
	.run {
		align-content: end;
	}
	.run .btn {
		height: 38px;
	}
	.segmented {
		width: 100%;
	}
	.segmented button {
		flex: 1;
	}
	.nowrap {
		white-space: nowrap;
	}
	.income {
		color: var(--pos);
	}
	.expense {
		color: var(--neg);
	}
	.table td.income {
		color: var(--pos);
	}
	.table td.expense {
		color: var(--neg);
	}
	.comments {
		color: var(--muted);
		min-width: 200px;
	}
	.sources {
		padding: 16px 20px 20px;
		border-top: 1px solid var(--border);
	}
	.sources h3 {
		margin-bottom: 8px;
	}
	.share-col {
		width: 40%;
	}
	.share {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.bar {
		flex: 1;
		height: 8px;
		border-radius: 4px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: 4px;
	}
	.print-only {
		display: none;
	}
	.letterhead-project {
		font-size: 12pt;
		margin: 1mm 0;
	}
	.entity-comments-toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	@page {
		size: A4 portrait;
		margin: 12mm;
	}
	@media print {
		.print-only {
			display: flex;
		}
		.heads-section,
		.source-section {
			break-inside: avoid;
		}
		.letterhead {
			justify-content: space-between;
			gap: 16px;
			padding-bottom: 4mm;
			margin-bottom: 4mm;
			border-bottom: 0.4mm solid #000;
			font-size: 10pt;
		}
		.letterhead h1 {
			font-size: 16pt;
		}
		.letterhead-meta {
			text-align: right;
		}
		.summary {
			grid-template-columns: repeat(var(--kpi-count, 3), 1fr);
			gap: 3mm;
		}
		.summary .kpi {
			box-shadow: none;
			border: 0.3mm solid #999;
			border-radius: 2mm;
			padding: 2.5mm 3mm;
		}
		.summary .kpi-value {
			font-size: 13pt;
		}
		.card {
			box-shadow: none;
			border: 0;
			border-radius: 0;
			margin-bottom: 6mm;
		}
		.card-header {
			padding: 0 0 2mm;
			border-bottom: 0;
		}
		.table th {
			position: static;
			background: none;
			color: #000;
			border-bottom: 0.35mm solid #000;
			padding: 1.5mm 2mm;
		}
		.table td {
			padding: 1.5mm 2mm;
			border-bottom: 0.2mm solid #bbb;
			color: #000;
		}
		.table tfoot td {
			background: none;
			border-top: 0.35mm solid #000;
		}
		.table-wrap {
			overflow: visible;
		}
		tr {
			break-inside: avoid;
		}
		.sources {
			padding: 3mm 0 0;
			border: 0;
		}
		.bar {
			border: 0.2mm solid #999;
			print-color-adjust: exact;
			-webkit-print-color-adjust: exact;
		}
	}
</style>
