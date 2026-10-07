<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { api, storage } from '$lib/api.js';
	import { BANK_SUGGESTIONS } from '$lib/constants.js';
	import { formatINR, labelize, plural } from '$lib/format.js';
	import { confirmDialog } from '$lib/confirm.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import MultiSelect from '$lib/components/MultiSelect.svelte';

	export let data;

	const TABS = [
		{ key: 'accounts', label: 'Accounts', icon: 'bank' },
		{ key: 'projects', label: 'Projects', icon: 'map' },
		{ key: 'entities', label: 'Entities', icon: 'users' },
		{ key: 'balances', label: 'Master balances', icon: 'wallet' },
		{ key: 'lists', label: 'Custom lists', icon: 'list' }
	];
	const LIST_GROUPS = [
		{ key: 'expense_sources', custom: 'custom_expense_sources', label: 'Expense sources', placeholder: 'e.g. service-contract' },
		{ key: 'credit_sources', custom: 'custom_credit_sources', label: 'Credit sources', placeholder: 'e.g. investor' },
		{ key: 'entity_types', custom: 'custom_entity_types', label: 'Entity types', placeholder: 'e.g. consultant' },
		{ key: 'property_types', custom: 'custom_property_types', label: 'Property types', placeholder: 'e.g. commercial' }
	];

	let accounts = [];
	let projects = [];
	let entities = [];
	let heads = [];
	let options = { expense_sources: [], credit_sources: [], entity_types: [], property_types: [] };
	let loaded = false;
	let newListValues = {};

	let entitySearch = '';
	let filterEntityType = 'all';
	let filterEntityProjectId = 'all';
	let showProjectOwner = storage.get('ledger-project-owner') === '1';
	let showProjectRecord = storage.get('ledger-project-record') === '1';

	/** { type, id, values } while the add/edit dialog is open. */
	let editor = null;
	let saving = false;

	$: tab = TABS.some((item) => item.key === $page.url.searchParams.get('tab')) ? $page.url.searchParams.get('tab') : 'accounts';
	$: counts = { accounts: accounts.length, projects: projects.length, entities: entities.length, balances: heads.length };
	$: projectOptions = projects.map((project) => ({ value: String(project.id), label: project.property_name, hint: project.property_location }));
	$: filteredEntities = entities.filter((entity) => {
		if (filterEntityType !== 'all' && entity.entity_type !== filterEntityType) return false;
		if (filterEntityProjectId !== 'all' && !(entity.project_ids || []).map(String).includes(filterEntityProjectId)) return false;
		if (entitySearch && !`${entity.name} ${entity.comments || ''} ${entity.entity_code}`.toLowerCase().includes(entitySearch.toLowerCase())) return false;
		return true;
	});
	// Keep a removed custom type selectable while editing a record that still uses it.
	const withCurrent = (list, current) => (current && !list.includes(current) ? [current, ...list] : list);
	$: entityTypeChoices = withCurrent(options.entity_types, editor?.type === 'entity' ? editor.row?.entity_type : '');
	$: propertyTypeChoices = withCurrent(options.property_types, editor?.type === 'project' ? editor.row?.property_type : '');
	$: totalAccountBalance = accounts.reduce((sum, account) => sum + Number(account.account_balance || 0), 0);

	const setTab = (key) => goto(`?tab=${key}`, { replaceState: true, noScroll: true, keepFocus: true });

	const loadAll = async () => {
		try {
			[accounts, projects, entities, heads, options] = await Promise.all([
				api('/api/accounts'),
				api('/api/projects'),
				api('/api/entities'),
				api('/api/heads'),
				api('/api/master-options')
			]);
			loaded = true;
		} catch (err) {
			toast.error(err.message);
		}
	};

	const BLANK = {
		account: () => ({ bank_name: '', account_number: '', account_holder: '', account_balance: '', comments: '', allow_balance_edit: false }),
		project: () => ({ property_name: '', property_location: '', property_type: options.property_types[0] || 'land', current_registered_owner_entity_id: '', official_record: '', comments: '' }),
		entity: () => ({ name: '', entity_type: options.entity_types[0] || 'customer', comments: '', project_ids: [] }),
		head: () => ({ name: '', code: '', opening_balance: '' })
	};
	const NOUN = { account: 'account', project: 'project', entity: 'entity', head: 'master balance' };
	const ENDPOINT = { account: '/api/accounts', project: '/api/projects', entity: '/api/entities', head: '/api/heads' };

	const openCreate = (type) => (editor = { type, id: null, values: BLANK[type]() });

	const openEdit = (type, row) => {
		const values = { ...BLANK[type]() };
		for (const key of Object.keys(values)) if (row[key] != null) values[key] = row[key];
		if (type === 'entity') values.project_ids = (row.project_ids || []).map(String);
		if (type === 'project') values.current_registered_owner_entity_id = row.current_registered_owner_entity_id ? String(row.current_registered_owner_entity_id) : '';
		editor = { type, id: row.id, values, row };
	};

	const saveEditor = async () => {
		const { type, id, values } = editor;
		saving = true;
		try {
			await api(id ? `${ENDPOINT[type]}/${id}` : ENDPOINT[type], { method: id ? 'PUT' : 'POST', body: values });
			toast.success(`${labelize(NOUN[type])} ${id ? 'updated' : 'added'}`);
			editor = null;
			await loadAll();
		} catch (err) {
			toast.error(err.message);
		} finally {
			saving = false;
		}
	};

	const removeRow = async (type, row, name, detail = '') => {
		const ok = await confirmDialog({ title: `Delete ${NOUN[type]} “${name}”?`, message: detail || 'This cannot be undone.' });
		if (!ok) return;
		try {
			await api(`${ENDPOINT[type]}/${row.id}`, { method: 'DELETE' });
			toast.success(`${labelize(NOUN[type])} deleted`);
			if (editor?.id === row.id) editor = null;
			await loadAll();
		} catch (err) {
			toast.error(err.message);
		}
	};

	const linkedNote = (count, what) =>
		count > 0 ? `${count} ${count === 1 ? 'entry references' : 'entries reference'} this ${what}; they will be kept but lose the link. This cannot be undone.` : 'This cannot be undone.';

	const saveLists = async (next) => {
		try {
			options = await api('/api/master-options', { method: 'PUT', body: next });
			return true;
		} catch (err) {
			toast.error(err.message);
			return false;
		}
	};

	const addListValue = async (group) => {
		const value = String(newListValues[group.key] || '').trim();
		if (!value) return;
		if (options[group.key].some((item) => item.toLowerCase() === value.toLowerCase())) return toast.error(`“${value}” already exists.`);
		if (await saveLists({ ...options, [group.custom]: [...options[group.custom], value] })) {
			newListValues = { ...newListValues, [group.key]: '' };
			toast.success(`Added “${value}” to ${group.label.toLowerCase()}`);
		}
	};

	const removeListValue = async (group, value) => {
		const ok = await confirmDialog({
			title: `Remove “${value}”?`,
			message: 'Existing entries keep this value; it just won’t be offered for new entries.',
			confirmLabel: 'Remove'
		});
		if (ok && (await saveLists({ ...options, [group.custom]: options[group.custom].filter((item) => item !== value) }))) {
			toast.success(`Removed “${value}”`);
		}
	};

	const toggleProjectColumn = (which) => {
		if (which === 'owner') storage.set('ledger-project-owner', (showProjectOwner = !showProjectOwner) ? '1' : '');
		else storage.set('ledger-project-record', (showProjectRecord = !showProjectRecord) ? '1' : '');
	};

	onMount(loadAll);
