<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { api, storage } from '$lib/api.js';
	import { formatCompact, formatDate, formatINR, labelize, todayIso, plural } from '$lib/format.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import BoardList from '$lib/components/BoardList.svelte';

	export let data;

	let selectedDate = todayIso();
	let dash = null;
	let loading = true;
	let boards = { todos: [], coming_income: [], coming_expenses: [] };
	let showAccounts = storage.get('ledger-show-accounts') === '1';

	$: longDate = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	$: isToday = selectedDate === todayIso();

	const loadDashboard = async () => {
		loading = true;
		try {
			dash = await api(`/api/dashboard?date=${selectedDate}`);
		} catch (err) {
			toast.error(err.message);
		} finally {
			loading = false;
		}
	};

	const loadBoards = async () => {
		try {
			boards = await api('/api/boards');
		} catch (err) {
			toast.error(err.message);
		}
	};

	const saveBoard = async (key, items) => {
		const previous = boards;
		boards = { ...boards, [key]: items };
		try {
			await api('/api/boards', { method: 'PUT', body: boards });
		} catch (err) {
			boards = previous;
			toast.error(err.message);
		}
	};

	const toggleAccounts = () => {
		showAccounts = !showAccounts;
		storage.set('ledger-show-accounts', showAccounts ? '1' : '');
	};

	onMount(() => {
		loadDashboard();
		loadBoards();
	});
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{longDate}</p>
		<h1>{data.company.name}</h1>
		<p>Daily position, balances and what's coming up.</p>
	</div>
	<div class="page-actions">
		<label class="date-field">
			<Icon name="calendar" size={15} />
			<span class="sr-only">Working date</span>
			<input type="date" bind:value={selectedDate} on:change={loadDashboard} />
		</label>
		{#if !isToday}
			<button class="btn" type="button" on:click={() => ((selectedDate = todayIso()), loadDashboard())}>Today</button>
		{/if}
		<a class="btn" href="/expenses"><Icon name="expense" size={15} /> Add expense</a>
		<a class="btn btn-primary" href="/income"><Icon name="income" size={15} /> Add income</a>
	</div>
</header>

<section class="kpi-grid">
	<article class="kpi">
		<span class="kpi-label"><span class="kpi-dot" style="background: var(--series-income)"></span>Income · {isToday ? 'today' : 'this day'}</span>
		<span class="kpi-value" class:skeleton={loading}>{formatINR(dash?.day.income)}</span>
		<span class="kpi-foot">This month {formatCompact(dash?.month.income)}</span>
	</article>
	<article class="kpi">
		<span class="kpi-label"><span class="kpi-dot" style="background: var(--series-expense)"></span>Expense · {isToday ? 'today' : 'this day'}</span>
		<span class="kpi-value" class:skeleton={loading}>{formatINR(dash?.day.expense)}</span>
		<span class="kpi-foot">This month {formatCompact(dash?.month.expense)}</span>
	</article>
	<article class="kpi">
		<span class="kpi-label">Net position</span>
		<span class="kpi-value" class:skeleton={loading} class:pos={dash?.day.net > 0} class:neg={dash?.day.net < 0}>{formatINR(dash?.day.net)}</span>
		<span class="kpi-foot">This month <span class:pos={dash?.month.net > 0} class:neg={dash?.month.net < 0}>{formatCompact(dash?.month.net)}</span></span>
	</article>
	<article class="kpi">
		<span class="kpi-label"><Icon name="bank" size={14} /> Bank balance</span>
		<span class="kpi-value" class:skeleton={loading}>{formatINR(dash?.total_account_balance)}</span>
		<span class="kpi-foot">Across {plural(dash?.accounts.length ?? 0, 'account')}</span>
	</article>
</section>

<div class="split">
	<section class="card">
		<div class="card-header">
			<div>
				<h2>Cash flow</h2>
				<p>Income and expense over the last six months</p>
			</div>
			<a class="btn btn-sm" href="/reports">Open reports</a>
		</div>
		<div class="card-body">
			{#if dash}
				<TrendChart data={dash.trend} />
			{:else}
				<div class="skeleton" style="height: 250px"></div>
			{/if}
		</div>
	</section>

	<section class="card">
		<div class="card-header">
			<div>
				<h2>Master balances</h2>
				<p>Opening balance plus attached entries</p>
			</div>
			<a class="btn btn-sm btn-ghost" href="/masters?tab=balances" aria-label="Manage master balances"><Icon name="settings" size={14} /></a>
		</div>
		<ul class="list">
			{#each dash?.heads || [] as head}
				<li>
					<span class="head-code">{head.code}</span>
					<span class="grow">
						<strong>{head.name}</strong>
						<span class="cell-sub">{plural(head.usage_count, 'entry', 'entries')}</span>
					</span>
					<span class="amount" class:neg={head.balance < 0}>{formatINR(head.balance)}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>

<div class="split">
	<section class="card">
		<div class="card-header">
			<div>
				<h2>Recent activity</h2>
				<p>Latest entries recorded</p>
			</div>
		</div>
		{#if dash && dash.recent.length === 0}
			<div class="empty">
				<span class="empty-icon"><Icon name="list" size={20} /></span>
				<h3>No entries yet</h3>
				<p>Record your first income or expense to see it here.</p>
			</div>
		{:else}
			<ul class="list">
				{#each dash?.recent || [] as row}
					<li>
						<span class="kind {row.kind}"><Icon name={row.kind === 'income' ? 'arrowDownRight' : 'arrowUpRight'} size={14} /></span>
						<span class="grow">
							<strong>{row.entity_name || 'Unassigned'}</strong>
							<span class="cell-sub">{labelize(row.source)} · {formatDate(row.date)}</span>
						</span>
						<span class="amount" class:pos={row.kind === 'income'}>{row.kind === 'income' ? '+' : '−'}{formatINR(row.amount)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card">
		<div class="card-header">
			<div>
				<h2>Bank accounts</h2>
				<p>{formatINR(dash?.total_account_balance)} in total</p>
			</div>
			<button class="btn btn-sm" type="button" on:click={toggleAccounts}>{showAccounts ? 'Hide' : 'Show'} balances</button>
		</div>
		{#if dash && dash.accounts.length === 0}
			<div class="empty">
				<span class="empty-icon"><Icon name="bank" size={20} /></span>
				<p>No accounts yet. <a href="/masters?tab=accounts">Add one in Masters</a>.</p>
			</div>
		{:else}
			<ul class="list">
				{#each dash?.accounts || [] as account}
					<li>
						<span class="head-code"><Icon name="bank" size={14} /></span>
						<span class="grow">
							<strong>{account.account_holder}</strong>
							<span class="cell-sub">{account.bank_name}{account.account_number ? ` · ${account.account_number}` : ''}</span>
						</span>
						<span class="amount" class:neg={showAccounts && account.account_balance < 0}>{showAccounts ? formatINR(account.account_balance) : '••••••'}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<div class="boards">
	<BoardList title="To-dos" subtitle="Daily action list" icon="clipboard" placeholder="Add a task" emptyText="No to-dos yet." items={boards.todos} on:change={(event) => saveBoard('todos', event.detail)} />
	<BoardList title="Coming income" subtitle="Expected inflows" icon="income" placeholder="Add expected income" emptyText="No planned income." items={boards.coming_income} on:change={(event) => saveBoard('coming_income', event.detail)} />
	<BoardList title="Coming expenses" subtitle="Planned payouts" icon="expense" placeholder="Add planned expense" emptyText="No planned expenses." items={boards.coming_expenses} on:change={(event) => saveBoard('coming_expenses', event.detail)} />
</div>

<style>
	.date-field {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 36px;
		padding: 0 10px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--muted);
		box-shadow: var(--shadow-sm);
	}
	.date-field:focus-within {
		border-color: var(--accent);
		box-shadow: var(--ring);
	}
	.date-field input {
		border: 0;
		background: transparent;
		outline: none;
		color: var(--text);
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
		gap: 16px;
	}
	.split > .card {
		margin-bottom: 16px;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 6px 8px;
	}
	.list li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 10px;
	}
	.list li + li {
		border-top: 1px solid var(--border);
		border-radius: 0;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.grow strong {
		display: block;
		font-weight: 550;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.head-code {
		display: grid;
		place-items: center;
		min-width: 40px;
		height: 30px;
		padding: 0 6px;
		border-radius: 8px;
		background: var(--surface-3);
		color: var(--text-2);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.03em;
	}
	.kind {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		flex: none;
	}
	.kind.income {
		background: var(--pos-soft);
		color: var(--pos);
	}
	.kind.expense {
		background: var(--neg-soft);
		color: var(--neg);
	}
	.boards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.empty a {
		color: var(--accent);
	}
	@media (max-width: 1100px) {
		.split,
		.boards {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
