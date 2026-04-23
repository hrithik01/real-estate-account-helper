<script>
	// @ts-nocheck
	import { onMount } from 'svelte';

	const today = new Date().toISOString().slice(0, 10);
	const PAYOUT_TYPES = [
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'quarterly', label: 'Quarterly' },
		{ value: 'half-yearly', label: 'Half Yearly' },
		{ value: 'annually', label: 'Annually' }
	];

	let entities = [];
	let financeList = [];
	let editingId = null;
	let draft = {};
	let message = '';
	let showInterest = true;
	let showInterestPayout = true;

	let form = {
		date: today,
		entity_id: '',
		amount: '',
		interest_rate: 1.5,
		interest_payout: 'monthly',
		comments: ''
	};

	const formatINR = (value) =>
		new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);

	const loadAll = async () => {
		const [entitiesRes, financeRes] = await Promise.all([fetch('/api/entities'), fetch('/api/finance')]);
		if (entitiesRes.ok) entities = await entitiesRes.json();
		if (financeRes.ok) financeList = await financeRes.json();
	};

	const submitFinance = async () => {
		message = '';
		const res = await fetch('/api/finance', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (res.ok) {
			message = 'Finance entry added.';
			form = {
				date: today,
				entity_id: '',
				amount: '',
				interest_rate: 1.5,
				interest_payout: 'monthly',
				comments: ''
			};
			await loadAll();
		} else {
			const error = await res.json();
			message = error.error || 'Failed to add finance entry.';
		}
	};

	const startEdit = (row) => {
		editingId = row.id;
		draft = {
			date: row.date,
			entity_id: row.entity_id || '',
			amount: row.amount,
			interest_rate: row.interest_rate,
			interest_payout: row.interest_payout,
			comments: row.comments || ''
		};
	};

	const saveEdit = async (id) => {
		message = '';
		const res = await fetch(`/api/finance/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(draft)
		});

		if (res.ok) {
			message = 'Finance entry updated.';
			editingId = null;
			await loadAll();
		} else {
			const error = await res.json();
			message = error.error || 'Failed to update finance entry.';
		}
	};

	const deleteEntry = async (id) => {
		if (!window.confirm('Delete this finance entry?')) return;
		const res = await fetch(`/api/finance/${id}`, { method: 'DELETE' });
		if (res.ok) {
			message = 'Finance entry deleted.';
			await loadAll();
		}
	};

	onMount(loadAll);
</script>

<section class="panel">
	<h2>Finance Board</h2>
	<p class="muted">Independent finance entries. These do not affect income/expense/master balances.</p>
	<div class="form-grid">
		<label><span>Date</span><input type="date" bind:value={form.date} /></label>
		<label>
			<span>Entity</span>
			<select bind:value={form.entity_id}>
				<option value="">Select</option>
				{#each entities as entity}
					<option value={entity.id}>{entity.name} ({entity.entity_code})</option>
				{/each}
			</select>
		</label>
		<label><span>Amount</span><input type="number" min="1" step="1" bind:value={form.amount} /></label>
		<label><span>Interest (%)</span><input type="number" min="0" step="0.01" bind:value={form.interest_rate} /></label>
		<label>
			<span>Interest Payout</span>
			<select bind:value={form.interest_payout}>
				{#each PAYOUT_TYPES as payout}
					<option value={payout.value}>{payout.label}</option>
				{/each}
			</select>
		</label>
		<label class="wide"><span>Comments</span><input type="text" bind:value={form.comments} /></label>
	</div>
	<button on:click={submitFinance}>Add Finance Entry</button>
	{#if message}<p class="muted">{message}</p>{/if}
</section>

<section class="panel">
	<h2>Finance Entries</h2>
	<div class="detail-toggles">
		<label><input type="checkbox" bind:checked={showInterest} /> <span>Show interest</span></label>
		<label><input type="checkbox" bind:checked={showInterestPayout} /> <span>Show interest payout</span></label>
	</div>
	<table>
		<thead>
			<tr>
				<th>Date</th>
				<th>Entity</th>
				<th>Amount</th>
				{#if showInterest}<th>Interest (%)</th>{/if}
				{#if showInterestPayout}<th>Interest Payout</th>{/if}
				<th>Comments</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#if financeList.length === 0}
				<tr><td colspan={5 + (showInterest ? 1 : 0) + (showInterestPayout ? 1 : 0)} class="muted">No finance entries.</td></tr>
			{:else}
				{#each financeList as row}
					<tr>
						<td>{#if editingId === row.id}<input type="date" bind:value={draft.date} />{:else}{row.date}{/if}</td>
						<td>
							{#if editingId === row.id}
								<select bind:value={draft.entity_id}>
									<option value="">Select</option>
									{#each entities as entity}
										<option value={entity.id}>{entity.name} ({entity.entity_code})</option>
									{/each}
								</select>
							{:else}
								{row.entity_name || '-'}
							{/if}
						</td>
						<td>{#if editingId === row.id}<input type="number" min="1" step="1" bind:value={draft.amount} />{:else}{formatINR(row.amount)}{/if}</td>
						{#if showInterest}
							<td>{#if editingId === row.id}<input type="number" min="0" step="0.01" bind:value={draft.interest_rate} />{:else}{row.interest_rate}%{/if}</td>
						{/if}
						{#if showInterestPayout}
							<td>
								{#if editingId === row.id}
									<select bind:value={draft.interest_payout}>
										{#each PAYOUT_TYPES as payout}
											<option value={payout.value}>{payout.label}</option>
										{/each}
									</select>
								{:else}
									{PAYOUT_TYPES.find((item) => item.value === row.interest_payout)?.label || row.interest_payout}
								{/if}
							</td>
						{/if}
						<td>{#if editingId === row.id}<input type="text" bind:value={draft.comments} />{:else}{row.comments || '-'}{/if}</td>
						<td>
							{#if editingId === row.id}
								<button class="secondary" on:click={() => saveEdit(row.id)}>Save</button>
								<button class="ghost" on:click={() => (editingId = null)}>Cancel</button>
							{:else}
								<button class="secondary" on:click={() => startEdit(row)}>Edit</button>
								<button class="ghost" on:click={() => deleteEntry(row.id)}>Delete</button>
							{/if}
						</td>
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</section>

<style>
	.panel { background: var(--panel-bg); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
	.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 16px 0; }
	label { display: grid; gap: 6px; color: var(--muted); font-size: 14px; }
	label.wide { grid-column: 1 / -1; }
	input, select, button { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); }
	button { background: var(--primary-bg); color: var(--primary-text); border: none; cursor: pointer; }
	button.secondary { background: var(--secondary-bg); color: var(--secondary-text); border: 1px solid var(--border); }
	button.ghost { background: transparent; color: var(--ghost-text); border: 1px solid var(--border); }
	.detail-toggles { display: flex; gap: 12px; flex-wrap: wrap; margin: 10px 0 14px; }
	.detail-toggles label { display: flex; align-items: center; gap: 6px; }
	table { width: 100%; border-collapse: collapse; margin-top: 12px; }
	th, td { border-bottom: 1px solid var(--border); text-align: left; padding: 10px; vertical-align: top; }
	.muted { color: var(--muted); }
</style>
