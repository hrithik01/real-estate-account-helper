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

export const GET = ({ url, locals }) => {
	const companyId = requireCompanyId(locals);
	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');
	const reportType = url.searchParams.get('reportType') || 'combined';
	const sortOrder = url.searchParams.get('sortOrder') === 'oldest' ? 'oldest' : 'latest';
	const entityIds = parseIds(url.searchParams.get('entityIds') || url.searchParams.get('entityId') || 'all');
	const projectIds = parseIds(url.searchParams.get('projectIds') || 'all');

	if (!start || !end) error(400, 'Start and end dates are required.');
	if (start > end) error(400, 'Start date must be on or before the end date.');
	if (!['income', 'expense', 'combined'].includes(reportType)) error(400, 'Invalid report type.');

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
		entityIds,
		projectIds,
		total_income,
		total_expense,
		net: total_income - total_expense,
		heads: headTotals(incomeRows, expenseRows),
		rows: {
			income: reportType === 'expense' ? [] : prepare(incomeRows),
			expenses: reportType === 'income' ? [] : prepare(expenseRows)
		}
	});
};
