import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';

export const GET = () => {
	const settings = db
		.prepare('SELECT master_shree_start, master_pkb_start, master_hkj_start FROM settings WHERE id = 1')
		.get();

	const incomeByOwner = db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN master_owner = 'SHREE' THEN amount ELSE 0 END), 0) as shree_income,
				COALESCE(SUM(CASE WHEN master_owner = 'PKB' THEN amount ELSE 0 END), 0) as pkb_income,
				COALESCE(SUM(CASE WHEN master_owner = 'HKJ' THEN amount ELSE 0 END), 0) as hkj_income
			FROM income`
		)
		.get();

	const expenseByOwner = db
		.prepare(
			`SELECT
				COALESCE(SUM(CASE WHEN master_owner = 'SHREE' THEN amount ELSE 0 END), 0) as shree_expense,
				COALESCE(SUM(CASE WHEN master_owner = 'PKB' THEN amount ELSE 0 END), 0) as pkb_expense,
				COALESCE(SUM(CASE WHEN master_owner = 'HKJ' THEN amount ELSE 0 END), 0) as hkj_expense
			FROM expenses`
		)
		.get();

	const master_shree_balance =
		(settings?.master_shree_start ?? 0) + incomeByOwner.shree_income - expenseByOwner.shree_expense;
	const master_pkb_balance = (settings?.master_pkb_start ?? 0) + incomeByOwner.pkb_income - expenseByOwner.pkb_expense;
	const master_hkj_balance = (settings?.master_hkj_start ?? 0) + incomeByOwner.hkj_income - expenseByOwner.hkj_expense;

	return json({
		master_shree_start: settings?.master_shree_start ?? 0,
		master_pkb_start: settings?.master_pkb_start ?? 0,
		master_hkj_start: settings?.master_hkj_start ?? 0,
		master_shree_balance,
		master_pkb_balance,
		master_hkj_balance
	});
};

export const POST = async ({ request }) => {
	const body = await request.json();
	const master_shree_start = Number(body.master_shree_start ?? 0);
	const master_pkb_start = Number(body.master_pkb_start ?? 0);
	const master_hkj_start = Number(body.master_hkj_start ?? 0);

	if (
		!Number.isFinite(master_shree_start) ||
		!Number.isFinite(master_pkb_start) ||
		!Number.isFinite(master_hkj_start)
	) {
		return json({ error: 'All master balances must be numeric.' }, { status: 400 });
	}

	db.prepare(
		'UPDATE settings SET master_shree_start = ?, master_pkb_start = ?, master_hkj_start = ? WHERE id = 1'
	).run(master_shree_start, master_pkb_start, master_hkj_start);

	return GET();
};
