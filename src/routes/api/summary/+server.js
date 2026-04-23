import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';

export const GET = ({ url }) => {
	const date = url.searchParams.get('date');
	if (!date) {
		return json({ error: 'Date is required.' }, { status: 400 });
	}
	const incomeTotals = db
		.prepare(
			`SELECT
			 COALESCE(SUM(amount), 0) as total_income
			 FROM income WHERE date = ?`
		)
		.get(date);
	const expenseTotals = db
		.prepare(
			`SELECT
			 COALESCE(SUM(amount), 0) as total_expense
			 FROM expenses WHERE date = ?`
		)
		.get(date);
	const totals = db
		.prepare('SELECT COALESCE(SUM(account_balance), 0) as total_account_balance FROM accounts')
		.get();

	return json({
		date,
		net: (incomeTotals?.total_income ?? 0) - (expenseTotals?.total_expense ?? 0),
		total_account_balance: totals?.total_account_balance ?? 0,
		...incomeTotals,
		...expenseTotals
	});
};
