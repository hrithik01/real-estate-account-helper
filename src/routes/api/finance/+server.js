// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';
import { readJson, requireCompanyId } from '$lib/server/company.js';
import { FINANCE_SELECT, readFinanceEntry } from '$lib/server/finance.js';

export const GET = ({ locals }) => {
	const companyId = requireCompanyId(locals);
	return json(db.prepare(`${FINANCE_SELECT} WHERE f.company_id = ? ORDER BY f.date DESC, f.id DESC`).all(companyId));
};

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const values = readFinanceEntry(await readJson(request), companyId);
	const result = db
		.prepare(
			`INSERT INTO finance_entries (company_id, date, entity_id, amount, interest_rate, interest_payout, comments)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(companyId, ...values);
	return json(db.prepare(`${FINANCE_SELECT} WHERE f.id = ?`).get(result.lastInsertRowid), { status: 201 });
};
