// @ts-nocheck
import db from '$lib/server/db.js';
import { error } from '@sveltejs/kit';
import { ownsRow, parseId, text } from '$lib/server/company.js';

export const ENTRY_TYPES = ['credit', 'debit'];

const SHEET_SELECT = `
	SELECT s.*, e.name AS entity_name, e.entity_code,
		COALESCE(SUM(CASE WHEN x.entry_type = 'credit' THEN x.amount END), 0) AS total_credit,
		COALESCE(SUM(CASE WHEN x.entry_type = 'debit' THEN x.amount END), 0) AS total_debit,
		COUNT(x.id) AS entry_count
	FROM independent_sheets s
	LEFT JOIN entities e ON e.id = s.entity_id
	LEFT JOIN independent_sheet_entries x ON x.sheet_id = s.id`;

const withNet = (row) => (row ? { ...row, net: row.total_credit - row.total_debit } : null);

export const listSheets = (companyId) =>
	db
		.prepare(`${SHEET_SELECT} WHERE s.company_id = ? GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC`)
		.all(companyId)
		.map(withNet);

export const getSheet = (id, companyId) =>
	withNet(db.prepare(`${SHEET_SELECT} WHERE s.id = ? AND s.company_id = ? GROUP BY s.id`).get(id, companyId));

export const requireSheet = (id, companyId) => getSheet(id, companyId) ?? error(404, 'Sheet not found.');

export const listSheetEntries = (sheetId) =>
	db.prepare('SELECT * FROM independent_sheet_entries WHERE sheet_id = ? ORDER BY date ASC, id ASC').all(sheetId);

/** Entry row that also proves its sheet belongs to the company. */
export const getEntryForCompany = (entryId, companyId) =>
	db
		.prepare(
			`SELECT x.* FROM independent_sheet_entries x
			 JOIN independent_sheets s ON s.id = x.sheet_id
			 WHERE x.id = ? AND s.company_id = ?`
		)
		.get(entryId, companyId);

/** Validates a sheet payload and returns [entity_id, title, comments]. */
export const readSheet = (body, companyId) => {
	const entity_id = parseId(body.entity_id);
	if (!entity_id || !ownsRow('entities', entity_id, companyId)) error(400, 'Select a valid entity.');
	return [entity_id, text(body.title) || null, text(body.comments) || null];
};

/** Validates a sheet entry payload and returns [date, entry_type, amount, remarks]. */
export const readSheetEntry = (body) => {
	const date = text(body.date);
	const entry_type = text(body.entry_type);
	const amount = Number(body.amount);

	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error(400, 'A valid date is required.');
	if (!ENTRY_TYPES.includes(entry_type)) error(400, 'Choose credit or debit.');
	if (!Number.isFinite(amount) || amount <= 0) error(400, 'Amount must be greater than 0.');

	return [date, entry_type, amount, text(body.remarks) || null];
};
