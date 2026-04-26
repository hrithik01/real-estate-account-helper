// @ts-nocheck
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

const parseLedgerDate = (value) => {
	const text = String(value || '').trim();
	if (!text) return 0;

	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return Date.parse(`${text}T00:00:00Z`) || 0;
	}

	const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slashMatch) {
		const day = Number(slashMatch[1]);
		const month = Number(slashMatch[2]);
		const rawYear = Number(slashMatch[3]);
		const year = rawYear < 100 ? 2000 + rawYear : rawYear;
		return Date.UTC(year, month - 1, day);
	}

	return Date.parse(text) || 0;
};

const sortRowsByLedgerDate = (rows) =>
	rows.sort((left, right) => {
		const dateDiff = parseLedgerDate(right.date) - parseLedgerDate(left.date);
		if (dateDiff !== 0) return dateDiff;

		const createdDiff = Date.parse(right.created_at || '') - Date.parse(left.created_at || '');
		if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff;

		return Number(right.id || 0) - Number(left.id || 0);
	});

const normalizePageNumber = (value) => {
	const page = Number.parseInt(String(value || '1'), 10);
	return Number.isInteger(page) && page > 0 ? page : 1;
};

const normalizeComparableDate = (value) => String(value || '').slice(0, 10);

const getRowTimestamp = (row) => row.created_at || row.updated_at || row.date;

export const GET = ({ url }) => {
	const start = url.searchParams.get('start');
	const end = url.searchParams.get('end');
	const entityId = url.searchParams.get('entityId');
	const paymentMode = url.searchParams.get('paymentMode');
	const expenseSource = url.searchParams.get('expenseSource');
	const projectId = url.searchParams.get('projectId');
	const timestampFrom = url.searchParams.get('timestampFrom');
	const timestampTo = url.searchParams.get('timestampTo');
	const pageParam = normalizePageNumber(url.searchParams.get('page'));
	const limitParam = Number(url.searchParams.get('limit') || 100);
	const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

	let query = `
		SELECT
			e.*,
			ent.name as entity_name,
			ent.entity_type,
			(
				SELECT GROUP_CONCAT(ep.project_id)
				FROM expense_projects ep
				WHERE ep.expense_id = e.id
			) as project_ids_csv,
			(
				SELECT GROUP_CONCAT(p2.property_name, ', ')
				FROM expense_projects ep2
				JOIN projects p2 ON p2.id = ep2.project_id
				WHERE ep2.expense_id = e.id
			) as project_names,
			a.account_holder,
			a.bank_name
		FROM expenses e
		LEFT JOIN entities ent ON ent.id = e.entity_id
		LEFT JOIN accounts a ON a.id = e.account_id
		WHERE 1 = 1
	`;
	const params = [];

	if (start && end) {
		query += ' AND e.date BETWEEN ? AND ?';
		params.push(start, end);
	}

	if (entityId && entityId !== 'all') {
		query += ' AND e.entity_id = ?';
		params.push(Number(entityId));
	}

	query += start && end ? ' ORDER BY e.id DESC' : ' ORDER BY e.created_at DESC, e.id DESC';

	const rows = db.prepare(query).all(...params).map((row) => ({
		...row,
		project_ids: row.project_ids_csv
			? row.project_ids_csv.split(',').map((value) => Number(value)).filter((value) => Number.isInteger(value))
			: []
	}));

	sortRowsByLedgerDate(rows);

	const filteredRows = rows.filter((row) => {
		if (start && end) {
			const rowDate = String(row.date || '');
			if (rowDate < start || rowDate > end) return false;
		}

		if (entityId && entityId !== 'all' && String(row.entity_id) !== String(entityId)) return false;
		if (paymentMode && paymentMode !== 'all' && String(row.payment_mode || '') !== paymentMode) return false;
		if (expenseSource && expenseSource !== 'all' && String(row.expense_source || '') !== expenseSource)
			return false;
		if (
			projectId &&
			projectId !== 'all' &&
			!(row.project_ids || []).map(String).includes(String(projectId))
		)
			return false;

		const rowTimestamp = normalizeComparableDate(getRowTimestamp(row));
		if (timestampFrom && rowTimestamp < timestampFrom) return false;
		if (timestampTo && rowTimestamp > timestampTo) return false;
		return true;
	});

	const totalCount = filteredRows.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / limit));
	const page = Math.min(pageParam, totalPages);
	const startIndex = (page - 1) * limit;

	return json({
		rows: filteredRows.slice(startIndex, startIndex + limit),
		pagination: {
			page,
			limit,
			totalCount,
			totalPages
		}
	});
};

export const POST = async ({ request }) => {
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

	const tx = db.transaction(() => {
		const savedAccountId = payment_mode === 'account' ? account_id : null;
		const firstProjectId = projectIds.length > 0 ? projectIds[0] : null;
		const result = db
			.prepare(
				`INSERT INTO expenses
				(date, amount, entity_id, project_id, account_id, payment_mode, expense_source, material_type, service_type, utility_type, master_owner, comments)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
				comments || null
			);

		for (const projectId of projectIds) {
			db.prepare('INSERT OR IGNORE INTO expense_projects (expense_id, project_id) VALUES (?, ?)').run(
				result.lastInsertRowid,
				projectId
			);
		}

		adjustAccountBalance(savedAccountId, -amount);
		return result.lastInsertRowid;
	});

	const insertedId = tx();

	return json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(insertedId), { status: 201 });
};
