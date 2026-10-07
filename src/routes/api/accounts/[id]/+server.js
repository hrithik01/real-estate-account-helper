// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId, text } from '$lib/server/company.js';

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const body = await readJson(request);
	const bank_name = text(body.bank_name);
	const account_holder = text(body.account_holder);

	if (!bank_name) error(400, 'Bank name is required.');
	if (!account_holder) error(400, 'Account holder is required.');

	const existing = db.prepare('SELECT * FROM accounts WHERE id = ? AND company_id = ?').get(id, companyId);
	if (!existing) error(404, 'Account not found.');

	// The balance moves with transactions; overriding it is an explicit opt-in.
	let account_balance = Number(existing.account_balance || 0);
	if (body.allow_balance_edit) {
		account_balance = Number(body.account_balance);
		if (!Number.isFinite(account_balance)) error(400, 'Account balance must be numeric.');
	}

	db.prepare(
		'UPDATE accounts SET bank_name = ?, account_number = ?, account_holder = ?, account_balance = ?, comments = ? WHERE id = ? AND company_id = ?'
	).run(bank_name, text(body.account_number), account_holder, account_balance, text(body.comments) || null, id, companyId);

	return json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const result = db.prepare('DELETE FROM accounts WHERE id = ? AND company_id = ?').run(id, companyId);
	if (result.changes === 0) error(404, 'Account not found.');
	return json({ success: true });
};
