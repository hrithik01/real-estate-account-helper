import db from '$lib/server/db.js';
import { MASTER_OWNERS, PAYMENT_MODES } from '$lib/constants.js';
import { getMasterOptions } from '$lib/server/master-options.js';
import { json } from '@sveltejs/kit';

const ownerKeys = MASTER_OWNERS.map((owner) => owner.key);

const adjustAccountBalance = (accountId, delta) => {
	if (!accountId || !Number.isFinite(delta) || delta === 0) return;
	db.prepare('UPDATE accounts SET account_balance = account_balance + ? WHERE id = ?').run(delta, accountId);
};

const normalizeProjectIds = (body) => {
	const raw = Array.isArray(body.project_ids)
		? body.project_ids
		: body.project_id
			? [body.project_id]
			: [];
	const ids = raw
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value > 0);
	return [...new Set(ids)];
};

export const PUT = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid income id.' }, { status: 400 });

	const body = await request.json();
	const date = String(body.date || '').trim();
	const amount = Number(body.amount);
	const entity_id = body.entity_id ? Number(body.entity_id) : null;
	const projectIds = normalizeProjectIds(body);
	const account_id = body.account_id ? Number(body.account_id) : null;
	const payment_mode = String(body.payment_mode || 'cash').trim();
	const credit_source = String(body.credit_source || 'other').trim();
	const master_owner = String(body.master_owner || 'SHREE').trim();
	const comments = String(body.comments || '').trim();

	if (!date) return json({ error: 'Date is required.' }, { status: 400 });
	if (!Number.isFinite(amount) || amount <= 0) {
		return json({ error: 'Amount must be greater than 0.' }, { status: 400 });
	}
	if (!Number.isInteger(entity_id) || entity_id <= 0) {
		return json({ error: 'Entity is required.' }, { status: 400 });
	}
	if (!PAYMENT_MODES.includes(payment_mode)) {
		return json({ error: 'Invalid payment mode.' }, { status: 400 });
	}
	if (payment_mode === 'account' && !account_id) {
		return json({ error: 'Account is required when payment mode is account.' }, { status: 400 });
	}
	if (payment_mode === 'cash' && account_id) {
		return json({ error: 'Cash transactions cannot be attached to an account.' }, { status: 400 });
	}
	const { credit_sources } = getMasterOptions();
	if (!credit_sources.includes(credit_source)) {
		return json({ error: 'Invalid credit source.' }, { status: 400 });
	}
	if (!ownerKeys.includes(master_owner)) {
		return json({ error: 'Invalid master owner.' }, { status: 400 });
	}

	const existing = db.prepare('SELECT id, amount, account_id FROM income WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Income not found.' }, { status: 404 });

	const tx = db.transaction(() => {
		adjustAccountBalance(existing.account_id, -Number(existing.amount || 0));

		const savedAccountId = payment_mode === 'account' ? account_id : null;
		const firstProjectId = projectIds.length > 0 ? projectIds[0] : null;
		const result = db
			.prepare(
				`UPDATE income
				SET date = ?, amount = ?, entity_id = ?, project_id = ?, account_id = ?, payment_mode = ?, credit_source = ?, master_owner = ?, comments = ?
				WHERE id = ?`
			)
			.run(
				date,
				amount,
				entity_id,
				firstProjectId,
				savedAccountId,
				payment_mode,
				credit_source,
				master_owner,
				comments || null,
				id
			);

		db.prepare('DELETE FROM income_projects WHERE income_id = ?').run(id);
		for (const projectId of projectIds) {
			db.prepare('INSERT OR IGNORE INTO income_projects (income_id, project_id) VALUES (?, ?)').run(
				id,
				projectId
			);
		}

		adjustAccountBalance(savedAccountId, amount);
		return result;
	});

	const result = tx();

	if (result.changes === 0) return json({ error: 'Income not found.' }, { status: 404 });
	return json(db.prepare('SELECT * FROM income WHERE id = ?').get(id));
};

export const DELETE = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid income id.' }, { status: 400 });

	const existing = db.prepare('SELECT id, amount, account_id FROM income WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Income not found.' }, { status: 404 });

	const tx = db.transaction(() => {
		const result = db.prepare('DELETE FROM income WHERE id = ?').run(id);
		db.prepare('DELETE FROM income_projects WHERE income_id = ?').run(id);
		adjustAccountBalance(existing.account_id, -Number(existing.amount || 0));
		return result;
	});

	const result = tx();
	if (result.changes === 0) return json({ error: 'Income not found.' }, { status: 404 });
	return json({ success: true });
};
