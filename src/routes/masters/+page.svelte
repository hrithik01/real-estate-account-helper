<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { BANKS } from '$lib/constants.js';

	let balances = { master_shree_start: 0, master_pkb_start: 0, master_hkj_start: 0 };
	let accounts = [];
	let projects = [];
	let entities = [];
	let message = '';
	let editingAccountId = null;
	let editingProjectId = null;
	let editingEntityId = null;
	let showProjectRegisteredOwner = false;
	let showProjectOfficialRecord = false;
	let filterEntityType = 'all';
	let filterEntityProjectId = 'all';
	let masterOptions = {
		expense_sources: [],
		credit_sources: [],
		entity_types: [],
		property_types: [],
		custom_expense_sources: [],
		custom_credit_sources: [],
		custom_entity_types: [],
		custom_property_types: []
	};
	let newExpenseSource = '';
	let newCreditSource = '';
	let newEntityType = '';
	let newPropertyType = '';

	let newAccount = {
		bank_name: 'PNB',
		account_number: '',
		account_holder: '',
		account_balance: 0,
		comments: ''
	};
	let newProject = {
		property_name: '',
		property_location: '',
		property_type: 'land',
		current_registered_owner_entity_id: '',
		official_record: '',
		comments: ''
	};
	let newEntity = { name: '', entity_type: 'customer', comments: '', project_ids: [] };
	let filteredEntities = [];

	const toggleSelection = (list, value) => {
		const normalized = String(value);
		return list.map(String).includes(normalized)
			? list.filter((item) => String(item) !== normalized)
			: [...list, normalized];
	};

	const getSelectedProjectNames = (selectedIds, emptyLabel = 'Select projects') => {
		const names = projects
			.filter((project) => selectedIds?.map(String).includes(String(project.id)))
			.map((project) => project.property_name);

		return names.length > 0 ? names.join(', ') : emptyLabel;
	};

	const normalizeEntityRecord = (entity) => ({
		...entity,
		project_ids: entity.project_ids || [],
		project_names: entity.project_names || []
	});

	const loadAll = async () => {
		const [balancesRes, accountsRes, projectsRes, entitiesRes, optionsRes] = await Promise.all([
			fetch('/api/master-balances'),
			fetch('/api/accounts'),
			fetch('/api/projects'),
			fetch('/api/entities'),
			fetch('/api/master-options')
		]);
		if (balancesRes.ok) balances = await balancesRes.json();
		if (accountsRes.ok) accounts = await accountsRes.json();
		if (projectsRes.ok) projects = await projectsRes.json();
		if (entitiesRes.ok) entities = (await entitiesRes.json()).map(normalizeEntityRecord);
		if (optionsRes.ok) masterOptions = await optionsRes.json();
	};

	const saveMasterOptions = async (updated) => {
		const res = await fetch('/api/master-options', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updated)
		});
		if (res.ok) {
			masterOptions = await res.json();
			await loadAll();
		}
	};

	const addCustomOption = async (kind) => {
		if (kind === 'expense') {
			const value = newExpenseSource.trim();
			if (!value) return;
			await saveMasterOptions({
				...masterOptions,
				custom_expense_sources: [...(masterOptions.custom_expense_sources || []), value]
			});
			newExpenseSource = '';
			return;
		}
		if (kind === 'credit') {
			const value = newCreditSource.trim();
			if (!value) return;
			await saveMasterOptions({
				...masterOptions,
				custom_credit_sources: [...(masterOptions.custom_credit_sources || []), value]
			});
			newCreditSource = '';
			return;
		}
		if (kind === 'entity') {
			const value = newEntityType.trim();
			if (!value) return;
			await saveMasterOptions({
				...masterOptions,
				custom_entity_types: [...(masterOptions.custom_entity_types || []), value]
			});
			newEntityType = '';
			return;
		}
		if (kind === 'property') {
			const value = newPropertyType.trim();
			if (!value) return;
			await saveMasterOptions({
				...masterOptions,
				custom_property_types: [...(masterOptions.custom_property_types || []), value]
			});
			newPropertyType = '';
		}
	};

	const saveBalances = async () => {
		message = '';
		const res = await fetch('/api/master-balances', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(balances)
		});
		if (res.ok) {
			balances = await res.json();
			message = 'Master balances updated.';
		}
	};

	const addAccount = async () => {
		const res = await fetch('/api/accounts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(newAccount)
		});
		if (res.ok) {
			newAccount = {
				bank_name: 'PNB',
				account_number: '',
				account_holder: '',
				account_balance: 0,
				comments: ''
			};
			await loadAll();
		}
	};

	const updateAccount = async (account) => {
		const isEditable = editingAccountId === account.id;
		await fetch(`/api/accounts/${account.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...account, allow_balance_edit: isEditable })
		});
		editingAccountId = null;
		await loadAll();
	};

	const deleteAccount = async (account) => {
		const accountName = account.account_holder?.trim() || account.account_number?.trim() || `ID ${account.id}`;
		const shouldDelete = confirm(`Are you sure you want to delete account ${accountName}?`);
		if (!shouldDelete) return;
		const id = account.id;
		await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
		if (editingAccountId === id) editingAccountId = null;
		await loadAll();
	};

	const addProject = async () => {
		const res = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...newProject,
				current_registered_owner_entity_id: newProject.current_registered_owner_entity_id || null
			})
		});
		if (res.ok) {
			newProject = {
				property_name: '',
				property_location: '',
				property_type: 'land',
				current_registered_owner_entity_id: '',
				official_record: '',
				comments: ''
			};
			await loadAll();
		}
	};

	const updateProject = async (project) => {
		await fetch(`/api/projects/${project.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				...project,
				current_registered_owner_entity_id: project.current_registered_owner_entity_id || null
			})
		});
		editingProjectId = null;
		await loadAll();
	};

	const deleteProject = async (project) => {
		const projectName = project.property_name?.trim() || `ID ${project.id}`;
		const shouldDelete = confirm(`Are you sure you want to delete project ${projectName}?`);
		if (!shouldDelete) return;
		const id = project.id;
		await fetch(`/api/projects/${id}`, { method: 'DELETE' });
		if (editingProjectId === id) editingProjectId = null;
		await loadAll();
	};

	const addEntity = async () => {
		const res = await fetch('/api/entities', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(newEntity)
		});
		if (res.ok) {
			newEntity = { name: '', entity_type: 'customer', comments: '', project_ids: [] };
			await loadAll();
		}
	};

	const updateEntity = async (entity) => {
		await fetch(`/api/entities/${entity.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(entity)
		});
		editingEntityId = null;
		await loadAll();
	};

	const deleteEntity = async (entity) => {
		const entityName = entity.name?.trim() || `ID ${entity.id}`;
		const shouldDelete = confirm(`Are you sure you want to delete entity ${entityName}?`);
		if (!shouldDelete) return;
		const id = entity.id;
		await fetch(`/api/entities/${id}`, { method: 'DELETE' });
		if (editingEntityId === id) editingEntityId = null;
		await loadAll();
	};

	$: filteredEntities = entities.filter((entity) => {
		if (filterEntityType !== 'all' && entity.entity_type !== filterEntityType) return false;
		if (
			filterEntityProjectId !== 'all' &&
			!(entity.project_ids || []).map(String).includes(String(filterEntityProjectId))
		)
			return false;

		return true;
	});

	onMount(loadAll);
</script>

<section class="panel">
	<h2>Master Balances</h2>
	<p class="muted">PKB owner is Praveen Bhatt and HKJ owner is Hemant Joshi.</p>
	<div class="form-grid">
		<label><span>Master Balance (Shree)</span><input type="number" bind:value={balances.master_shree_start} /></label>
		<label><span>Master Balance (PKB)</span><input type="number" bind:value={balances.master_pkb_start} /></label>
		<label><span>Master Balance (HKJ)</span><input type="number" bind:value={balances.master_hkj_start} /></label>
	</div>
	<button on:click={saveBalances}>Save Balances</button>
	{#if message}<p class="muted">{message}</p>{/if}
</section>

<section class="panel">
	<h2>Master List Options</h2>
	<p class="muted">Add custom Expense/Credit Source, Entity Type, and Property Type values.</p>
	<div class="form-grid options-grid">
		<div class="option-field">
			<label><span>New Expense Source</span><input bind:value={newExpenseSource} placeholder="eg. service-contract" /></label>
			<button class="secondary" on:click={() => addCustomOption('expense')}>Add Expense Source</button>
		</div>
		<div class="option-field">
			<label><span>New Credit Source</span><input bind:value={newCreditSource} placeholder="eg. investor" /></label>
			<button class="secondary" on:click={() => addCustomOption('credit')}>Add Credit Source</button>
		</div>
		<div class="option-field">
			<label><span>New Entity Type</span><input bind:value={newEntityType} placeholder="eg. consultant" /></label>
			<button class="secondary" on:click={() => addCustomOption('entity')}>Add Entity Type</button>
		</div>
		<div class="option-field">
			<label><span>New Property Type</span><input bind:value={newPropertyType} placeholder="eg. commercial" /></label>
			<button class="secondary" on:click={() => addCustomOption('property')}>Add Property Type</button>
		</div>
	</div>
	<div class="chips-wrap">
		{#each (masterOptions.custom_expense_sources || []) as item}<span class="chip">Expense: {item}</span>{/each}
		{#each (masterOptions.custom_credit_sources || []) as item}<span class="chip">Credit: {item}</span>{/each}
		{#each (masterOptions.custom_entity_types || []) as item}<span class="chip">Entity: {item}</span>{/each}
		{#each (masterOptions.custom_property_types || []) as item}<span class="chip">Property: {item}</span>{/each}
	</div>
</section>

<section class="panel">
	<h2>Accounts</h2>
	<div class="form-grid">
		<label><span>Bank</span><select bind:value={newAccount.bank_name}>{#each BANKS as bank}<option value={bank}>{bank}</option>{/each}</select></label>
		<label><span>Account Number</span><input bind:value={newAccount.account_number} /></label>
		<label><span>Account Holder</span><input bind:value={newAccount.account_holder} /></label>
		<label><span>Balance</span><input type="number" bind:value={newAccount.account_balance} /></label>
		<label><span>Comments</span><input bind:value={newAccount.comments} /></label>
	</div>
	<button on:click={addAccount}>Add Account</button>
	<table>
		<thead><tr><th>Bank</th><th>Number</th><th>Holder</th><th>Balance</th><th>Comments</th><th>Action</th></tr></thead>
		<tbody>{#each accounts as account}<tr>
			<td><select bind:value={account.bank_name} disabled={editingAccountId !== account.id}>{#each BANKS as bank}<option value={bank}>{bank}</option>{/each}</select></td>
			<td><input bind:value={account.account_number} readonly={editingAccountId !== account.id} /></td>
			<td><input bind:value={account.account_holder} readonly={editingAccountId !== account.id} /></td>
			<td>
				<div class="balance-cell">
					<input
						type="number"
						bind:value={account.account_balance}
						readonly={editingAccountId !== account.id}
					/>
				</div>
			</td>
			<td><input bind:value={account.comments} readonly={editingAccountId !== account.id} /></td>
			<td><button class="icon" type="button" on:click={() => (editingAccountId = editingAccountId === account.id ? null : account.id)} title="Edit">✎</button> <button class="secondary" on:click={() => updateAccount(account)}>Update</button> <button class="ghost" on:click={() => deleteAccount(account)}>Remove</button></td>
		</tr>{/each}</tbody>
	</table>
</section>

<section class="panel">
	<h2>Projects</h2>
	<div class="project-visibility">
		<label><input type="checkbox" bind:checked={showProjectRegisteredOwner} /> <span>Show current registered owner</span></label>
		<label><input type="checkbox" bind:checked={showProjectOfficialRecord} /> <span>Show official record</span></label>
	</div>
	<div class="form-grid">
		<label><span>Property Name</span><input bind:value={newProject.property_name} /></label>
		<label><span>Property Location</span><input bind:value={newProject.property_location} /></label>
		<label><span>Property Type</span><select bind:value={newProject.property_type}>{#each (masterOptions.property_types || []) as type}<option value={type}>{type}</option>{/each}</select></label>
		{#if showProjectRegisteredOwner}
			<label>
				<span>Current Registered Owner (Entity)</span>
				<select bind:value={newProject.current_registered_owner_entity_id}>
					<option value="">Select</option>
					{#each entities as entity}
						<option value={entity.id}>{entity.name} ({entity.entity_code})</option>
					{/each}
				</select>
			</label>
		{/if}
		{#if showProjectOfficialRecord}
			<label><span>Official Record</span><input bind:value={newProject.official_record} /></label>
		{/if}
		<label><span>Comments</span><input bind:value={newProject.comments} /></label>
	</div>
	<button on:click={addProject}>Add Project</button>
	<table>
		<thead>
			<tr>
				<th>Name</th>
				<th>Location</th>
				<th>Type</th>
				{#if showProjectRegisteredOwner}<th>Current Registered Owner</th>{/if}
				{#if showProjectOfficialRecord}<th>Official Record</th>{/if}
				<th>Comments</th>
				<th>Action</th>
			</tr>
		</thead>
		<tbody>{#each projects as project}<tr>
			<td><input bind:value={project.property_name} readonly={editingProjectId !== project.id} /></td>
			<td><input bind:value={project.property_location} readonly={editingProjectId !== project.id} /></td>
			<td><select bind:value={project.property_type} disabled={editingProjectId !== project.id}>{#each (masterOptions.property_types || []) as type}<option value={type}>{type}</option>{/each}</select></td>
			{#if showProjectRegisteredOwner}
				<td><select bind:value={project.current_registered_owner_entity_id} disabled={editingProjectId !== project.id}><option value="">Select</option>{#each entities as entity}<option value={entity.id}>{entity.name} ({entity.entity_code})</option>{/each}</select></td>
			{/if}
			{#if showProjectOfficialRecord}
				<td><input bind:value={project.official_record} readonly={editingProjectId !== project.id} /></td>
			{/if}
			<td><input bind:value={project.comments} readonly={editingProjectId !== project.id} /></td>
			<td><button class="icon" type="button" on:click={() => (editingProjectId = editingProjectId === project.id ? null : project.id)} title="Edit">✎</button> <button class="secondary" on:click={() => updateProject(project)}>Update</button> <button class="ghost" on:click={() => deleteProject(project)}>Remove</button></td>
		</tr>{/each}</tbody>
	</table>
</section>

<section class="panel">
	<h2>Entities</h2>
	<div class="form-grid">
		<label><span>Name</span><input bind:value={newEntity.name} /></label>
		<label><span>Type</span><select bind:value={newEntity.entity_type}>{#each (masterOptions.entity_types || []) as type}<option value={type}>{type}</option>{/each}</select></label>
		<label class="wide-field">
			<span>Attach Projects</span>
			<details class="multi-select">
				<summary class="multi-trigger">{getSelectedProjectNames(newEntity.project_ids)}</summary>
				<div class="multi-menu">
					{#each projects as project}
						<label class="multi-option">
							<input
								type="checkbox"
								checked={newEntity.project_ids?.map(String).includes(String(project.id))}
								on:change={() => (newEntity.project_ids = toggleSelection(newEntity.project_ids || [], project.id))}
							/>
							<span>{project.property_name}</span>
						</label>
					{/each}
				</div>
			</details>
		</label>
		<label><span>Comments</span><input bind:value={newEntity.comments} /></label>
	</div>
	<button on:click={addEntity}>Add Entity</button>
	<div class="entity-filters">
		<label>
			<span>Filter by Type</span>
			<select bind:value={filterEntityType}>
				<option value="all">All types</option>
				{#each (masterOptions.entity_types || []) as type}
					<option value={type}>{type}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>Filter by Project</span>
			<select bind:value={filterEntityProjectId}>
				<option value="all">All projects</option>
				{#each projects as project}
					<option value={String(project.id)}>{project.property_name}</option>
				{/each}
			</select>
		</label>
	</div>
	<table>
		<thead><tr><th>Name</th><th>Type</th><th>Code</th><th>Attached Projects</th><th>Comments</th><th>Action</th></tr></thead>
		<tbody>{#each filteredEntities as entity}<tr>
			<td><input bind:value={entity.name} readonly={editingEntityId !== entity.id} /></td>
			<td><select bind:value={entity.entity_type} disabled={editingEntityId !== entity.id}>{#each (masterOptions.entity_types || []) as type}<option value={type}>{type}</option>{/each}</select></td>
			<td>{entity.entity_code}</td>
			<td>
				{#if editingEntityId === entity.id}
					<details class="multi-select">
						<summary class="multi-trigger">{getSelectedProjectNames(entity.project_ids)}</summary>
						<div class="multi-menu">
							{#each projects as project}
								<label class="multi-option">
									<input
										type="checkbox"
										checked={entity.project_ids?.map(String).includes(String(project.id))}
										on:change={() => (entity.project_ids = toggleSelection(entity.project_ids || [], project.id))}
									/>
									<span>{project.property_name}</span>
								</label>
							{/each}
						</div>
					</details>
				{:else}
					<div class="readonly-list">{getSelectedProjectNames(entity.project_ids, '-')}</div>
				{/if}
			</td>
			<td><input bind:value={entity.comments} readonly={editingEntityId !== entity.id} /></td>
			<td><button class="icon" type="button" on:click={() => (editingEntityId = editingEntityId === entity.id ? null : entity.id)} title="Edit">✎</button> <button class="secondary" on:click={() => updateEntity(entity)}>Update</button> <button class="ghost" on:click={() => deleteEntity(entity)}>Remove</button></td>
		</tr>{/each}</tbody>
	</table>
</section>

<style>
	.panel { background: var(--panel-bg); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); margin-bottom: 20px; }
	.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 16px 0; }
	.options-grid { align-items: end; }
	.option-field { display: grid; gap: 8px; }
	.option-field button { justify-self: start; }
	label { display: grid; gap: 6px; color: var(--muted); font-size: 14px; }
	input, select, button { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--input-bg); color: var(--text); }
	button { background: var(--primary-bg); color: var(--primary-text); border: none; cursor: pointer; }
	button.secondary { background: var(--secondary-bg); color: var(--secondary-text); border: 1px solid var(--border); }
	button.ghost { background: transparent; color: var(--ghost-text); border: 1px solid var(--border); }
	button.icon { padding: 8px 10px; min-width: 40px; }
	.project-visibility { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
	.project-visibility label { display: flex; align-items: center; gap: 8px; }
	.entity-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-top: 16px; }
	.chips-wrap { display: flex; gap: 8px; flex-wrap: wrap; }
	.chip { border: 1px solid var(--border); background: var(--card-bg); padding: 6px 10px; border-radius: 999px; font-size: 12px; }
	table { width: 100%; border-collapse: collapse; margin-top: 12px; }
	th, td { border-bottom: 1px solid var(--border); text-align: left; padding: 10px; vertical-align: top; }
	.muted { color: var(--muted); }
	.balance-cell { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
	.wide-field { grid-column: span 2; }
	.multi-select { position: relative; }
	.multi-select summary { list-style: none; }
	.multi-select summary::-webkit-details-marker { display: none; }
	.multi-trigger {
		display: flex;
		align-items: center;
		min-height: 42px;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--border);
		background: var(--input-bg);
		color: var(--text);
		cursor: pointer;
	}
	.multi-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 5;
		min-width: 100%;
		max-height: 220px;
		overflow: auto;
		padding: 10px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--panel-bg);
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
	}
	.multi-option {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 0;
		color: var(--text);
	}
	.readonly-list { min-height: 42px; display: flex; align-items: center; color: var(--text); }
	@media (max-width: 720px) {
		.wide-field { grid-column: span 1; }
	}
</style>
