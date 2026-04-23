<script>
	// @ts-nocheck
	import { onMount } from 'svelte';

	const today = new Date().toISOString().slice(0, 10);
	let selectedDate = today;
	let summary = { total_income: 0, total_expense: 0, net: 0, total_account_balance: 0 };
	let accounts = [];
	let showAccountBalances = false;
	let masters = {
		master_shree_balance: 0,
		master_pkb_balance: 0,
		master_hkj_balance: 0
	};
	let todos = [];
	let comingIncome = [];
	let comingExpenses = [];
	let newTodo = '';
	let newComingIncome = '';
	let newComingExpense = '';
	let message = '';

	const formatINR = (value) =>
		new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);

	const loadSummary = async () => {
		const res = await fetch(`/api/summary?date=${selectedDate}`);
		if (res.ok) summary = await res.json();
	};

	const loadMasters = async () => {
		const res = await fetch('/api/master-balances');
		if (res.ok) masters = await res.json();
	};

	const loadAccounts = async () => {
		const res = await fetch('/api/accounts');
		if (res.ok) accounts = await res.json();
	};

	const loadBoards = async () => {
		const res = await fetch('/api/boards');
		if (res.ok) {
			const data = await res.json();
			todos = data.todos || [];
			comingIncome = data.coming_income || [];
			comingExpenses = data.coming_expenses || [];
		}
	};

	const saveBoards = async () => {
		message = '';
		const res = await fetch('/api/boards', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				todos,
				coming_income: comingIncome,
				coming_expenses: comingExpenses
			})
		});
		if (res.ok) {
			message = 'Daily boards updated.';
		} else {
			message = 'Failed to save boards.';
		}
	};

	const addItem = async (kind) => {
		if (kind === 'todo') {
			const text = newTodo.trim();
			if (!text) return;
			todos = [...todos, { text, done: false }];
			newTodo = '';
		}
		if (kind === 'income') {
			const text = newComingIncome.trim();
			if (!text) return;
			comingIncome = [...comingIncome, { text, done: false }];
			newComingIncome = '';
		}
		if (kind === 'expense') {
			const text = newComingExpense.trim();
			if (!text) return;
			comingExpenses = [...comingExpenses, { text, done: false }];
			newComingExpense = '';
		}
		await saveBoards();
	};

	const toggleDone = async (kind, index) => {
		const list = kind === 'todo' ? todos : kind === 'income' ? comingIncome : comingExpenses;
		const updated = list.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
		if (kind === 'todo') todos = updated;
		if (kind === 'income') comingIncome = updated;
		if (kind === 'expense') comingExpenses = updated;
		await saveBoards();
	};

	const removeItem = async (kind, index) => {
		if (kind === 'todo') todos = todos.filter((_, i) => i !== index);
		if (kind === 'income') comingIncome = comingIncome.filter((_, i) => i !== index);
		if (kind === 'expense') comingExpenses = comingExpenses.filter((_, i) => i !== index);
		await saveBoards();
	};

	onMount(async () => {
		await loadSummary();
		await loadMasters();
		await loadAccounts();
		await loadBoards();
	});
</script>

<section class="hero-panel">
	<div>
		<p class="eyebrow">Balaji Daily Ledger</p>
		<h2>Daily Overview</h2>
		<p class="muted hero-copy">Track balances, review active accounts, and keep pending work visible without leaving the dashboard.</p>
	</div>
	<div class="hero-actions">
		<label class="date-chip">
			<span>Working Date</span>
			<input type="date" bind:value={selectedDate} on:change={loadSummary} />
		</label>
		<a class="primary-button" href="/income">Add Income</a>
		<a class="secondary-button" href="/expenses">Add Expense</a>
	</div>
</section>

<section class="stats-grid">
	<article class="stat-card">
		<span>Total Income</span>
		<strong>{formatINR(summary.total_income)}</strong>
		<small>Recorded credits for the selected day</small>
	</article>
	<article class="stat-card">
		<span>Total Expense</span>
		<strong>{formatINR(summary.total_expense)}</strong>
		<small>Recorded debits for the selected day</small>
	</article>
	<article class="stat-card">
		<span>Net Position</span>
		<strong>{formatINR(summary.net)}</strong>
		<small>Daily spread between inflow and outflow</small>
	</article>
	<article class="stat-card">
		<span>Accounts Balance</span>
		<strong>{formatINR(summary.total_account_balance)}</strong>
		<small>Total balance across tracked bank accounts</small>
	</article>
</section>

