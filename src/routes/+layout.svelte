<script>
	// @ts-nocheck
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { api, setActiveCompanyId, storage } from '$lib/api.js';
	import { initials } from '$lib/format.js';
	import { toast } from '$lib/toast.js';
	import Icon from '$lib/components/Icon.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import ConfirmHost from '$lib/components/ConfirmHost.svelte';
	import CompanyDialog from '$lib/components/CompanyDialog.svelte';

	export let data;

	const NAV = [
		{
			section: 'Books',
			items: [
				{ href: '/', label: 'Overview', icon: 'home' },
				{ href: '/income', label: 'Income', icon: 'income' },
				{ href: '/expenses', label: 'Expenses', icon: 'expense' },
				{ href: '/finance', label: 'Finance', icon: 'finance' },
				{ href: '/sheets', label: 'Independent Sheets', icon: 'clipboard' }
			]
		},
		{ section: 'Analyse', items: [{ href: '/reports', label: 'Reports', icon: 'report' }] },
		{
			section: 'Setup',
			items: [
				{ href: '/masters', label: 'Masters', icon: 'masters' },
				{ href: '/companies', label: 'Companies', icon: 'building' }
			]
		}
	];
	const ALL_ITEMS = NAV.flatMap((group) => group.items);

	let theme = 'light';
	let switcherOpen = false;
	let switcherEl;
	let navOpen = false;
	let createOpen = false;

	$: company = data.company;
	$: companies = data.companies || [];
	$: setActiveCompanyId(company?.id);
	// Dialogs and toasts render outside the shell, so the company colour also goes on <html>.
	$: if (browser) document.documentElement.style.setProperty('--accent', company?.color || '#2563eb');
	$: pageTitle = ALL_ITEMS.find((item) => item.href === $page.url.pathname)?.label || 'Company Ledger';
	$: isActive = (href) => (href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href));

	const toggleTheme = () => {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		storage.set('ledger-theme', theme);
	};

	const switchCompany = async (target) => {
		switcherOpen = false;
		if (target.id === company?.id) return;
		try {
			await api('/api/companies/active', { method: 'PUT', body: { id: target.id } });
			await invalidateAll();
			toast.success(`Switched to ${target.name}`);
		} catch (err) {
			toast.error(err.message);
		}
	};

	const onCompanyCreated = async (event) => {
		createOpen = false;
		await invalidateAll();
		toast.success(`${event.detail.name} created and selected`);
	};

	const onWindowClick = (event) => {
		if (switcherOpen && switcherEl && !switcherEl.contains(event.target)) switcherOpen = false;
	};

	afterNavigate(() => {
		navOpen = false;
		switcherOpen = false;
	});

	onMount(() => {
		theme = document.documentElement.dataset.theme || 'light';
	});
</script>

<svelte:head>
	<title>{company ? `${pageTitle} · ${company.name}` : 'Company Ledger'}</title>
	<meta name="description" content="Company Ledger — income, expenses, masters, finance and reports for every company you run." />
</svelte:head>

<svelte:window on:mousedown={onWindowClick} on:keydown={(event) => event.key === 'Escape' && (switcherOpen = false)} />

