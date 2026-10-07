<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { api } from '$lib/api.js';
	import { formatCompact, formatDate, initials } from '$lib/format.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import CompanyDialog from '$lib/components/CompanyDialog.svelte';

	export let data;

	let companies = [];
	let loading = true;
	let dialogOpen = false;
	let editingCompany = null;
	let deleting = null;
	let deleteConfirm = '';
	let deleteBusy = false;

	const load = async () => {
		try {
			companies = await api('/api/companies');
		} catch (err) {
			toast.error(err.message);
		} finally {
			loading = false;
		}
	};

	const openCreate = () => {
		editingCompany = null;
		dialogOpen = true;
	};
	const openEdit = (company) => {
		editingCompany = company;
		dialogOpen = true;
	};

	const onSaved = async (event) => {
		const wasEdit = Boolean(editingCompany);
		dialogOpen = false;
		toast.success(wasEdit ? `${event.detail.name} updated` : `${event.detail.name} created and selected`);
		await invalidateAll();
		await load();
	};

	const openCompany = async (company) => {
		try {
			if (company.id !== data.company?.id) await api('/api/companies/active', { method: 'PUT', body: { id: company.id } });
			await invalidateAll();
			await goto('/');
		} catch (err) {
			toast.error(err.message);
		}
	};

	const confirmDelete = async () => {
		deleteBusy = true;
		try {
			await api(`/api/companies/${deleting.id}`, { method: 'DELETE', body: { confirm_name: deleteConfirm } });
			toast.success(`${deleting.name} deleted. A backup was saved in data/backups.`);
			deleting = null;
			await invalidateAll();
			await load();
		} catch (err) {
			toast.error(err.message);
		} finally {
			deleteBusy = false;
		}
	};

	onMount(load);
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">Workspace</p>
		<h1>Companies</h1>
		<p>Each company has its own entries, masters, balances and reports.</p>
	</div>
	<div class="page-actions">
		<button class="btn btn-primary" type="button" on:click={openCreate}><Icon name="plus" size={15} /> New company</button>
	</div>
</header>

<div class="grid">
	{#each companies as company (company.id)}
		{@const net = company.total_income - company.total_expense}
		<article class="card company" class:current={company.id === data.company?.id} style="--c: {company.color}">
			<div class="top">
				<span class="avatar lg" style="background: {company.color}">{company.code || initials(company.name)}</span>
				<div class="names">
					<h2>{company.name}</h2>
					<p>{company.legal_name || company.address || 'No profile details yet'}</p>
				</div>
				{#if company.id === data.company?.id}<span class="badge badge-accent">Current</span>{/if}
			</div>
			<dl class="stats">
				<div><dt>Entries</dt><dd>{(company.income_count + company.expense_count).toLocaleString('en-IN')}</dd></div>
				<div><dt>Net</dt><dd class:pos={net > 0} class:neg={net < 0}>{formatCompact(net)}</dd></div>
				<div><dt>Entities</dt><dd>{company.entity_count}</dd></div>
				<div><dt>Projects</dt><dd>{company.project_count}</dd></div>
			</dl>
			<p class="meta">
				{#if company.tax_id}<span class="mono">{company.tax_id}</span> · {/if}
				{company.last_entry_date ? `Last entry ${formatDate(company.last_entry_date)}` : 'No entries yet'}
			</p>
			<div class="actions">
				<button class="btn btn-sm btn-ghost btn-danger-ghost" type="button" on:click={() => ((deleting = company), (deleteConfirm = ''))}><Icon name="trash" size={14} /> Delete</button>
				<span class="spacer"></span>
				<button class="btn btn-sm" type="button" on:click={() => openEdit(company)}><Icon name="edit" size={14} /> Edit</button>
				<button class="btn btn-sm btn-primary" type="button" on:click={() => openCompany(company)}>Open <Icon name="chevronRight" size={14} /></button>
			</div>
		</article>
	{/each}

	<button class="card add" type="button" on:click={openCreate}>
		<span class="empty-icon"><Icon name="plus" size={20} /></span>
		<strong>Create a company</strong>
		<span class="muted">Start a fresh set of books</span>
	</button>
</div>

{#if loading}<p class="muted">Loading companies…</p>{/if}

<CompanyDialog open={dialogOpen} company={editingCompany} companies={companies} on:close={() => (dialogOpen = false)} on:saved={onSaved} />

<Modal open={Boolean(deleting)} title="Delete {deleting?.name}?" width="480px" on:close={() => (deleting = null)}>
	{#if deleting}
		<div class="danger-note">
			<Icon name="alert" size={16} />
			<p>
				This permanently removes <strong>{deleting.income_count + deleting.expense_count} entries</strong>, {deleting.entity_count} entities, {deleting.project_count} projects,
				{deleting.account_count} accounts and every other record of this company. A backup copy of the database is saved first.
			</p>
		</div>
		<form id="delete-company" on:submit|preventDefault={confirmDelete}>
			<label class="field">
				<span class="label">Type <strong>{deleting.name}</strong> to confirm</span>
				<input class="input" bind:value={deleteConfirm} autocomplete="off" />
			</label>
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => (deleting = null)}>Cancel</button>
		<button class="btn btn-danger" type="submit" form="delete-company" disabled={deleteBusy || deleteConfirm.trim().toLowerCase() !== deleting?.name.toLowerCase()}>
			{deleteBusy ? 'Deleting…' : 'Delete company'}
		</button>
	</svelte:fragment>
</Modal>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 16px;
	}
	.company {
		margin: 0;
		padding: 18px;
		display: grid;
		gap: 14px;
		border-top: 3px solid var(--c);
	}
	.company.current {
		box-shadow: var(--shadow-md);
	}
	.top {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.avatar.lg {
		width: 44px;
		height: 44px;
		border-radius: 11px;
		font-size: 14px;
	}
	.names {
		flex: 1;
		min-width: 0;
	}
	.names p {
		color: var(--muted);
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin: 0;
		padding: 12px;
		border-radius: 10px;
		background: var(--surface-2);
		border: 1px solid var(--border);
	}
	.stats dt {
		font-size: 11.5px;
		color: var(--muted);
	}
	.stats dd {
		margin: 2px 0 0;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.meta {
		font-size: 12.5px;
		color: var(--muted);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.spacer {
		flex: 1;
	}
	.add {
		margin: 0;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 6px;
		min-height: 230px;
		border: 1.5px dashed var(--border-strong);
		background: transparent;
		box-shadow: none;
		cursor: pointer;
		color: var(--text);
	}
	.add:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.danger-note {
		display: flex;
		gap: 10px;
		padding: 12px;
		margin-bottom: 16px;
		border-radius: 10px;
		background: var(--neg-soft);
		color: var(--neg);
		font-size: 13px;
	}
	.danger-note p {
		color: var(--text-2);
	}
</style>