<section class="panel">
	<div class="section-header">
		<div>
			<h2>Balances Snapshot</h2>
			<p class="muted">Review master balances and optionally expand individual accounts.</p>
		</div>
		<div class="pill-note">INR ledger</div>
	</div>

	<div class="grid compact-grid">
		<div class="card balance-card">
			<h3>Master Balance (Shree)</h3>
			<p class="amount-value">{formatINR(masters.master_shree_balance)}</p>
			<small>Primary running balance</small>
		</div>
		<div class="card balance-card">
			<h3>Master Balance (PKB)</h3>
			<p class="amount-value">{formatINR(masters.master_pkb_balance)}</p>
			<small>Owner: Praveen Bhatt</small>
		</div>
		<div class="card balance-card">
			<h3>Master Balance (HKJ)</h3>
			<p class="amount-value">{formatINR(masters.master_hkj_balance)}</p>
			<small>Owner: Hemant Joshi</small>
		</div>
		<div class="card balance-card accent-card">
			<h3>Combined Account Balance</h3>
			<p class="amount-value">{formatINR(summary.total_account_balance)}</p>
			<small>Sum of all tracked bank accounts</small>
		</div>
	</div>

	<label class="toggle-row toggle-card">
		<input type="checkbox" bind:checked={showAccountBalances} />
		<span>Show individual account balances</span>
	</label>

	{#if showAccountBalances}
		<div class="grid account-grid">
			{#if accounts.length === 0}
				<div class="card balance-card empty-card">
					<h3>No accounts found</h3>
					<p class="muted">Add accounts from Masters to see balances here.</p>
				</div>
			{:else}
				{#each accounts as account}
					<div class="card balance-card account-card">
						<div class="account-header">
							<div>
								<h3>{account.account_holder}</h3>
								<small>{account.bank_name}</small>
							</div>
							<div class="pill-note">Account</div>
						</div>
						<p class="amount-value">{formatINR(account.account_balance)}</p>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</section>

<div class="board-grid">
	<section class="panel board-panel">
		<div class="section-header">
			<div>
				<h2>To-Dos</h2>
				<p class="muted">Daily action list for the team.</p>
			</div>
			<div class="pill-note">Checklist</div>
		</div>
		<div class="board-input">
			<input type="text" placeholder="Add task" bind:value={newTodo} />
			<button class="secondary" on:click={() => addItem('todo')}>Add</button>
		</div>
		<ul class="board-list">
			{#if todos.length === 0}
				<li class="board-empty">
					<p class="muted">No to-dos yet.</p>
				</li>
			{:else}
				{#each todos as item, index}
					<li class="board-row">
						<label class="line">
							<input type="checkbox" checked={item.done} on:change={() => toggleDone('todo', index)} />
							<span class:done={item.done}>{item.text}</span>
						</label>
						<button class="ghost" on:click={() => removeItem('todo', index)}>Remove</button>
					</li>
				{/each}
			{/if}
		</ul>
	</section>

	<section class="panel board-panel">
		<div class="section-header">
			<div>
				<h2>Coming Income</h2>
				<p class="muted">Notes for expected incoming amounts.</p>
			</div>
			<div class="pill-note">Pipeline</div>
		</div>
		<div class="board-input">
			<input type="text" placeholder="Add coming income note" bind:value={newComingIncome} />
			<button class="secondary" on:click={() => addItem('income')}>Add</button>
		</div>
		<ul class="board-list">
			{#if comingIncome.length === 0}
				<li class="board-empty">
					<p class="muted">No planned income.</p>
				</li>
			{:else}
				{#each comingIncome as item, index}
					<li class="board-row">
						<label class="line">
							<input type="checkbox" checked={item.done} on:change={() => toggleDone('income', index)} />
							<span class:done={item.done}>{item.text}</span>
						</label>
						<button class="ghost" on:click={() => removeItem('income', index)}>Remove</button>
					</li>
				{/each}
			{/if}
		</ul>
	</section>

	<section class="panel board-panel">
		<div class="section-header">
			<div>
				<h2>Coming Expenses</h2>
				<p class="muted">Track planned payouts before they hit the ledger.</p>
			</div>
			<div class="pill-note">Outflow</div>
		</div>
		<div class="board-input">
			<input type="text" placeholder="Add coming expense note" bind:value={newComingExpense} />
			<button class="secondary" on:click={() => addItem('expense')}>Add</button>
		</div>
		<ul class="board-list">
			{#if comingExpenses.length === 0}
				<li class="board-empty">
					<p class="muted">No planned expenses.</p>
				</li>
			{:else}
				{#each comingExpenses as item, index}
					<li class="board-row">
						<label class="line">
							<input type="checkbox" checked={item.done} on:change={() => toggleDone('expense', index)} />
							<span class:done={item.done}>{item.text}</span>
						</label>
						<button class="ghost" on:click={() => removeItem('expense', index)}>Remove</button>
					</li>
				{/each}
			{/if}
		</ul>

		{#if message}
			<p class="muted board-message">{message}</p>
		{/if}
	</section>
</div>

<style>
	.hero-copy {
		max-width: 38rem;
	}

	.eyebrow {
		margin: 0 0 0.4rem;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.date-chip {
		min-width: 13.5rem;
	}

	.compact-grid,
	.account-grid {
		margin-top: 1rem;
	}

	.balance-card {
		display: grid;
		gap: 0.45rem;
	}

	.balance-card small {
		color: var(--muted);
	}

	.accent-card {
		background: linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 58%, var(--card-bg)), var(--card-bg));
	}

	.toggle-card {
		padding: 0.9rem 1rem;
		border-radius: 20px;
		background: color-mix(in srgb, var(--card-bg) 86%, transparent);
		border: 1px solid var(--border);
	}

	.account-header {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		align-items: flex-start;
	}

	.board-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.board-panel {
		height: 100%;
	}

	.board-list {
		margin-top: 0.35rem;
	}

	.board-row {
		padding: 0.85rem 0.9rem;
		border-radius: 18px;
		background: color-mix(in srgb, var(--card-bg) 90%, transparent);
		border: 1px solid var(--border);
	}

	.board-empty {
		justify-content: flex-start;
		padding: 0.95rem 0;
	}

	.board-message {
		margin-top: 1rem;
	}

	.done {
		text-decoration: line-through;
		opacity: 0.62;
	}

	.muted {
		color: var(--muted);
	}

	@media (max-width: 980px) {
		.board-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
