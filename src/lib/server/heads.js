// @ts-nocheck
import db from '$lib/server/db.js';
import { error } from '@sveltejs/kit';
import { deriveCode, normalizeHeadCode, text } from '$lib/server/company.js';

/** Validates a master balance (ledger head) payload for a company. */
export const readHead = (body, companyId, currentId = null) => {
	const name = text(body.name);
	const code = normalizeHeadCode(body.code) || deriveCode(name, 6);
	const opening_balance = Number(body.opening_balance || 0);

	if (!name) error(400, 'Name is required.');
	if (!code) error(400, 'Code is required.');
	if (!Number.isFinite(opening_balance)) error(400, 'Opening balance must be numeric.');

	const clash = db
		.prepare('SELECT id FROM ledger_heads WHERE company_id = ? AND code = ? AND id IS NOT ?')
		.get(companyId, code, currentId);
	if (clash) error(400, `Code ${code} is already used by another master balance.`);

	return { name, code, opening_balance };
};
