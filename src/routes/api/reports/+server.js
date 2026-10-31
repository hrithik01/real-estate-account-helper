// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { requireCompanyId } from '$lib/server/company.js';
import { compareRowsByDate, KINDS } from '$lib/server/transactions.js';

const parseIds = (raw) => {
	if (!raw || raw === 'all') return [];
	return [
		...new Set(
			String(raw)
				.split(',')
				.map((value) => Number(value.trim()))
				.filter((value) => Number.isInteger(value) && value > 0)
		)
	];
};

/** Running total per entity in chronological order, independent of the display order. */
const addEntityCumulative = (rows) => {
	const runningTotals = new Map();
	const cumulativeByRowId = new Map();
	const chronologicalRows = [...rows].sort((left, right) => compareRowsByDate(left, right, 'oldest'));

	for (const row of chronologicalRows) {
		const entityKey = String(row.entity_id || 'unassigned');
		const nextValue = (runningTotals.get(entityKey) || 0) + Number(row.amount || 0);
		runningTotals.set(entityKey, nextValue);
		cumulativeByRowId.set(row.id, nextValue);
	}

	return rows.map((row) => ({
		...row,
		entity_cumulative: cumulativeByRowId.get(row.id) || Number(row.amount || 0)
	}));
};

const loadRows = (kind, companyId, start, end, entityIds, projectIds) => {
	const config = KINDS[kind];
	let where = 't.company_id = ? AND t.date BETWEEN ? AND ?';
	const params = [companyId, start, end];
	if (entityIds.length > 0) {
		where += ` AND t.entity_id IN (${entityIds.map(() => '?').join(',')})`;
		params.push(...entityIds);
	}
	if (projectIds.length > 0) {
		where += ` AND EXISTS (SELECT 1 FROM ${config.link} l WHERE l.${config.linkFk} = t.id AND l.project_id IN (${projectIds.map(() => '?').join(',')}))`;
		params.push(...projectIds);
	}
	return db
		.prepare(
			`SELECT t.id, t.date, t.created_at, t.amount, t.entity_id, t.payment_mode, t.${config.sourceField} AS source,
				t.master_owner, h.name AS head_name, t.comments, ent.name AS entity_name, ent.entity_type, ent.comments AS entity_comments, a.account_holder,
				(SELECT GROUP_CONCAT(p.property_name, ', ') FROM ${config.link} l JOIN projects p ON p.id = l.project_id WHERE l.${config.linkFk} = t.id) AS project_names
			 FROM ${config.table} t
			 LEFT JOIN entities ent ON ent.id = t.entity_id
			 LEFT JOIN accounts a ON a.id = t.account_id
			 LEFT JOIN ledger_heads h ON h.company_id = t.company_id AND h.code = t.master_owner
			 WHERE ${where}`
		)
		.all(...params);
};

/** Income, expense and net per master balance for the rows in the report. */
const headTotals = (incomeRows, expenseRows) => {
	const byCode = new Map();
	const add = (rows, field) => {
		for (const row of rows) {
			const code = row.master_owner || '';
			const entry = byCode.get(code) || { code, name: row.head_name || code || 'Unassigned', income: 0, expense: 0 };
			entry[field] += Number(row.amount || 0);
			byCode.set(code, entry);
		}
	};
	add(incomeRows, 'income');
	add(expenseRows, 'expense');
	return [...byCode.values()]
		.map((entry) => ({ ...entry, net: entry.income - entry.expense }))
		.sort((left, right) => left.name.localeCompare(right.name));
};

/**
 * Ways the report summary can be grouped. `key` identifies a group, `label` is what it shows;
 * `raw` labels (names) are displayed as-is, the rest are slugs the client prettifies.
 * Project is deliberately absent: a transaction can span several projects, so grouping by it would double count.
 */
const GROUPERS = {
	source: (row) => ({ key: row.source, label: row.source, raw: false }),
	entity_type: (row) => ({ key: row.entity_type, label: row.entity_type, raw: false }),
	entity: (row) => ({ key: row.entity_id ? `e${row.entity_id}` : '', label: row.entity_name, raw: true }),
	head: (row) => ({ key: row.master_owner, label: row.head_name || row.master_owner, raw: true }),
	payment_mode: (row) => ({ key: row.payment_mode, label: row.payment_mode, raw: false })
};
const UNSPECIFIED = 'Unspecified';

