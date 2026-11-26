<script>
	// @ts-nocheck
	import '../app.css';
	import { onMount, tick } from 'svelte';
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
	let sidebarCollapsed = false;
	let switcherOpen = false;
	let switcherEl;
	let switcherButton;
	let navOpen = false;
	let mobileOpenButton;
	let mobileCloseButton;
	let createOpen = false;

	$: company = data.company;
	$: companies = data.companies || [];
	$: setActiveCompanyId(company?.id);
	// Dialogs and toasts render outside the shell, so the company colour also goes on <html>.
	$: if (browser) document.documentElement.style.setProperty('--accent', company?.color || '#2563eb');
	$: pathname = $page.url.pathname;
	$: activeItem = ALL_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
	$: pageTitle = activeItem?.label || 'Company Ledger';
	$: sidebarAction = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
	$: themeAction = theme === 'dark' ? 'Light mode' : 'Dark mode';

	const toggleTheme = () => {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		storage.set('ledger-theme', theme);
	};

	const toggleSidebar = () => {
		sidebarCollapsed = !sidebarCollapsed;
		switcherOpen = false;
		const preference = sidebarCollapsed ? 'collapsed' : '';
		document.documentElement.dataset.sidebar = preference;
		storage.set('ledger-sidebar', preference);
	};

	const openMobileNav = async () => {
		navOpen = true;
		await tick();
		mobileCloseButton.focus({ preventScroll: true });
	};

	const closeMobileNav = async () => {
		navOpen = false;
		switcherOpen = false;
		await tick();
		mobileOpenButton.focus({ preventScroll: true });
	};

	const closeSwitcher = () => {
		switcherOpen = false;
		switcherButton.focus();
	};

	const switchCompany = async (target) => {
		closeSwitcher();
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

	const onEscape = (event) => {
		if (event.key !== 'Escape' || event.defaultPrevented || createOpen) return;
		if (switcherOpen) closeSwitcher();
		else if (navOpen) closeMobileNav();
	};

	afterNavigate(() => {
		navOpen = false;
		switcherOpen = false;
	});

	onMount(() => {
		theme = document.documentElement.dataset.theme || 'light';
		sidebarCollapsed = document.documentElement.dataset.sidebar === 'collapsed';
		const mobileLayout = window.matchMedia('(max-width: 960px)');
		const closeMenus = () => {
			navOpen = false;
			switcherOpen = false;
		};
		mobileLayout.addEventListener('change', closeMenus);
		return () => mobileLayout.removeEventListener('change', closeMenus);
	});
</script>

<svelte:head>
	<title>{company ? `${pageTitle} · ${company.name}` : 'Company Ledger'}</title>
	<meta name="description" content="Company Ledger — income, expenses, masters, finance and reports for every company you run." />
</svelte:head>

<svelte:window on:mousedown={onWindowClick} on:keydown={onEscape} />

<div class="shell accent-scope" style={company ? `--accent: ${company.color}` : ''}>
	<aside class="sidebar no-print" id="ledger-sidebar" class:open={navOpen}>
		<div class="brand">
			<span class="brand-mark sidebar-label"><Icon name="logo" size={18} stroke={2} /></span>
			<div class="brand-copy sidebar-label">
				<strong>Company Ledger</strong>
				<span>Books &amp; reports</span>
			</div>
			<button class="sidebar-toggle desktop-toggle" type="button" aria-label={sidebarAction} title={sidebarAction} aria-controls="ledger-sidebar" aria-expanded={!sidebarCollapsed} on:click={toggleSidebar}>
				<span class="toggle-arrow"><Icon name="chevronLeft" size={17} stroke={2} /></span>
			</button>
			<button class="sidebar-toggle mobile-close" type="button" aria-label="Close menu" title="Close menu" bind:this={mobileCloseButton} on:click={closeMobileNav}>
				<Icon name="chevronLeft" size={17} stroke={2} />
			</button>
		</div>

		{#if company}
			<div class="switcher" bind:this={switcherEl}>
				<button class="switcher-btn" type="button" aria-label={`Switch company, ${company.name}`} title={sidebarCollapsed ? `Switch company · ${company.name}` : undefined} aria-haspopup="menu" aria-expanded={switcherOpen} bind:this={switcherButton} on:click={() => (switcherOpen = !switcherOpen)}>
					<span class="avatar" style="background: {company.color}">{company.code || initials(company.name)}</span>
					<span class="switcher-text sidebar-label">
						<strong>{company.name}</strong>
						<span>{companies.length} {companies.length === 1 ? 'company' : 'companies'}</span>
					</span>
					<span class="switcher-chevron sidebar-label"><Icon name="chevronsUpDown" size={14} /></span>
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
					<button type="button" role="menuitem" class="menu-item" on:click={() => {
						closeSwitcher();
						createOpen = true;
					}}>
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
					<div class="nav-group">
						<p class="nav-section sidebar-label">{group.section}</p>
						{#each group.items as item}
							<a href={item.href} class:active={item === activeItem} aria-current={item === activeItem ? 'page' : undefined} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined}>
								<Icon name={item.icon} size={17} />
								<span class="nav-label sidebar-label">{item.label}</span>
							</a>
						{/each}
					</div>
				{/each}
			</nav>
		{/if}

		<div class="sidebar-foot">
			<button class="theme-btn" type="button" aria-label={themeAction} title={sidebarCollapsed ? themeAction : undefined} on:click={toggleTheme}>
				<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
				<span class="sidebar-label">{themeAction}</span>
			</button>
		</div>
	</aside>

	{#if navOpen}
		<button class="scrim no-print" type="button" aria-label="Dismiss menu" tabindex="-1" on:click={closeMobileNav}></button>
	{/if}

	<div class="main" inert={navOpen}>
		<header class="topbar no-print">
			<button class="btn btn-ghost btn-icon" type="button" aria-label="Open menu" aria-controls="ledger-sidebar" aria-expanded={navOpen} bind:this={mobileOpenButton} on:click={openMobileNav}>
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
		grid-template-columns: var(--shell-sidebar-width, var(--sidebar-w)) minmax(0, 1fr);
		min-height: 100vh;
	}
	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px 12px;
		background: var(--surface);
		border-right: 1px solid var(--border);
		z-index: 60;
	}
	.brand {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 49px;
		padding: 4px;
		padding-inline-end: 48px;
	}
	.brand-copy {
		min-width: 0;
	}
	.brand-copy strong,
	.brand-copy span {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.brand-copy strong {
		font-size: 15px;
		letter-spacing: -0.01em;
	}
	.brand-copy span {
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
	.sidebar-toggle {
		position: absolute;
		inset-inline-end: 2px;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--surface);
		color: var(--muted);
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
	}
	.sidebar-toggle:hover {
		border-color: var(--border-strong);
		background: var(--surface-2);
		color: var(--text);
	}
	.sidebar-toggle:focus-visible,
	.theme-btn:focus-visible {
		outline: none;
		box-shadow: var(--ring);
	}
	.toggle-arrow,
	.switcher-chevron {
		display: flex;
		flex: none;
	}
	.mobile-close {
		display: none;
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
		max-height: min(70vh, calc(100dvh - 132px));
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
		min-height: 0;
		margin: -4px;
		padding: 4px;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.nav-group {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
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
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 7px 10px;
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
		color: var(--text);
		font-weight: 600;
	}
	nav a.active::before {
		content: '';
		position: absolute;
		inset-block: 11px;
		inset-inline-start: 0;
		width: 2px;
		border-radius: 2px;
		background: var(--accent);
	}
	nav a :global(svg) {
		flex: none;
	}
	.nav-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		min-height: 40px;
		padding: 7px 10px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
	}
	.theme-btn :global(svg) {
		flex: none;
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
		max-width: var(--content-max, 1320px);
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

	@media (width > 960px) {
		.shell {
			transition: grid-template-columns 0.2s ease;
		}
		.content {
			transition: max-width 0.2s ease;
		}
		.toggle-arrow {
			transition: transform 0.2s ease;
		}
		:global(html[data-sidebar='collapsed']) .shell {
			--shell-sidebar-width: 64px;
			--content-max: 100%;
		}
		:global(html[data-sidebar='collapsed']) .sidebar-label {
			display: none;
		}
		:global(html[data-sidebar='collapsed']) .brand {
			padding-inline: 0;
		}
		:global(html[data-sidebar='collapsed']) .toggle-arrow {
			transform: rotate(180deg);
		}
		:global(html[data-sidebar='collapsed']) .switcher-btn,
		:global(html[data-sidebar='collapsed']) nav a,
		:global(html[data-sidebar='collapsed']) .theme-btn {
			justify-content: center;
			padding-inline: 0;
		}
		:global(html[data-sidebar='collapsed']) .switcher-btn {
			min-height: 40px;
			padding-block: 4px;
		}
		:global(html[data-sidebar='collapsed']) .switcher-menu {
			inset: 0 auto auto calc(100% + 22px);
			width: 232px;
		}
		:global(html[data-sidebar='collapsed']) .nav-group + .nav-group {
			margin-top: 8px;
			padding-top: 8px;
			border-top: 1px solid var(--border);
		}
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
			visibility: hidden;
			transition: transform 0.2s ease, visibility 0s 0.2s;
			box-shadow: var(--shadow-lg);
		}
		.sidebar.open {
			transform: none;
			visibility: visible;
			transition-delay: 0s;
		}
		.desktop-toggle {
			display: none;
		}
		.mobile-close {
			display: grid;
			width: 40px;
			height: 40px;
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

	@media (prefers-reduced-motion: reduce) {
		.shell,
		.sidebar,
		.content,
		.toggle-arrow {
			transition: none;
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
