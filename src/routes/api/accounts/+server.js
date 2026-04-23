import db from '$lib/server/db.js';
import { BANKS } from '$lib/constants.js';
import { json } from '@sveltejs/kit';

export const GET = () => {
	const rows = db.prepare('SELECT * FROM accounts ORDER BY account_holder ASC').all();
	return json(rows);
};

export const POST = async ({ request }) => {
	const body = await request.json();
	const bank_name = String(body.bank_name || '').trim();
	const account_number = String(body.account_number || '').trim();
	const account_holder = String(body.account_holder || '').trim();
	const account_balance = Number(body.account_balance || 0);
	const comments = String(body.comments || '').trim();

	if (!bank_name || !BANKS.includes(bank_name)) {
		return json({ error: 'Valid bank is required.' }, { status: 400 });
	}
	if (!account_holder) {
		return json({ error: 'Account holder is required.' }, { status: 400 });
	}
	if (!Number.isFinite(account_balance)) {
		return json({ error: 'Account balance must be numeric.' }, { status: 400 });
	}

	const result = db
		.prepare(
			'INSERT INTO accounts (bank_name, account_number, account_holder, account_balance, comments) VALUES (?, ?, ?, ?, ?)'
		)
		.run(bank_name, account_number, account_holder, account_balance, comments || null);

	const created = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
	return json(created, { status: 201 });
};
