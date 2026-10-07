// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { readJson, requireCompanyId, text } from '$lib/server/company.js';

export const GET = ({ locals }) => {
	const companyId = requireCompanyId(locals);
	const rows = db
		.prepare(
			`SELECT a.*,
				(SELECT COUNT(*) FROM income i WHERE i.account_id = a.id) +
				(SELECT COUNT(*) FROM expenses e WHERE e.account_id = a.id) AS transaction_count
			 FROM accounts a
			 WHERE a.company_id = ?
			 ORDER BY a.account_holder COLLATE NOCASE ASC`
		)
		.all(companyId);
	return json(rows);
};

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const body = await readJson(request);
	const bank_name = text(body.bank_name);
	const account_holder = text(body.account_holder);
	const account_balance = Number(body.account_balance || 0);

	if (!bank_name) error(400, 'Bank name is required.');
	if (!account_holder) error(400, 'Account holder is required.');
	if (!Number.isFinite(account_balance)) error(400, 'Account balance must be numeric.');

	const result = db
		.prepare(
			'INSERT INTO accounts (company_id, bank_name, account_number, account_holder, account_balance, comments) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(companyId, bank_name, text(body.account_number), account_holder, account_balance, text(body.comments) || null);

	return json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
};
