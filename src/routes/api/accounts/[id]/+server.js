import db from '$lib/server/db.js';
import { BANKS } from '$lib/constants.js';
import { json } from '@sveltejs/kit';

export const PUT = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid id.' }, { status: 400 });

	const body = await request.json();
	const bank_name = String(body.bank_name || '').trim();
	const account_number = String(body.account_number || '').trim();
	const account_holder = String(body.account_holder || '').trim();
	const comments = String(body.comments || '').trim();
	const allow_balance_edit = Boolean(body.allow_balance_edit);

	if (!bank_name || !BANKS.includes(bank_name)) {
		return json({ error: 'Valid bank is required.' }, { status: 400 });
	}
	if (!account_holder) {
		return json({ error: 'Account holder is required.' }, { status: 400 });
	}
	const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Account not found.' }, { status: 404 });

	let account_balance = Number(existing.account_balance || 0);
	if (allow_balance_edit) {
		account_balance = Number(body.account_balance);
		if (!Number.isFinite(account_balance)) {
			return json({ error: 'Account balance must be numeric.' }, { status: 400 });
		}
	}

	const result = db
		.prepare(
			'UPDATE accounts SET bank_name = ?, account_number = ?, account_holder = ?, account_balance = ?, comments = ? WHERE id = ?'
		)
		.run(bank_name, account_number, account_holder, account_balance, comments || null, id);

	if (result.changes === 0) return json({ error: 'Account not found.' }, { status: 404 });
	return json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id));
};

export const DELETE = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid id.' }, { status: 400 });

	const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
	if (result.changes === 0) return json({ error: 'Account not found.' }, { status: 404 });
	return json({ success: true });
};
