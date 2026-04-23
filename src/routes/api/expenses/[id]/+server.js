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
	if (!Number.isInteger(id)) return json({ error: 'Invalid expense id.' }, { status: 400 });

	const body = await request.json();
	const date = String(body.date || '').trim();
	const amount = Number(body.amount);
	const entity_id = body.entity_id ? Number(body.entity_id) : null;
	const projectIds = normalizeProjectIds(body);
	const account_id = body.account_id ? Number(body.account_id) : null;
	const payment_mode = String(body.payment_mode || 'cash').trim();
	const expense_source = String(body.expense_source || 'other').trim();
	const material_type = body.material_type ? String(body.material_type).trim() : null;
	const service_type = body.service_type ? String(body.service_type).trim() : null;
	const utility_type = body.utility_type ? String(body.utility_type).trim() : null;
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
	const { expense_sources } = getMasterOptions();
	if (!expense_sources.includes(expense_source)) {
		return json({ error: 'Invalid expense source.' }, { status: 400 });
	}
	if (!ownerKeys.includes(master_owner)) {
		return json({ error: 'Invalid master owner.' }, { status: 400 });
	}

	const existing = db.prepare('SELECT id, amount, account_id FROM expenses WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Expense not found.' }, { status: 404 });

	const tx = db.transaction(() => {
		adjustAccountBalance(existing.account_id, Number(existing.amount || 0));

		const savedAccountId = payment_mode === 'account' ? account_id : null;
		const firstProjectId = projectIds.length > 0 ? projectIds[0] : null;
		const result = db
			.prepare(
				`UPDATE expenses
				SET date = ?, amount = ?, entity_id = ?, project_id = ?, account_id = ?, payment_mode = ?, expense_source = ?, material_type = ?, service_type = ?, utility_type = ?, master_owner = ?, comments = ?
				WHERE id = ?`
			)
			.run(
				date,
				amount,
				entity_id,
				firstProjectId,
				savedAccountId,
				payment_mode,
				expense_source,
				material_type,
				service_type,
				utility_type,
				master_owner,
				comments || null,
				id
			);

		db.prepare('DELETE FROM expense_projects WHERE expense_id = ?').run(id);
		for (const projectId of projectIds) {
			db.prepare('INSERT OR IGNORE INTO expense_projects (expense_id, project_id) VALUES (?, ?)').run(
				id,
				projectId
			);
		}

		adjustAccountBalance(savedAccountId, -amount);
		return result;
	});

	const result = tx();

	if (result.changes === 0) return json({ error: 'Expense not found.' }, { status: 404 });
	return json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(id));
};

export const DELETE = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid expense id.' }, { status: 400 });

	const existing = db.prepare('SELECT id, amount, account_id FROM expenses WHERE id = ?').get(id);
	if (!existing) return json({ error: 'Expense not found.' }, { status: 404 });

	const tx = db.transaction(() => {
		const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
		db.prepare('DELETE FROM expense_projects WHERE expense_id = ?').run(id);
		adjustAccountBalance(existing.account_id, Number(existing.amount || 0));
		return result;
	});

	const result = tx();
	if (result.changes === 0) return json({ error: 'Expense not found.' }, { status: 404 });
	return json({ success: true });
};