const cleanGroup = (group) => {
	const key = String(group.key || '').trim() || UNSPECIFIED;
	return { key, label: String(group.label || '').trim() || UNSPECIFIED, raw: group.raw || key === UNSPECIFIED };
};

/** Total and share per group, largest first. Groups that net to zero are dropped. */
const groupTotals = (rows, groupBy) => {
	const totals = new Map();
	for (const row of rows) {
		const group = cleanGroup(GROUPERS[groupBy](row));
		const entry = totals.get(group.key) || { ...group, total: 0 };
		entry.total += Number(row.amount || 0);
		totals.set(group.key, entry);
	}
	const grand = [...totals.values()].reduce((sum, entry) => sum + entry.total, 0);
	return [...totals.values()]
		.filter((entry) => entry.total !== 0)
		.map((entry) => ({ ...entry, share: grand ? entry.total / grand : 0 }))
		.sort((left, right) => Math.abs(right.total) - Math.abs(left.total));
};

/** Entity type (rows) by category (columns). Both axes are ordered largest first. */
const crossTab = (rows) => {
	const cells = new Map();
	const rowTotals = new Map();
	const columnTotals = new Map();
	let grand = 0;
	for (const row of rows) {
		const type = cleanGroup(GROUPERS.entity_type(row)).key;
		const category = cleanGroup(GROUPERS.source(row)).key;
		const amount = Number(row.amount || 0);
		cells.set(`${type}\u0000${category}`, (cells.get(`${type}\u0000${category}`) || 0) + amount);
		rowTotals.set(type, (rowTotals.get(type) || 0) + amount);
		columnTotals.set(category, (columnTotals.get(category) || 0) + amount);
		grand += amount;
	}
	const order = (totals) => [...totals.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([key]) => key);
	const columns = order(columnTotals);
	return {
		columns,
		column_totals: columns.map((column) => columnTotals.get(column)),
		rows: order(rowTotals).map((type) => ({
			key: type,
			total: rowTotals.get(type),
			cells: columns.map((column) => cells.get(`${type}\u0000${column}`) || 0)
		})),
		total: grand
	};
};

export const GET = ({ url, locals }) => {
	const companyId = requireCompanyId(locals);
	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');
	const reportType = url.searchParams.get('reportType') || 'combined';
	const sortOrder = url.searchParams.get('sortOrder') === 'oldest' ? 'oldest' : 'latest';
	const entityIds = parseIds(url.searchParams.get('entityIds') || url.searchParams.get('entityId') || 'all');
	const projectIds = parseIds(url.searchParams.get('projectIds') || 'all');
	const groupBy = url.searchParams.get('groupBy') || 'source';

	if (!start || !end) error(400, 'Start and end dates are required.');
	if (start > end) error(400, 'Start date must be on or before the end date.');
	if (!['income', 'expense', 'combined'].includes(reportType)) error(400, 'Invalid report type.');
	if (!Object.hasOwn(GROUPERS, groupBy)) error(400, 'Invalid grouping.');

	// Totals always cover both sides so the net figure stays meaningful for single-sided reports.
	const incomeRows = loadRows('income', companyId, start, end, entityIds, projectIds);
	const expenseRows = loadRows('expense', companyId, start, end, entityIds, projectIds);
	const total = (rows) => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
	const prepare = (rows) => addEntityCumulative(rows).sort((left, right) => compareRowsByDate(left, right, sortOrder));
	const total_income = total(incomeRows);
	const total_expense = total(expenseRows);

	return json({
		start,
		end,
		reportType,
		sortOrder,
		groupBy,
		entityIds,
		projectIds,
		total_income,
		total_expense,
		net: total_income - total_expense,
		heads: headTotals(incomeRows, expenseRows),
		groups: {
			income: reportType === 'expense' ? [] : groupTotals(incomeRows, groupBy),
			expense: reportType === 'income' ? [] : groupTotals(expenseRows, groupBy)
		},
		cross_tab: {
			income: reportType === 'expense' ? null : crossTab(incomeRows),
			expense: reportType === 'income' ? null : crossTab(expenseRows)
		},
		rows: {
			income: reportType === 'expense' ? [] : prepare(incomeRows),
			expenses: reportType === 'income' ? [] : prepare(expenseRows)
		}
	});
};
