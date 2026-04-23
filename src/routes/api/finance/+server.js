import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';

const PAYOUT_TYPES = ['monthly', 'quarterly', 'half-yearly', 'annually'];

export const GET = () => {
	const rows = db
		.prepare(
			`SELECT
				f.*,
				e.name as entity_name,
				e.entity_code
			 FROM finance_entries f
			 LEFT JOIN entities e ON e.id = f.entity_id
			 ORDER BY f.date DESC, f.id DESC`
		)
		.all();

	return json(rows);
};

export const POST = async ({ request }) => {
	const body = await request.json();
	const date = String(body.date || '').trim();
	const entity_id = body.entity_id ? Number(body.entity_id) : null;
	const amount = Number(body.amount);
	const interest_rate = body.interest_rate === '' || body.interest_rate == null ? 1.5 : Number(body.interest_rate);
	const interest_payout = String(body.interest_payout || 'monthly').trim();
	const comments = String(body.comments || '').trim();

	if (!date) return json({ error: 'Date is required.' }, { status: 400 });
	if (!Number.isInteger(entity_id) || entity_id <= 0) {
		return json({ error: 'Entity is required.' }, { status: 400 });
	}
	if (!Number.isFinite(amount) || amount <= 0) {
		return json({ error: 'Amount must be greater than 0.' }, { status: 400 });
	}
	if (!Number.isFinite(interest_rate) || interest_rate < 0) {
		return json({ error: 'Interest rate must be 0 or greater.' }, { status: 400 });
	}
	if (!PAYOUT_TYPES.includes(interest_payout)) {
		return json({ error: 'Invalid interest payout cycle.' }, { status: 400 });
	}

	const result = db
		.prepare(
			`INSERT INTO finance_entries
			(date, entity_id, amount, interest_rate, interest_payout, comments)
			VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(date, entity_id, amount, interest_rate, interest_payout, comments || null);

	const created = db
		.prepare(
			`SELECT
				f.*,
				e.name as entity_name,
				e.entity_code
			 FROM finance_entries f
			 LEFT JOIN entities e ON e.id = f.entity_id
			 WHERE f.id = ?`
		)
		.get(result.lastInsertRowid);

	return json(created, { status: 201 });
};
