// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { readHead } from '$lib/server/heads.js';
import { headUsage, listHeadBalances, listHeads, parseId, readJson, requireCompanyId } from '$lib/server/company.js';

const findHead = (params, companyId) => {
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const head = db.prepare('SELECT * FROM ledger_heads WHERE id = ? AND company_id = ?').get(id, companyId);
	if (!head) error(404, 'Master balance not found.');
	return head;
};

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const head = findHead(params, companyId);
	const { name, code, opening_balance } = readHead(await readJson(request), companyId, head.id);

	db.transaction(() => {
		db.prepare('UPDATE ledger_heads SET code = ?, name = ?, opening_balance = ? WHERE id = ? AND company_id = ?').run(
			code,
			name,
			opening_balance,
			head.id,
			companyId
		);
		// Entries store the head code, so a code change is carried over to them.
		if (code !== head.code) {
			for (const table of ['income', 'expenses']) {
				db.prepare(`UPDATE ${table} SET master_owner = ? WHERE company_id = ? AND master_owner = ?`).run(
					code,
					companyId,
					head.code
				);
			}
		}
	})();

	return json(listHeadBalances(companyId));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const head = findHead(params, companyId);
	const usage = headUsage(companyId, head.code);
	if (usage > 0) error(400, `${head.name} is used by ${usage} entries and cannot be removed.`);
	if (listHeads(companyId).length <= 1) error(400, 'A company needs at least one master balance.');
	db.prepare('DELETE FROM ledger_heads WHERE id = ? AND company_id = ?').run(head.id, companyId);
	return json(listHeadBalances(companyId));
};
