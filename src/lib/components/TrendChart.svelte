<script>
	// @ts-nocheck
	import { formatCompact, formatINR, formatMonth } from '$lib/format.js';

	/** data: [{ month: 'YYYY-MM', income, expense }] */
	export let data = [];

	const HEIGHT = 220;
	const PAD = { top: 12, right: 8, bottom: 28, left: 64 };
	const SERIES = [
		{ key: 'income', label: 'Income', color: 'var(--series-income)' },
		{ key: 'expense', label: 'Expense', color: 'var(--series-expense)' }
	];

	let width = 600;
	let hover = null;

	const niceStep = (max, count = 4) => {
		if (max <= 0) return 1;
		const raw = max / count;
		const power = 10 ** Math.floor(Math.log10(raw));
		const fraction = raw / power;
		const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
		return nice * power;
	};

	$: maxValue = Math.max(0, ...data.flatMap((row) => [row.income, row.expense]));
	$: step = niceStep(maxValue);
	$: top = Math.max(step, Math.ceil(maxValue / step) * step);
	$: ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
	$: plotW = Math.max(100, width - PAD.left - PAD.right);
	$: plotH = HEIGHT - PAD.top - PAD.bottom;
	$: band = plotW / Math.max(1, data.length);
	$: barW = Math.min(28, Math.max(6, (band * 0.56 - 2) / 2));
	$: y = (value) => PAD.top + plotH - (value / top) * plotH;

	/** Bar path with 4px rounded top corners anchored to the baseline. */
	const barPath = (x, value) => {
		const height = (value / top) * plotH;
		if (height <= 0) return '';
		const r = Math.min(4, height, barW / 2);
		const yTop = PAD.top + plotH - height;
		const base = PAD.top + plotH;
		return `M${x},${base}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barW - r}Q${x + barW},${yTop} ${x + barW},${yTop + r}V${base}Z`;
	};
</script>

<div class="chart">
	<div class="legend" aria-hidden="true">
		{#each SERIES as series}
			<span><i style="background: {series.color}"></i>{series.label}</span>
		{/each}
	</div>

	<div class="plot" bind:clientWidth={width}>
		<svg width={width} height={HEIGHT} role="img" aria-label="Income and expense by month">
			{#each ticks as tick}
				<line x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} class="grid" class:base={tick === 0} />
				<text x={PAD.left - 10} y={y(tick)} class="axis" text-anchor="end" dominant-baseline="middle">{formatCompact(tick)}</text>
			{/each}

			{#each data as row, index}
				{@const x0 = PAD.left + index * band + (band - (barW * 2 + 2)) / 2}
				{#if hover === index}
					<rect x={PAD.left + index * band + 2} y={PAD.top} width={band - 4} height={plotH} class="hover-band" rx="6" />
				{/if}
				<path d={barPath(x0, row.income)} fill={SERIES[0].color} />
				<path d={barPath(x0 + barW + 2, row.expense)} fill={SERIES[1].color} />
				<text x={PAD.left + index * band + band / 2} y={HEIGHT - 8} class="axis" text-anchor="middle">{formatMonth(row.month)}</text>
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<rect
					x={PAD.left + index * band}
					y={PAD.top}
					width={band}
					height={plotH}
					fill="transparent"
					on:mouseenter={() => (hover = index)}
					on:mouseleave={() => (hover = null)}
				/>
			{/each}
		</svg>

		{#if hover !== null && data[hover]}
			{@const row = data[hover]}
			<div class="tooltip" style="left: {Math.min(Math.max(PAD.left + hover * band + band / 2, 90), width - 90)}px">
				<strong>{formatMonth(row.month)}</strong>
				<span><i style="background: {SERIES[0].color}"></i>Income <b>{formatINR(row.income)}</b></span>
				<span><i style="background: {SERIES[1].color}"></i>Expense <b>{formatINR(row.expense)}</b></span>
				<span class="net">Net <b class:pos={row.income - row.expense >= 0} class:neg={row.income - row.expense < 0}>{formatINR(row.income - row.expense)}</b></span>
			</div>
		{/if}
	</div>

	<table class="sr-only">
		<caption>Income and expense by month</caption>
		<thead><tr><th>Month</th><th>Income</th><th>Expense</th></tr></thead>
		<tbody>
			{#each data as row}
				<tr><td>{formatMonth(row.month)}</td><td>{formatINR(row.income)}</td><td>{formatINR(row.expense)}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.chart {
		display: grid;
		gap: 10px;
	}
	.legend {
		display: flex;
		gap: 16px;
		font-size: 12.5px;
		color: var(--text-2);
	}
	.legend span,
	.tooltip span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	i {
		width: 10px;
		height: 10px;
		border-radius: 3px;
		display: inline-block;
	}
	.plot {
		position: relative;
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.grid {
		stroke: var(--border);
		stroke-width: 1;
	}
	.grid.base {
		stroke: var(--border-strong);
	}
	.axis {
		font-size: 11px;
		fill: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.hover-band {
		fill: var(--surface-3);
	}
	.tooltip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		display: grid;
		gap: 4px;
		min-width: 170px;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow-lg);
		font-size: 12.5px;
		color: var(--text-2);
		pointer-events: none;
	}
	.tooltip b {
		margin-left: auto;
		padding-left: 12px;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.tooltip .net {
		border-top: 1px solid var(--border);
		padding-top: 4px;
		margin-top: 2px;
	}
	.tooltip .pos {
		color: var(--pos);
	}
	.tooltip .neg {
		color: var(--neg);
	}
</style>