</script>

<header class="page-header">
	<div>
		<p class="eyebrow">{data.company.name}</p>
		<h1>Masters</h1>
		<p>Accounts, projects, entities, master balances and the lists used across entries.</p>
	</div>
</header>

<div class="tabs" role="tablist">
	{#each TABS as item}
		<button type="button" role="tab" aria-selected={tab === item.key} class:active={tab === item.key} on:click={() => setTab(item.key)}>
			<Icon name={item.icon} size={15} />
			{item.label}
			{#if counts[item.key] !== undefined && loaded}<span class="count">{counts[item.key]}</span>{/if}
		</button>
	{/each}
</div>

{#if tab === 'accounts'}
	<section class="card">
		<div class="card-header">
			<div>
				<h2>Bank accounts</h2>
				<p>Balances move automatically with account-mode entries · total {formatINR(totalAccountBalance)}</p>
			</div>
			<button class="btn btn-primary" type="button" on:click={() => openCreate('account')}><Icon name="plus" size={15} /> Add account</button>
		</div>
		<div class="table-wrap">
			<table class="table">
				<thead><tr><th>Account holder</th><th>Bank</th><th>Account number</th><th class="num">Entries</th><th class="num">Balance</th><th class="actions"><span class="sr-only">Actions</span></th></tr></thead>
				<tbody>
					{#each accounts as account (account.id)}
						<tr>
							<td class="primary">{account.account_holder}{#if account.comments}<span class="cell-sub">{account.comments}</span>{/if}</td>
							<td>{account.bank_name}</td>
							<td class="mono">{account.account_number || '—'}</td>
							<td class="num">{account.transaction_count}</td>
							<td class="num amount" class:neg={account.account_balance < 0}>{formatINR(account.account_balance)}</td>
							<td class="actions">
								<span class="row-actions">
									<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit {account.account_holder}" on:click={() => openEdit('account', account)}><Icon name="edit" size={15} /></button>
									<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete {account.account_holder}" on:click={() => removeRow('account', account, account.account_holder, linkedNote(account.transaction_count, 'account'))}><Icon name="trash" size={15} /></button>
								</span>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6"><div class="empty"><span class="empty-icon"><Icon name="bank" size={20} /></span><h3>No accounts yet</h3><p>Add the bank accounts this company transacts through.</p></div></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{:else if tab === 'projects'}
	<section class="card">
		<div class="card-header">
			<div>
				<h2>Projects &amp; properties</h2>
				<p>Entries and entities can be linked to one or more projects</p>
			</div>
			<div class="page-actions">
				<button type="button" class="toggle-chip" class:on={showProjectOwner} aria-pressed={showProjectOwner} on:click={() => toggleProjectColumn('owner')}>Registered owner</button>
				<button type="button" class="toggle-chip" class:on={showProjectRecord} aria-pressed={showProjectRecord} on:click={() => toggleProjectColumn('record')}>Official record</button>
				<button class="btn btn-primary" type="button" on:click={() => openCreate('project')}><Icon name="plus" size={15} /> Add project</button>
			</div>
		</div>
		<div class="table-wrap">
			<table class="table">
				<thead>
					<tr>
						<th>Project</th><th>Type</th>
						{#if showProjectOwner}<th>Registered owner</th>{/if}
						{#if showProjectRecord}<th>Official record</th>{/if}
						<th>Comments</th><th class="num">Entries</th><th class="actions"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each projects as project (project.id)}
						<tr>
							<td class="primary">{project.property_name}<span class="cell-sub">{project.property_location}</span></td>
							<td><span class="badge">{labelize(project.property_type)}</span></td>
							{#if showProjectOwner}<td>{project.current_registered_owner_name || '—'}</td>{/if}
							{#if showProjectRecord}<td>{project.official_record || '—'}</td>{/if}
							<td class="muted">{project.comments || '—'}</td>
							<td class="num">{project.transaction_count}</td>
							<td class="actions">
								<span class="row-actions">
									<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit {project.property_name}" on:click={() => openEdit('project', project)}><Icon name="edit" size={15} /></button>
									<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete {project.property_name}" on:click={() => removeRow('project', project, project.property_name, linkedNote(project.transaction_count, 'project'))}><Icon name="trash" size={15} /></button>
								</span>
							</td>
						</tr>
					{:else}
						<tr><td colspan="7"><div class="empty"><span class="empty-icon"><Icon name="map" size={20} /></span><h3>No projects yet</h3><p>Add land, houses or projects to tag entries against.</p></div></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{:else if tab === 'entities'}
	<section class="card">
		<div class="card-header">
			<div>
				<h2>Entities</h2>
				<p>Customers, merchants, partners and everyone else you transact with</p>
			</div>
			<button class="btn btn-primary" type="button" on:click={() => openCreate('entity')}><Icon name="plus" size={15} /> Add entity</button>
		</div>
		<div class="toolbar filters">
			<label class="field grow">
				<span class="label">Search</span>
				<input class="input" bind:value={entitySearch} placeholder="Name, code or comment" />
			</label>
			<label class="field">
				<span class="label">Type</span>
				<select class="select" bind:value={filterEntityType}>
					<option value="all">All types</option>
					{#each options.entity_types as type}<option value={type}>{labelize(type)}</option>{/each}
				</select>
			</label>
			<label class="field">
				<span class="label">Project</span>
				<select class="select" bind:value={filterEntityProjectId}>
					<option value="all">All projects</option>
					{#each projects as project (project.id)}<option value={String(project.id)}>{project.property_name}</option>{/each}
				</select>
			</label>
		</div>
		<div class="table-wrap">
			<table class="table">
				<thead><tr><th>Name</th><th>Type</th><th>Code</th><th>Projects</th><th class="num">Entries</th><th class="actions"><span class="sr-only">Actions</span></th></tr></thead>
				<tbody>
					{#each filteredEntities as entity (entity.id)}
						<tr>
							<td class="primary">{entity.name}{#if entity.comments}<span class="cell-sub">{entity.comments}</span>{/if}</td>
							<td><span class="badge">{labelize(entity.entity_type)}</span></td>
							<td class="mono">{entity.entity_code}</td>
							<td>{entity.project_names?.length ? entity.project_names.join(', ') : '—'}</td>
							<td class="num">{entity.transaction_count}</td>
							<td class="actions">
								<span class="row-actions">
									<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit {entity.name}" on:click={() => openEdit('entity', entity)}><Icon name="edit" size={15} /></button>
									<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete {entity.name}" on:click={() => removeRow('entity', entity, entity.name, linkedNote(entity.transaction_count, 'entity'))}><Icon name="trash" size={15} /></button>
								</span>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6"><div class="empty"><span class="empty-icon"><Icon name="users" size={20} /></span><h3>{entities.length ? 'No entities match' : 'No entities yet'}</h3><p>{entities.length ? 'Try a different search or filter.' : 'Every entry is recorded against an entity.'}</p></div></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="card-footer"><span class="muted">Showing {filteredEntities.length} of {entities.length}</span></div>
	</section>
{:else if tab === 'balances'}
	<section class="card">
		<div class="card-header">
			<div>
				<h2>Master balances</h2>
				<p>Every entry is attached to one master balance. Balance = opening + income − expense.</p>
			</div>
			<button class="btn btn-primary" type="button" on:click={() => openCreate('head')}><Icon name="plus" size={15} /> Add master balance</button>
		</div>
		<div class="table-wrap">
			<table class="table">
				<thead><tr><th>Name</th><th>Code</th><th class="num">Opening</th><th class="num">Income</th><th class="num">Expense</th><th class="num">Balance</th><th class="actions"><span class="sr-only">Actions</span></th></tr></thead>
				<tbody>
					{#each heads as head (head.id)}
						<tr>
							<td class="primary">{head.name}<span class="cell-sub">{plural(head.usage_count, 'entry', 'entries')}</span></td>
							<td><span class="badge mono">{head.code}</span></td>
							<td class="num">{formatINR(head.opening_balance)}</td>
							<td class="num pos">{formatINR(head.total_income)}</td>
							<td class="num">{formatINR(head.total_expense)}</td>
							<td class="num amount" class:neg={head.balance < 0}>{formatINR(head.balance)}</td>
							<td class="actions">
								<span class="row-actions">
									<button class="btn btn-ghost btn-icon btn-sm" type="button" aria-label="Edit {head.name}" on:click={() => openEdit('head', head)}><Icon name="edit" size={15} /></button>
									<button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" aria-label="Delete {head.name}" disabled={head.usage_count > 0 || heads.length <= 1} title={head.usage_count > 0 ? 'In use by entries' : heads.length <= 1 ? 'At least one is required' : 'Delete'} on:click={() => removeRow('head', head, head.name)}><Icon name="trash" size={15} /></button>
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{:else}
	<div class="lists">
		{#each LIST_GROUPS as group}
			<section class="card">
				<div class="card-header">
					<div>
						<h2>{group.label}</h2>
						<p>{options[group.custom]?.length || 0} custom · {(options[group.key]?.length || 0) - (options[group.custom]?.length || 0)} built-in</p>
					</div>
				</div>
				<div class="card-body">
					<form class="add-row" on:submit|preventDefault={() => addListValue(group)}>
						<input class="input" bind:value={newListValues[group.key]} placeholder={group.placeholder} aria-label="New {group.label}" />
						<button class="btn" type="submit"><Icon name="plus" size={14} /> Add</button>
					</form>
					<div class="chip-row">
						{#each options[group.custom] || [] as value}
							<span class="chip">{value}<button type="button" aria-label="Remove {value}" on:click={() => removeListValue(group, value)}><Icon name="x" size={12} /></button></span>
						{/each}
					</div>
					<p class="builtin"><span class="muted">Built-in:</span> {(options[group.key] || []).filter((item) => !(options[group.custom] || []).includes(item)).map(labelize).join(', ')}</p>
				</div>
			</section>
		{/each}
	</div>
{/if}

<Modal open={Boolean(editor)} title={editor ? `${editor.id ? 'Edit' : 'Add'} ${NOUN[editor.type]}` : ''} width="600px" on:close={() => (editor = null)}>
	{#if editor}
		<form id="master-editor" class="form-grid" on:submit|preventDefault={saveEditor}>
			{#if editor.type === 'account'}
				<label class="field"><span class="label">Account holder <span class="req">*</span></span><input class="input" bind:value={editor.values.account_holder} required /></label>
				<label class="field">
					<span class="label">Bank <span class="req">*</span></span>
					<input class="input" list="bank-suggestions" bind:value={editor.values.bank_name} placeholder="Type or pick a bank" required />
					<datalist id="bank-suggestions">{#each BANK_SUGGESTIONS as bank}<option value={bank}></option>{/each}</datalist>
				</label>
				<label class="field"><span class="label">Account number</span><input class="input mono" bind:value={editor.values.account_number} /></label>
				{#if editor.id}
					<div class="field">
						<span class="label">Balance</span>
						<input class="input" type="number" step="any" bind:value={editor.values.account_balance} disabled={!editor.values.allow_balance_edit} />
						<label class="check"><input type="checkbox" bind:checked={editor.values.allow_balance_edit} /> Override balance manually</label>
					</div>
				{:else}
					<label class="field"><span class="label">Opening balance</span><input class="input" type="number" step="any" bind:value={editor.values.account_balance} placeholder="0" /></label>
				{/if}
				<label class="field span-all"><span class="label">Comments</span><input class="input" bind:value={editor.values.comments} /></label>
			{:else if editor.type === 'project'}
				<label class="field"><span class="label">Property name <span class="req">*</span></span><input class="input" bind:value={editor.values.property_name} required /></label>
				<label class="field"><span class="label">Location <span class="req">*</span></span><input class="input" bind:value={editor.values.property_location} required /></label>
				<label class="field">
					<span class="label">Type</span>
					<select class="select" bind:value={editor.values.property_type}>{#each propertyTypeChoices as type}<option value={type}>{labelize(type)}</option>{/each}</select>
				</label>
				<label class="field">
					<span class="label">Registered owner</span>
					<select class="select" bind:value={editor.values.current_registered_owner_entity_id}>
						<option value="">None</option>
						{#each entities as entity (entity.id)}<option value={String(entity.id)}>{entity.name} ({entity.entity_code})</option>{/each}
					</select>
				</label>
				<label class="field span-all"><span class="label">Official record</span><input class="input" bind:value={editor.values.official_record} placeholder="Khasra / registry / file reference" /></label>
				<label class="field span-all"><span class="label">Comments</span><input class="input" bind:value={editor.values.comments} /></label>
			{:else if editor.type === 'entity'}
				<label class="field"><span class="label">Name <span class="req">*</span></span><input class="input" bind:value={editor.values.name} required /></label>
				<label class="field">
					<span class="label">Type</span>
					<select class="select" bind:value={editor.values.entity_type}>{#each entityTypeChoices as type}<option value={type}>{labelize(type)}</option>{/each}</select>
					<span class="hint">The entity code is generated from the type.</span>
				</label>
				<div class="field span-all">
					<span class="label">Linked projects</span>
					<MultiSelect options={projectOptions} bind:value={editor.values.project_ids} placeholder="No projects" emptyLabel="No projects yet." />
				</div>
				<label class="field span-all"><span class="label">Comments</span><input class="input" bind:value={editor.values.comments} /></label>
			{:else if editor.type === 'head'}
				<label class="field"><span class="label">Name <span class="req">*</span></span><input class="input" bind:value={editor.values.name} placeholder="e.g. Partner A" required /></label>
				<label class="field">
					<span class="label">Code</span>
					<input class="input mono" bind:value={editor.values.code} maxlength="12" placeholder="Auto" style="text-transform: uppercase" />
					{#if editor.id && editor.row?.usage_count > 0}<span class="hint">Changing the code updates all {editor.row.usage_count} linked entries.</span>{/if}
				</label>
				<label class="field"><span class="label">Opening balance</span><input class="input" type="number" step="any" bind:value={editor.values.opening_balance} placeholder="0" /></label>
			{/if}
		</form>
	{/if}
	<svelte:fragment slot="footer">
		<button class="btn" type="button" on:click={() => (editor = null)}>Cancel</button>
		<button class="btn btn-primary" type="submit" form="master-editor" disabled={saving}>{saving ? 'Saving…' : editor?.id ? 'Save changes' : 'Add'}</button>
	</svelte:fragment>
</Modal>

<style>
	.filters {
		padding: 14px 20px;
		border-bottom: 1px solid var(--border);
	}
	.filters .field {
		flex: 1 1 160px;
	}
	.filters .field.grow {
		flex: 2 1 240px;
	}
	.lists {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.lists .card {
		margin: 0;
	}
	.add-row {
		display: flex;
		gap: 8px;
		margin-bottom: 14px;
	}
	.builtin {
		margin-top: 14px;
		font-size: 12.5px;
		color: var(--text-2);
		line-height: 1.7;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: var(--text-2);
		cursor: pointer;
	}
	@media (max-width: 900px) {
		.lists {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
