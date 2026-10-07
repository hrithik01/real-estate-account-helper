// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';
import { readHead } from '$lib/server/heads.js';
import { listHeadBalances, readJson, requireCompanyId } from '$lib/server/company.js';

export const GET = ({ locals }) => json(listHeadBalances(requireCompanyId(locals)));

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const { name, code, opening_balance } = readHead(await readJson(request), companyId);
	const nextOrder = db
		.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ledger_heads WHERE company_id = ?')
		.get(companyId).next;
	db.prepare('INSERT INTO ledger_heads (company_id, code, name, opening_balance, sort_order) VALUES (?, ?, ?, ?, ?)').run(
		companyId,
		code,
		name,
		opening_balance,
		nextOrder
	);
	return json(listHeadBalances(companyId), { status: 201 });
};
