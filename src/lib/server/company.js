// @ts-nocheck
import db from '$lib/server/db.js';
import { error } from '@sveltejs/kit';

export const COMPANY_COOKIE = 'ledger_company';

export const listCompanies = () =>
	db.prepare('SELECT id, name, code, color, legal_name FROM companies ORDER BY name COLLATE NOCASE ASC').all();

export const getCompany = (id) => db.prepare('SELECT * FROM companies WHERE id = ?').get(id) || null;

/** Returns the active company id or aborts the request when no company exists yet. */
export const requireCompanyId = (locals) => {
	const id = locals?.company?.id;
	if (!id) error(409, 'Create a company first.');
	return id;
};

export const text = (value) => String(value ?? '').trim();

export const readJson = async (request) => {
	try {
		return (await request.json()) || {};
	} catch {
		error(400, 'Request body must be JSON.');
	}
};

export const parseId = (value) => {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
};

const SCOPED = new Set(['accounts', 'projects', 'entities', 'income', 'expenses', 'finance_entries', 'ledger_heads', 'independent_sheets']);

/** True when the row exists and belongs to the company. */
export const ownsRow = (table, id, companyId) => {
	if (!SCOPED.has(table)) throw new Error(`Unknown scoped table ${table}`);
	if (!id) return false;
	return Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND company_id = ?`).get(id, companyId));
};

/** True when every id exists and belongs to the company. */
export const ownsAll = (table, ids, companyId) => {
	if (!SCOPED.has(table)) throw new Error(`Unknown scoped table ${table}`);
	if (ids.length === 0) return true;
	const placeholders = ids.map(() => '?').join(', ');
	const row = db
		.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE company_id = ? AND id IN (${placeholders})`)
		.get(companyId, ...ids);
	return row.count === ids.length;
};

export const normalizeIdList = (value) => {
	const raw = Array.isArray(value) ? value : value ? [value] : [];
	return [...new Set(raw.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

export const listHeads = (companyId) =>
	db
		.prepare('SELECT * FROM ledger_heads WHERE company_id = ? ORDER BY sort_order ASC, id ASC')
		.all(companyId);

export const headCodes = (companyId) => listHeads(companyId).map((head) => head.code);

export const headUsage = (companyId, code) => {
	const income = db
		.prepare('SELECT COUNT(*) AS count FROM income WHERE company_id = ? AND master_owner = ?')
		.get(companyId, code).count;
	const expenses = db
		.prepare('SELECT COUNT(*) AS count FROM expenses WHERE company_id = ? AND master_owner = ?')
		.get(companyId, code).count;
	return income + expenses;
};

/** Head balances: opening balance + income attached to the head - expenses attached to it. */
export const listHeadBalances = (companyId) => {
	const totals = db
		.prepare(
			`SELECT h.id,
				COALESCE((SELECT SUM(amount) FROM income WHERE company_id = h.company_id AND master_owner = h.code), 0) AS total_income,
				COALESCE((SELECT SUM(amount) FROM expenses WHERE company_id = h.company_id AND master_owner = h.code), 0) AS total_expense,
				(SELECT COUNT(*) FROM income WHERE company_id = h.company_id AND master_owner = h.code)
					+ (SELECT COUNT(*) FROM expenses WHERE company_id = h.company_id AND master_owner = h.code) AS usage_count
			 FROM ledger_heads h
			 WHERE h.company_id = ?`
		)
		.all(companyId);
	const byId = new Map(totals.map((row) => [row.id, row]));
	return listHeads(companyId).map((head) => {
		const row = byId.get(head.id) || { total_income: 0, total_expense: 0, usage_count: 0 };
		return {
			...head,
			total_income: row.total_income,
			total_expense: row.total_expense,
			usage_count: row.usage_count,
			balance: Number(head.opening_balance || 0) + row.total_income - row.total_expense
		};
	});
};

export const deriveCode = (name, maxLength = 4) => {
	const words = text(name)
		.toUpperCase()
		.split(/[^A-Z0-9]+/)
		.filter(Boolean);
	if (words.length === 0) return '';
	if (words.length === 1) return words[0].slice(0, maxLength);
	return words
		.map((word) => word[0])
		.join('')
		.slice(0, maxLength);
};

export const normalizeHeadCode = (value) =>
	text(value)
		.toUpperCase()
		.replace(/[^A-Z0-9_-]+/g, '')
		.slice(0, 12);
