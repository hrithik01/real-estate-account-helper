// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';
import { readJson, requireCompanyId } from '$lib/server/company.js';
import { getSheet, listSheets, readSheet } from '$lib/server/sheets.js';

export const GET = ({ locals }) => json(listSheets(requireCompanyId(locals)));

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const values = readSheet(await readJson(request), companyId);
	const result = db
		.prepare('INSERT INTO independent_sheets (company_id, entity_id, title, comments) VALUES (?, ?, ?, ?)')
		.run(companyId, ...values);
	return json(getSheet(Number(result.lastInsertRowid), companyId), { status: 201 });
};
