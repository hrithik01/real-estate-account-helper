// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';

const parseIds = (raw) => {
	if (!raw || raw === 'all') return [];
	return [...new Set(String(raw).split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0))];
};

const parseLedgerDate = (value) => {
	const text = String(value || '').trim();
	if (!text) return 0;
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(`${text}T00:00:00Z`) || 0;

	const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slashMatch) {
		const day = Number(slashMatch[1]);
		const month = Number(slashMatch[2]);
		const rawYear = Number(slashMatch[3]);
		const year = rawYear < 100 ? 2000 + rawYear : rawYear;
		return Date.UTC(year, month - 1, day);
	}

	return Date.parse(text) || 0;
};

const compareRowsByDate = (left, right, direction = 'latest') => {
	const multiplier = direction === 'oldest' ? 1 : -1;
	const dateDiff = parseLedgerDate(left.date) - parseLedgerDate(right.date);
	if (dateDiff !== 0) return dateDiff * multiplier;

	const createdDiff = Date.parse(left.created_at || '') - Date.parse(right.created_at || '');
	if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff * multiplier;

	return (Number(left.id || 0) - Number(right.id || 0)) * multiplier;
};

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

export const GET = ({ url }) => {
	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');
	const reportType = url.searchParams.get('reportType') || 'combined';
	const sortOrder = url.searchParams.get('sortOrder') === 'oldest' ? 'oldest' : 'latest';
	const entityIds = parseIds(url.searchParams.get('entityIds') || url.searchParams.get('entityId') || 'all');
	const projectIds = parseIds(url.searchParams.get('projectIds') || 'all');

	if (!start || !end) {
		return json({ error: 'Start and end dates are required.' }, { status: 400 });
	}
	if (!['income', 'expense', 'combined'].includes(reportType)) {
		return json({ error: 'Invalid report type.' }, { status: 400 });
	}

	const incomeParams = [start, end];
	const expenseParams = [start, end];
	const incomeRowParams = [start, end];
	const expenseRowParams = [start, end];
	let incomeWhere = 'date BETWEEN ? AND ?';
	let expenseWhere = 'date BETWEEN ? AND ?';
	let incomeRowWhere = 'i.date BETWEEN ? AND ?';
	let expenseRowWhere = 'e.date BETWEEN ? AND ?';

	if (entityIds.length > 0) {
		const placeholders = entityIds.map(() => '?').join(',');
		incomeWhere += ` AND entity_id IN (${placeholders})`;
		expenseWhere += ` AND entity_id IN (${placeholders})`;
		incomeRowWhere += ` AND i.entity_id IN (${placeholders})`;
		expenseRowWhere += ` AND e.entity_id IN (${placeholders})`;
		incomeParams.push(...entityIds);
		expenseParams.push(...entityIds);
		incomeRowParams.push(...entityIds);
		expenseRowParams.push(...entityIds);
	}

	if (projectIds.length > 0) {
		const placeholders = projectIds.map(() => '?').join(',');
		incomeWhere += ` AND EXISTS (SELECT 1 FROM income_projects ip WHERE ip.income_id = income.id AND ip.project_id IN (${placeholders}))`;
		expenseWhere += ` AND EXISTS (SELECT 1 FROM expense_projects ep WHERE ep.expense_id = expenses.id AND ep.project_id IN (${placeholders}))`;
		incomeRowWhere += ` AND EXISTS (SELECT 1 FROM income_projects ip WHERE ip.income_id = i.id AND ip.project_id IN (${placeholders}))`;
		expenseRowWhere += ` AND EXISTS (SELECT 1 FROM expense_projects ep WHERE ep.expense_id = e.id AND ep.project_id IN (${placeholders}))`;
		incomeParams.push(...projectIds);
		expenseParams.push(...projectIds);
		incomeRowParams.push(...projectIds);
		expenseRowParams.push(...projectIds);
	}

	const incomeTotals = db
		.prepare(
			`SELECT
			 COALESCE(SUM(amount), 0) as total_income
			 FROM income WHERE ${incomeWhere}`
		)
		.get(...incomeParams);

	const expenseTotals = db
		.prepare(
			`SELECT
			 COALESCE(SUM(amount), 0) as total_expense
			 FROM expenses WHERE ${expenseWhere}`
		)
		.get(...expenseParams);

	const incomeRows =
		reportType === 'expense'
			? []
			: db
					.prepare(
						`SELECT i.id, i.date, i.created_at, i.amount, i.entity_id, i.payment_mode, i.credit_source as source, i.master_owner, i.comments, e.name as entity_name,
							a.account_holder,
							(SELECT GROUP_CONCAT(p.property_name, ', ') FROM income_projects ip JOIN projects p ON p.id = ip.project_id WHERE ip.income_id = i.id) as project_names
						 FROM income i LEFT JOIN entities e ON e.id = i.entity_id
						 LEFT JOIN accounts a ON a.id = i.account_id
						 WHERE ${incomeRowWhere}
						 ORDER BY i.id DESC`
					)
					.all(...incomeRowParams);

	const expenseRows =
		reportType === 'income'
			? []
			: db
					.prepare(
						`SELECT e.id, e.date, e.created_at, e.amount, e.entity_id, e.payment_mode, e.expense_source as source, e.master_owner, e.comments, ent.name as entity_name,
							a.account_holder,
							(SELECT GROUP_CONCAT(p.property_name, ', ') FROM expense_projects ep JOIN projects p ON p.id = ep.project_id WHERE ep.expense_id = e.id) as project_names
						 FROM expenses e LEFT JOIN entities ent ON ent.id = e.entity_id
						 LEFT JOIN accounts a ON a.id = e.account_id
						 WHERE ${expenseRowWhere}
						 ORDER BY e.id DESC`
					)
					.all(...expenseRowParams);

	const preparedIncomeRows = addEntityCumulative(incomeRows).sort((left, right) =>
		compareRowsByDate(left, right, sortOrder)
	);
	const preparedExpenseRows = addEntityCumulative(expenseRows).sort((left, right) =>
		compareRowsByDate(left, right, sortOrder)
	);

	const net = (incomeTotals?.total_income ?? 0) - (expenseTotals?.total_expense ?? 0);

	return json({
		start,
		end,
		reportType,
		sortOrder,
		entityIds,
		projectIds,
		net,
		...incomeTotals,
		...expenseTotals,
		rows: {
			income: preparedIncomeRows,
			expenses: preparedExpenseRows
		}
	});
};
