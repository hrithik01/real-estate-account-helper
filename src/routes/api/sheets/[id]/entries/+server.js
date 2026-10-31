// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId } from '$lib/server/company.js';
import { readSheetEntry, requireSheet } from '$lib/server/sheets.js';

export const POST = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const sheetId = parseId(params.id) ?? error(400, 'Invalid id.');
	requireSheet(sheetId, companyId);
	const values = readSheetEntry(await readJson(request));
	const result = db
		.prepare('INSERT INTO independent_sheet_entries (sheet_id, date, entry_type, amount, remarks) VALUES (?, ?, ?, ?, ?)')
		.run(sheetId, ...values);
	return json(db.prepare('SELECT * FROM independent_sheet_entries WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
};
