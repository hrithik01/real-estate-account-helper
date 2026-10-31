// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId } from '$lib/server/company.js';
import { getSheet, listSheetEntries, readSheet, requireSheet } from '$lib/server/sheets.js';

export const GET = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	return json({ sheet: requireSheet(id, companyId), entries: listSheetEntries(id) });
};

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const values = readSheet(await readJson(request), companyId);
	const result = db
		.prepare('UPDATE independent_sheets SET entity_id = ?, title = ?, comments = ? WHERE id = ? AND company_id = ?')
		.run(...values, id, companyId);
	if (result.changes === 0) error(404, 'Sheet not found.');
	return json(getSheet(id, companyId));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const result = db.prepare('DELETE FROM independent_sheets WHERE id = ? AND company_id = ?').run(id, companyId);
	if (result.changes === 0) error(404, 'Sheet not found.');
	return json({ success: true });
};
