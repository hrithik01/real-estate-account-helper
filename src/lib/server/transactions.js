// @ts-nocheck
import db from '$lib/server/db.js';
import { PAYMENT_MODES } from '$lib/constants.js';
import { getMasterOptions } from '$lib/server/master-options.js';
import { headCodes, normalizeIdList, ownsAll, ownsRow, parseId, text } from '$lib/server/company.js';
import { error } from '@sveltejs/kit';

export const KINDS = {
	income: {
		table: 'income',
		link: 'income_projects',
		linkFk: 'income_id',
		sourceField: 'credit_source',
		optionsKey: 'credit_sources',
		sign: 1,
		label: 'Income',
		subtypes: []
	},
	expense: {
		table: 'expenses',
		link: 'expense_projects',
		linkFk: 'expense_id',
		sourceField: 'expense_source',
		optionsKey: 'expense_sources',
		sign: -1,
		label: 'Expense',
		subtypes: ['material_type', 'service_type', 'utility_type']
	}
};

export const parseLedgerDate = (value) => {
	const raw = String(value || '').trim();
	if (!raw) return 0;
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00Z`) || 0;

	const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
	if (slashMatch) {
		const day = Number(slashMatch[1]);
		const month = Number(slashMatch[2]);
		const rawYear = Number(slashMatch[3]);
		const year = rawYear < 100 ? 2000 + rawYear : rawYear;
		return Date.UTC(year, month - 1, day);
	}

	return Date.parse(raw) || 0;
};

/** Orders by ledger date, then entry time, then id. `latest` is newest first. */
export const compareRowsByDate = (left, right, direction = 'latest') => {
	const multiplier = direction === 'oldest' ? 1 : -1;
	const dateDiff = parseLedgerDate(left.date) - parseLedgerDate(right.date);
	if (dateDiff !== 0) return dateDiff * multiplier;

	const createdDiff = Date.parse(left.created_at || '') - Date.parse(right.created_at || '');
	if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff * multiplier;

	return (Number(left.id || 0) - Number(right.id || 0)) * multiplier;
};

const adjustAccountBalance = (accountId, delta, companyId) => {
	if (!accountId || !Number.isFinite(delta) || delta === 0) return;
	db.prepare('UPDATE accounts SET account_balance = account_balance + ? WHERE id = ? AND company_id = ?').run(
		delta,
		accountId,
		companyId
	);
};

const selectSql = (config) => `
	SELECT
		t.*,
		t.${config.sourceField} AS source,
		ent.name AS entity_name,
		ent.entity_type,
		ent.entity_code,
		(SELECT GROUP_CONCAT(l.project_id) FROM ${config.link} l WHERE l.${config.linkFk} = t.id) AS project_ids_csv,
		(SELECT GROUP_CONCAT(p.property_name, ', ') FROM ${config.link} l JOIN projects p ON p.id = l.project_id WHERE l.${config.linkFk} = t.id) AS project_names,
		a.account_holder,
		a.bank_name,
		h.name AS head_name
	FROM ${config.table} t
	LEFT JOIN entities ent ON ent.id = t.entity_id
	LEFT JOIN accounts a ON a.id = t.account_id
	LEFT JOIN ledger_heads h ON h.company_id = t.company_id AND h.code = t.master_owner
	WHERE t.company_id = ?`;

const hydrate = ({ project_ids_csv, ...row }) => ({
	...row,
	project_ids: project_ids_csv
		? project_ids_csv
				.split(',')
				.map(Number)
				.filter((value) => Number.isInteger(value))
		: []
});

const getTransaction = (config, id, companyId) => {
	const row = db.prepare(`${selectSql(config)} AND t.id = ?`).get(companyId, id);
	return row ? hydrate(row) : null;
};

const normalizePage = (value) => {
	const page = Number.parseInt(String(value || '1'), 10);
	return Number.isInteger(page) && page > 0 ? page : 1;
};

const isActive = (value) => value && value !== 'all';

export const listTransactions = (kind, companyId, searchParams) => {
	const config = KINDS[kind];
	const get = (key) => searchParams.get(key);
	const start = get('start');
	const end = get('end');
	const entityId = get('entityId');
	const paymentMode = get('paymentMode');
	const source = get('source') || get(kind === 'income' ? 'creditSource' : 'expenseSource');
	const projectId = get('projectId');
	const head = get('head');
	const timestampFrom = get('timestampFrom');
	const timestampTo = get('timestampTo');
	const search = text(get('q')).toLowerCase();
	const exportAll = get('all') === '1';
	const limitParam = Number(get('limit') || 100);
	const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

	let sql = selectSql(config);
	const params = [companyId];
	if (start) {
		sql += ' AND t.date >= ?';
		params.push(start);
	}
	if (end) {
		sql += ' AND t.date <= ?';
		params.push(end);
	}
	if (isActive(entityId)) {
		sql += ' AND t.entity_id = ?';
		params.push(Number(entityId));
	}
	if (isActive(paymentMode)) {
		sql += ' AND t.payment_mode = ?';
		params.push(paymentMode);
	}
	if (isActive(source)) {
		sql += ` AND t.${config.sourceField} = ?`;
		params.push(source);
	}
	if (isActive(head)) {
		sql += ' AND t.master_owner = ?';
		params.push(head);
	}
	if (isActive(projectId)) {
		sql += ` AND EXISTS (SELECT 1 FROM ${config.link} l WHERE l.${config.linkFk} = t.id AND l.project_id = ?)`;
		params.push(Number(projectId));
	}

	const rows = db
		.prepare(sql)
		.all(...params)
		.map(hydrate)
		.filter((row) => {
			const entered = String(row.created_at || row.date || '').slice(0, 10);
			if (timestampFrom && entered < timestampFrom) return false;
			if (timestampTo && entered > timestampTo) return false;
			if (search) {
				const haystack = [row.comments, row.entity_name, row.project_names, row.source, row.account_holder, row.amount]
					.join(' ')
					.toLowerCase();
				if (!haystack.includes(search)) return false;
			}
			return true;
		})
		.sort((left, right) => compareRowsByDate(left, right, 'latest'));

	const totalCount = rows.length;
	const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
	if (exportAll) {
		return { rows, pagination: { page: 1, limit: totalCount, totalCount, totalPages: 1, totalAmount } };
	}

	const totalPages = Math.max(1, Math.ceil(totalCount / limit));
	const page = Math.min(normalizePage(get('page')), totalPages);
	const startIndex = (page - 1) * limit;
	return {
		rows: rows.slice(startIndex, startIndex + limit),
		pagination: { page, limit, totalCount, totalPages, totalAmount }
	};
};

const validate = (config, companyId, body, existing = null) => {
	const date = text(body.date);
	const amount = Number(body.amount);
	const entity_id = parseId(body.entity_id);
	const project_ids = normalizeIdList(body.project_ids ?? body.project_id);
	const payment_mode = text(body.payment_mode || 'cash');
	const account_id = payment_mode === 'account' ? parseId(body.account_id) : null;
	const source = text(body[config.sourceField] || body.source || 'other');
	const comments = text(body.comments);
	const codes = headCodes(companyId);
	const master_owner = text(body.master_owner) || codes[0] || '';

	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error(400, 'A valid date is required.');
	if (!Number.isFinite(amount) || amount <= 0) error(400, 'Amount must be greater than 0.');
	if (!entity_id || !ownsRow('entities', entity_id, companyId)) error(400, 'Select a valid entity.');
	if (!PAYMENT_MODES.includes(payment_mode)) error(400, 'Invalid payment mode.');
	if (payment_mode === 'account' && !account_id) error(400, 'Select an account for account transactions.');
	if (account_id && !ownsRow('accounts', account_id, companyId)) error(400, 'Select a valid account.');
	if (!ownsAll('projects', project_ids, companyId)) error(400, 'One or more selected projects are invalid.');

	const allowedSources = getMasterOptions(companyId)[config.optionsKey];
	const keepsExistingSource = existing && existing[config.sourceField] === source;
	if (!allowedSources.includes(source) && !keepsExistingSource) error(400, `Invalid ${config.label.toLowerCase()} source.`);
	if (!codes.includes(master_owner)) error(400, 'Select a valid master balance.');

	const subtypes = {};
	for (const field of config.subtypes) {
		subtypes[field] = text(body[field]) || null;
	}

	return { date, amount, entity_id, project_ids, payment_mode, account_id, source, master_owner, comments, subtypes };
};

const writeColumns = (config) => [
	'date',
	'amount',
	'entity_id',
	'project_id',
	'account_id',
	'payment_mode',
	config.sourceField,
	...config.subtypes,
	'master_owner',
	'comments'
];

const columnValues = (config, values) => [
	values.date,
	values.amount,
	values.entity_id,
	values.project_ids[0] ?? null,
	values.account_id,
	values.payment_mode,
	values.source,
	...config.subtypes.map((field) => values.subtypes[field]),
	values.master_owner,
	values.comments || null
];

const replaceLinks = (config, id, projectIds) => {
	db.prepare(`DELETE FROM ${config.link} WHERE ${config.linkFk} = ?`).run(id);
	const insert = db.prepare(`INSERT OR IGNORE INTO ${config.link} (${config.linkFk}, project_id) VALUES (?, ?)`);
	for (const projectId of projectIds) insert.run(id, projectId);
};

export const createTransaction = (kind, companyId, body) => {
	const config = KINDS[kind];
	const values = validate(config, companyId, body);
	const columns = writeColumns(config);

	const id = db.transaction(() => {
		const result = db
			.prepare(
				`INSERT INTO ${config.table} (company_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`
			)
			.run(companyId, ...columnValues(config, values));
		const insertedId = Number(result.lastInsertRowid);
		replaceLinks(config, insertedId, values.project_ids);
		adjustAccountBalance(values.account_id, config.sign * values.amount, companyId);
		return insertedId;
	})();

	return getTransaction(config, id, companyId);
};

export const updateTransaction = (kind, companyId, id, body) => {
	const config = KINDS[kind];
	const existing = db.prepare(`SELECT * FROM ${config.table} WHERE id = ? AND company_id = ?`).get(id, companyId);
	if (!existing) error(404, `${config.label} entry not found.`);
	const values = validate(config, companyId, body, existing);
	const columns = writeColumns(config);

	db.transaction(() => {
		adjustAccountBalance(existing.account_id, -config.sign * Number(existing.amount || 0), companyId);
		db.prepare(
			`UPDATE ${config.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? AND company_id = ?`
		).run(...columnValues(config, values), id, companyId);
		replaceLinks(config, id, values.project_ids);
		adjustAccountBalance(values.account_id, config.sign * values.amount, companyId);
	})();

	return getTransaction(config, id, companyId);
};

export const deleteTransaction = (kind, companyId, id) => {
	const config = KINDS[kind];
	const existing = db
		.prepare(`SELECT id, amount, account_id FROM ${config.table} WHERE id = ? AND company_id = ?`)
		.get(id, companyId);
	if (!existing) error(404, `${config.label} entry not found.`);

	db.transaction(() => {
		db.prepare(`DELETE FROM ${config.link} WHERE ${config.linkFk} = ?`).run(id);
		db.prepare(`DELETE FROM ${config.table} WHERE id = ? AND company_id = ?`).run(id, companyId);
		adjustAccountBalance(existing.account_id, -config.sign * Number(existing.amount || 0), companyId);
	})();
};
