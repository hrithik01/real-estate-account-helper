// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId } from '$lib/server/company.js';
import { getEntryForCompany, readSheetEntry } from '$lib/server/sheets.js';

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	if (!getEntryForCompany(id, companyId)) error(404, 'Entry not found.');
	const values = readSheetEntry(await readJson(request));
	db.prepare('UPDATE independent_sheet_entries SET date = ?, entry_type = ?, amount = ?, remarks = ? WHERE id = ?').run(...values, id);
	return json(db.prepare('SELECT * FROM independent_sheet_entries WHERE id = ?').get(id));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	if (!getEntryForCompany(id, companyId)) error(404, 'Entry not found.');
	db.prepare('DELETE FROM independent_sheet_entries WHERE id = ?').run(id);
	return json({ success: true });
};
