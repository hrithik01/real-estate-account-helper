// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId } from '$lib/server/company.js';
import { FINANCE_SELECT, readFinanceEntry } from '$lib/server/finance.js';

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const values = readFinanceEntry(await readJson(request), companyId);
	const result = db
		.prepare(
			`UPDATE finance_entries
			 SET date = ?, entity_id = ?, amount = ?, interest_rate = ?, interest_payout = ?, comments = ?
			 WHERE id = ? AND company_id = ?`
		)
		.run(...values, id, companyId);
	if (result.changes === 0) error(404, 'Finance entry not found.');
	return json(db.prepare(`${FINANCE_SELECT} WHERE f.id = ?`).get(id));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const result = db.prepare('DELETE FROM finance_entries WHERE id = ? AND company_id = ?').run(id, companyId);
	if (result.changes === 0) error(404, 'Finance entry not found.');
	return json({ success: true });
};
