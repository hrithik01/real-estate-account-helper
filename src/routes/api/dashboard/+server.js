// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { listHeadBalances, requireCompanyId } from '$lib/server/company.js';

const TREND_MONTHS = 6;

const sumBetween = (table, companyId, from, to) =>
	db
		.prepare(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM ${table} WHERE company_id = ? AND date BETWEEN ? AND ?`)
		.get(companyId, from, to);

const monthKey = (year, monthIndex) => {
	const date = new Date(Date.UTC(year, monthIndex, 1));
	return date.toISOString().slice(0, 7);
};

export const GET = ({ url, locals }) => {
	const companyId = requireCompanyId(locals);
	const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error(400, 'A valid date is required.');

	const [year, month] = date.split('-').map(Number);
	const monthStart = `${date.slice(0, 7)}-01`;
	const months = Array.from({ length: TREND_MONTHS }, (_, index) => monthKey(year, month - TREND_MONTHS + index));
	const trendStart = `${months[0]}-01`;

	const dayIncome = sumBetween('income', companyId, date, date);
	const dayExpense = sumBetween('expenses', companyId, date, date);
	const monthIncome = sumBetween('income', companyId, monthStart, date);
	const monthExpense = sumBetween('expenses', companyId, monthStart, date);

	const monthly = (table) =>
		new Map(
			db
				.prepare(
					`SELECT substr(date, 1, 7) AS month, SUM(amount) AS total FROM ${table}
					 WHERE company_id = ? AND date >= ? AND date <= ? GROUP BY month`
				)
				.all(companyId, trendStart, `${months.at(-1)}-31`)
				.map((row) => [row.month, row.total])
		);
	const incomeByMonth = monthly('income');
	const expenseByMonth = monthly('expenses');

	const accounts = db
		.prepare('SELECT id, bank_name, account_holder, account_number, account_balance FROM accounts WHERE company_id = ? ORDER BY account_holder COLLATE NOCASE')
		.all(companyId);

	const recent = db
		.prepare(
			`SELECT * FROM (
				SELECT 'income' AS kind, t.id, t.date, t.amount, t.credit_source AS source, t.comments, t.created_at, e.name AS entity_name
				FROM income t LEFT JOIN entities e ON e.id = t.entity_id WHERE t.company_id = ?
				UNION ALL
				SELECT 'expense' AS kind, t.id, t.date, t.amount, t.expense_source AS source, t.comments, t.created_at, e.name AS entity_name
				FROM expenses t LEFT JOIN entities e ON e.id = t.entity_id WHERE t.company_id = ?
			) ORDER BY created_at DESC, id DESC LIMIT 8`
		)
		.all(companyId, companyId);

	return json({
		date,
		day: { income: dayIncome.total, expense: dayExpense.total, net: dayIncome.total - dayExpense.total, count: dayIncome.count + dayExpense.count },
		month: { income: monthIncome.total, expense: monthExpense.total, net: monthIncome.total - monthExpense.total, from: monthStart },
		trend: months.map((key) => ({ month: key, income: incomeByMonth.get(key) || 0, expense: expenseByMonth.get(key) || 0 })),
		accounts,
		total_account_balance: accounts.reduce((sum, account) => sum + Number(account.account_balance || 0), 0),
		heads: listHeadBalances(companyId),
		recent
	});
};