<div class="shell accent-scope" style={company ? `--accent: ${company.color}` : ''}>
	<aside class="sidebar no-print" class:open={navOpen}>
		<div class="brand">
			<span class="brand-mark"><Icon name="logo" size={18} stroke={2} /></span>
			<div>
				<strong>Company Ledger</strong>
				<span>Books &amp; reports</span>
			</div>
		</div>

		{#if company}
			<div class="switcher" bind:this={switcherEl}>
				<button class="switcher-btn" type="button" aria-haspopup="menu" aria-expanded={switcherOpen} on:click={() => (switcherOpen = !switcherOpen)}>
					<span class="avatar" style="background: {company.color}">{company.code || initials(company.name)}</span>
					<span class="switcher-text">
						<strong>{company.name}</strong>
						<span>{companies.length} {companies.length === 1 ? 'company' : 'companies'}</span>
					</span>
					<Icon name="chevronsUpDown" size={14} />
				</button>
				{#if switcherOpen}
					<div class="switcher-menu" role="menu">
						<p class="menu-label">Switch company</p>
						{#each companies as item (item.id)}
							<button type="button" role="menuitem" class="menu-item" class:current={item.id === company.id} on:click={() => switchCompany(item)}>
								<span class="avatar sm" style="background: {item.color}">{item.code || initials(item.name)}</span>
								<span class="menu-name">{item.name}</span>
								{#if item.id === company.id}<Icon name="check" size={14} stroke={2.25} />{/if}
							</button>
						{/each}
						<div class="menu-divider"></div>
						<button type="button" role="menuitem" class="menu-item" on:click={() => ((switcherOpen = false), (createOpen = true))}>
							<span class="menu-icon"><Icon name="plus" size={14} /></span>
							<span class="menu-name">New company</span>
						</button>
						<a role="menuitem" class="menu-item" href="/companies" on:click={() => (switcherOpen = false)}>
							<span class="menu-icon"><Icon name="settings" size={14} /></span>
							<span class="menu-name">Manage companies</span>
						</a>
					</div>
				{/if}
			</div>

			<nav aria-label="Main">
				{#each NAV as group}
					<p class="nav-section">{group.section}</p>
					{#each group.items as item}
						<a href={item.href} class:active={isActive(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
							<Icon name={item.icon} size={16} />
							{item.label}
						</a>
					{/each}
				{/each}
			</nav>
		{/if}

		<div class="sidebar-foot">
			<button class="theme-btn" type="button" on:click={toggleTheme}>
				<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
				{theme === 'dark' ? 'Light mode' : 'Dark mode'}
			</button>
		</div>
	</aside>

	{#if navOpen}
		<button class="scrim no-print" type="button" aria-label="Close menu" on:click={() => (navOpen = false)}></button>
	{/if}

	<div class="main">
		<header class="topbar no-print">
			<button class="btn btn-ghost btn-icon" type="button" aria-label="Open menu" on:click={() => (navOpen = true)}>
				<Icon name="menu" size={18} />
			</button>
			{#if company}
				<span class="avatar sm" style="background: {company.color}">{company.code || initials(company.name)}</span>
				<strong>{company.name}</strong>
			{:else}
				<strong>Company Ledger</strong>
			{/if}
		</header>

		<main class="content">
			{#if company}
				{#key company.id}
					<slot />
				{/key}
			{:else}
				<section class="onboarding">
					<span class="brand-mark big"><Icon name="building" size={28} /></span>
					<h1>Welcome to Company Ledger</h1>
					<p class="muted">Create your first company to start recording income, expenses and reports. You can add as many companies as you need and switch between them any time.</p>
					<button class="btn btn-primary" type="button" on:click={() => (createOpen = true)}>
						<Icon name="plus" size={16} /> Create a company
					</button>
				</section>
			{/if}
		</main>
	</div>
</div>

<CompanyDialog open={createOpen} {companies} on:close={() => (createOpen = false)} on:saved={onCompanyCreated} />
<ConfirmHost />
<Toaster />

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		min-height: 100vh;
	}
	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px 12px;
		background: var(--surface);
		border-right: 1px solid var(--border);
		overflow-y: auto;
		z-index: 60;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 8px 6px;
	}
	.brand strong {
		display: block;
		font-size: 15px;
		letter-spacing: -0.01em;
	}
	.brand span {
		font-size: 12px;
		color: var(--muted);
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--text);
		color: var(--surface);
		flex: none;
	}
	.brand-mark.big {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		background: var(--accent);
		color: #fff;
	}

	.switcher {
		position: relative;
	}
	.switcher-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: var(--surface-2);
		cursor: pointer;
		text-align: left;
		color: var(--muted);
		transition: border-color 0.12s ease, background 0.12s ease;
	}
	.switcher-btn:hover {
		border-color: var(--border-strong);
		background: var(--surface-3);
	}
	.switcher-btn:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
	.switcher-text {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.switcher-text strong {
		font-size: 13.5px;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.switcher-text span {
		font-size: 12px;
	}
	.switcher-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		z-index: 80;
		padding: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow-lg);
		max-height: 70vh;
		overflow-y: auto;
	}
	.menu-label {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--muted);
		padding: 6px 8px 4px;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 8px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		color: var(--text);
		text-align: left;
		text-decoration: none;
		font-size: 13.5px;
	}
	.menu-item:hover,
	.menu-item:focus-visible {
		background: var(--surface-3);
		outline: none;
	}
	.menu-item.current {
		font-weight: 600;
	}
	.menu-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-icon {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 1px dashed var(--border-strong);
		color: var(--muted);
	}
	.menu-divider {
		height: 1px;
		background: var(--border);
		margin: 6px 0;
	}
	.avatar.sm {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		font-size: 10px;
	}

	nav {
		display: grid;
		gap: 2px;
	}
	.nav-section {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--subtle);
		padding: 12px 10px 4px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		color: var(--text-2);
		text-decoration: none;
		font-weight: 500;
		transition: background 0.1s ease, color 0.1s ease;
	}
	nav a:hover {
		background: var(--surface-3);
		color: var(--text);
	}
	nav a.active {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	nav a:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}

	.sidebar-foot {
		margin-top: auto;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
	.theme-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		font-weight: 500;
	}
	.theme-btn:hover {
		background: var(--surface-3);
	}

	.main {
		min-width: 0;
	}
	.topbar {
		display: none;
	}
	.content {
		max-width: 1320px;
		margin: 0 auto;
		padding: 28px 32px 48px;
	}

	.onboarding {
		max-width: 520px;
		margin: 12vh auto 0;
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 14px;
	}
	.onboarding h1 {
		font-size: 26px;
	}
	.onboarding p {
		margin-bottom: 8px;
	}

	.scrim {
		display: none;
	}

	@media (max-width: 960px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
		}
		.sidebar {
			position: fixed;
			left: 0;
			top: 0;
			bottom: 0;
			width: min(var(--sidebar-w), 86vw);
			transform: translateX(-100%);
			transition: transform 0.2s ease;
			box-shadow: var(--shadow-lg);
		}
		.sidebar.open {
			transform: none;
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 55;
			border: 0;
			background: rgba(10, 13, 20, 0.45);
		}
		.topbar {
			display: flex;
			align-items: center;
			gap: 10px;
			position: sticky;
			top: 0;
			z-index: 40;
			padding: 10px 12px;
			background: color-mix(in srgb, var(--surface) 92%, transparent);
			backdrop-filter: blur(8px);
			border-bottom: 1px solid var(--border);
		}
		.content {
			padding: 20px 16px 40px;
		}
	}

	@media print {
		.shell {
			display: block;
		}
		.content {
			padding: 0;
			max-width: none;
		}
	}
</style>
