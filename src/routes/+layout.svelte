<script>
	// @ts-nocheck
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	const navItems = [
		{ href: '/', label: 'Daily Overview' },
		{ href: '/income', label: 'Income' },
		{ href: '/expenses', label: 'Expenses' },
		{ href: '/masters', label: 'Masters' },
		{ href: '/finance', label: 'Finance' },
		{ href: '/reports', label: 'Reports' }
	];
	let theme = 'light';

	const applyTheme = (value) => {
		theme = value;
		document.body.dataset.theme = value;
		localStorage.setItem('theme', value);
	};

	const toggleTheme = () => {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	};

	onMount(() => {
		const stored = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		applyTheme(stored || (prefersDark ? 'dark' : 'light'));
	});
</script>

<svelte:head>
	<title>Balaji Ledger</title>
	<meta name="description" content="Balaji company accounts dashboard for income, expenses, masters, finance, and reports" />
</svelte:head>


<div class="backdrop-orb backdrop-orb-one"></div>
<div class="backdrop-orb backdrop-orb-two"></div>
<div class="backdrop-orb backdrop-orb-three"></div>

<div class="app-shell">
	<header class="header">
		<div class="brand-block">
			<p class="brand-kicker">Accounts Command Center</p>
			<h1>Balaji Ledger</h1>
			<p class="subtitle">Income, expenses, masters, finance, and reporting in one local dashboard.</p>
		</div>
		<div class="header-actions">
			<nav>
				{#each navItems as item}
					<a href={item.href} class:active={item.href === $page.url.pathname}>{item.label}</a>
				{/each}
			</nav>
			<button class="theme-toggle" on:click={toggleTheme}>
				{theme === 'dark' ? 'Light mode' : 'Dark mode'}
			</button>
		</div>
	</header>
	<main class="main">
		<slot />
	</main>
</div>

<style>
	:global(:root) {
		color-scheme: light;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family: 'Trebuchet MS', 'Lucida Sans Unicode', 'Segoe UI', sans-serif;
		font-size: 17px;
		background:
			radial-gradient(circle at top left, rgba(214, 154, 92, 0.18), transparent 24%),
			radial-gradient(circle at right 15%, rgba(92, 133, 164, 0.15), transparent 24%),
			linear-gradient(180deg, #f7f0e2 0%, #eef5f7 100%);
		color: var(--text);
		line-height: 1.58;
		--text: #213544;
		--muted: #61717c;
		--panel-bg: rgba(255, 252, 248, 0.86);
		--card-bg: rgba(255, 255, 255, 0.88);
		--border: rgba(33, 53, 68, 0.12);
		--panel-shadow: 0 26px 68px rgba(34, 52, 67, 0.12);
		--focus-ring: 0 0 0 3px rgba(198, 122, 61, 0.18);
		--primary-bg: linear-gradient(135deg, #214e60 0%, #3e7284 100%);
		--primary-solid: #214e60;
		--primary-text: #fffdfa;
		--secondary-bg: #efe2cf;
		--secondary-text: #213544;
		--ghost-text: #5c6a74;
		--input-bg: rgba(255, 255, 255, 0.8);
		--nav-bg: rgba(255, 255, 255, 0.66);
		--nav-text: #214455;
		--nav-active-bg: #213f50;
		--nav-active-text: #fffdfa;
		--accent: #c67a3d;
		--accent-soft: rgba(198, 122, 61, 0.14);
		min-height: 100vh;
	}

	:global(body[data-theme='dark']) {
		color-scheme: dark;
		background:
			radial-gradient(circle at top left, rgba(208, 144, 87, 0.14), transparent 20%),
			radial-gradient(circle at right 15%, rgba(121, 171, 211, 0.12), transparent 22%),
			linear-gradient(180deg, #091218 0%, #10212b 100%);
		--text: #ebf3f6;
		--muted: #9db0bc;
		--panel-bg: rgba(12, 25, 33, 0.84);
		--card-bg: rgba(17, 34, 44, 0.92);
		--border: rgba(223, 236, 245, 0.1);
		--panel-shadow: 0 30px 78px rgba(2, 8, 14, 0.48);
		--focus-ring: 0 0 0 3px rgba(226, 171, 117, 0.22);
		--primary-bg: linear-gradient(135deg, #e3b06c 0%, #cf8451 100%);
		--primary-solid: #e3b06c;
		--primary-text: #10212b;
		--secondary-bg: #183341;
		--secondary-text: #ebf3f6;
		--ghost-text: #a7bac6;
		--input-bg: rgba(9, 20, 28, 0.82);
		--nav-bg: rgba(17, 33, 43, 0.82);
		--nav-text: #ebf3f6;
		--nav-active-bg: #e3b06c;
		--nav-active-text: #10212b;
		--accent: #e3b06c;
		--accent-soft: rgba(227, 176, 108, 0.18);
	}

	:global(h1),
	:global(h2),
	:global(h3),
	:global(h4) {
		font-family: 'Baskerville', 'Palatino Linotype', 'Book Antiqua', serif;
		letter-spacing: -0.02em;
		color: var(--text);
	}

	:global(h1) {
		margin: 0;
		font-size: clamp(2.35rem, 3.4vw, 3.5rem);
		font-weight: 700;
	}

	:global(h2) {
		margin: 0;
		font-size: clamp(1.65rem, 2.4vw, 2.35rem);
		font-weight: 700;
	}

	:global(h3) {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 700;
	}

	:global(h4) {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	:global(p) {
		font-size: 1.02rem;
	}

	:global(a),
	:global(button),
	:global(input),
	:global(select),
	:global(textarea) {
		font: inherit;
	}

	.backdrop-orb {
		position: fixed;
		border-radius: 999px;
		filter: blur(20px);
		opacity: 0.7;
		pointer-events: none;
		z-index: 0;
		animation: drift 18s ease-in-out infinite alternate;
	}

	.backdrop-orb-one {
		width: 18rem;
		height: 18rem;
		top: 1.5rem;
		left: -4rem;
		background: rgba(214, 154, 92, 0.18);
	}

	.backdrop-orb-two {
		width: 16rem;
		height: 16rem;
		top: 14rem;
		right: -4rem;
		background: rgba(93, 137, 171, 0.18);
		animation-duration: 22s;
	}

	.backdrop-orb-three {
		width: 12rem;
		height: 12rem;
		bottom: 5rem;
		left: 22%;
		background: rgba(198, 122, 61, 0.14);
		animation-duration: 26s;
	}

	.app-shell {
		position: relative;
		z-index: 1;
		max-width: 1240px;
		margin: 0 auto;
		padding: 24px;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
		background: var(--panel-bg);
		border: 1px solid var(--border);
		border-radius: 28px;
		padding: 18px 20px;
		box-shadow: var(--panel-shadow);
		backdrop-filter: blur(16px);
	}

	.brand-block {
		display: grid;
		gap: 0.35rem;
	}

	.brand-kicker {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.subtitle {
		margin: 0;
		color: var(--muted);
		max-width: 42rem;
	}

	nav {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	nav a {
		text-decoration: none;
		padding: 0.78rem 1.1rem;
		border-radius: 999px;
		background: var(--nav-bg);
		color: var(--nav-text);
		border: 1px solid var(--border);
		font-weight: 700;
		transition: transform 0.18s ease, filter 0.18s ease, background 0.18s ease, border-color 0.18s ease;
	}

	nav a.active {
		background: var(--nav-active-bg);
		color: var(--nav-active-text);
		border-color: var(--nav-active-bg);
	}

	.theme-toggle {
		padding: 0.78rem 1.1rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: var(--secondary-bg);
		color: var(--secondary-text);
		cursor: pointer;
		font-weight: 700;
		transition: transform 0.18s ease, filter 0.18s ease, background 0.18s ease;
	}

	.main {
		margin-top: 24px;
	}

	.main :global(.panel),
	.main :global(.hero-panel) {
		background: var(--panel-bg);
		border: 1px solid var(--border);
		border-radius: 28px;
		padding: 1.4rem;
		box-shadow: var(--panel-shadow);
		backdrop-filter: blur(16px);
		margin-bottom: 1.25rem;
		animation: rise-in 0.45s ease both;
	}

	.main :global(.hero-panel) {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
	}

	.main :global(.section-header),
	.main :global(.row),
	.main :global(.hero-actions),
	.main :global(.header-row),
	.main :global(.detail-toggles) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		flex-wrap: wrap;
	}

	.main :global(.form-grid) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.95rem;
		margin: 1rem 0 0;
	}

	.main :global(.grid),
	.main :global(.stats-grid) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
	}

	.main :global(.stats-grid) {
		margin-bottom: 1.25rem;
	}

	.main :global(.card),
	.main :global(.stat-card) {
		background: linear-gradient(180deg, color-mix(in srgb, var(--card-bg) 84%, white), var(--card-bg));
		border: 1px solid var(--border);
		border-radius: 22px;
		padding: 1.15rem;
		box-shadow: 0 16px 32px rgba(33, 53, 68, 0.06);
	}

	.main :global(.stat-card) {
		display: grid;
		gap: 0.42rem;
	}

	.main :global(.stat-card span),
	.main :global(.stat-card small),
	.main :global(.muted),
	.main :global(label span) {
		color: var(--muted);
	}

	.main :global(.stat-card strong),
	.main :global(.amount-value) {
		font-size: clamp(1.55rem, 2.6vw, 2.35rem);
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.03em;
		color: var(--text);
	}

	.main :global(.amount-value) {
		margin: 0.35rem 0 0;
	}

	.main :global(label) {
		display: grid;
		gap: 0.45rem;
		font-size: 0.98rem;
		font-weight: 600;
		color: var(--text);
	}

	.main :global(label span) {
		font-size: 0.83rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.main :global(input),
	.main :global(select),
	.main :global(textarea) {
		width: 100%;
		padding: 0.85rem 0.95rem;
		border-radius: 16px;
		border: 1px solid var(--border);
		background: var(--input-bg);
		color: var(--text);
	}

	.main :global(textarea) {
		resize: vertical;
	}

	.main :global(button),
	.main :global(.primary-button),
	.main :global(.secondary-button),
	.main :global(.ghost-button),
	.main :global(button.secondary),
	.main :global(button.ghost),
	.main :global(.multi-trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		padding: 0.82rem 1.15rem;
		border-radius: 999px;
		border: 1px solid transparent;
		text-decoration: none;
		cursor: pointer;
		font-weight: 700;
		transition: transform 0.18s ease, filter 0.18s ease, background 0.18s ease, border-color 0.18s ease;
	}

	.main :global(button),
	.main :global(.primary-button) {
		background: var(--primary-bg);
		color: var(--primary-text);
	}

	.main :global(.secondary-button),
	.main :global(button.secondary) {
		background: var(--secondary-bg);
		color: var(--secondary-text);
		border-color: var(--border);
	}

	.main :global(.ghost-button),
	.main :global(button.ghost) {
		background: transparent;
		color: var(--ghost-text);
		border-color: var(--border);
	}

	.main :global(.multi-select) {
		position: relative;
	}

	.main :global(.multi-trigger) {
		width: 100%;
		justify-content: space-between;
		background: var(--input-bg);
		color: var(--text);
		border-color: var(--border);
	}

	.main :global(.multi-menu) {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		z-index: 10;
		background: var(--panel-bg);
		border: 1px solid var(--border);
		border-radius: 18px;
		padding: 0.8rem;
		max-height: 240px;
		overflow: auto;
		display: grid;
		gap: 0.7rem;
		box-shadow: var(--panel-shadow);
	}

	.main :global(label.multi-option) {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		font-size: 0.96rem;
		font-weight: 600;
	}

	.main :global(label.multi-option span) {
		font-size: 0.96rem;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text);
	}

	.main :global(.board-input) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.85rem;
		margin: 1rem 0;
	}

	.main :global(.detail-toggles) {
		justify-content: flex-start;
		margin: 0.85rem 0 0;
	}

	.main :global(.detail-toggles label),
	.main :global(.toggle-row),
	.main :global(.line) {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		font-weight: 600;
	}

	.main :global(.toggle-row) {
		margin-top: 1rem;
	}

	.main :global(.table-wrap) {
		overflow-x: auto;
		border-radius: 20px;
	}

	.main :global(table) {
		width: 100%;
		border-collapse: collapse;
		min-width: 760px;
		margin-top: 0.85rem;
	}

	.main :global(th),
	.main :global(td) {
		padding: 0.95rem 0.9rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	.main :global(th) {
		font-size: 0.8rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.main :global(ul) {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.8rem;
	}

	.main :global(li) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
	}

	.main :global(.pill-note) {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.5rem 0.8rem;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	:global(input:focus),
	:global(textarea:focus),
	:global(select:focus),
	:global(button:focus-visible),
	:global(a:focus-visible) {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	:global(button:hover),
	:global(.theme-toggle:hover),
	:global(nav a:hover) {
		filter: brightness(1.04);
	}

	:global(button:active),
	:global(.theme-toggle:active),
	:global(nav a:active) {
		transform: translateY(1px);
	}

	:global(table tbody tr:hover) {
		background: color-mix(in srgb, var(--card-bg) 75%, transparent);
	}

	@keyframes drift {
		0% {
			transform: translate3d(0, 0, 0) scale(1);
		}
		100% {
			transform: translate3d(24px, -18px, 0) scale(1.06);
		}
	}

	@keyframes rise-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 820px) {
		.app-shell {
			padding: 16px;
		}

		.header {
			padding: 16px;
			border-radius: 24px;
		}

		.header-actions {
			justify-content: flex-start;
		}

		.main :global(.hero-panel) {
			flex-direction: column;
		}

		.main :global(.board-input) {
			grid-template-columns: 1fr;
		}

		.main :global(li) {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
