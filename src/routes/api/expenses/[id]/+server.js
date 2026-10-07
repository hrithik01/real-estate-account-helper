// @ts-nocheck
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId } from '$lib/server/company.js';
import { deleteTransaction, updateTransaction } from '$lib/server/transactions.js';

const entryId = (params) => parseId(params.id) ?? error(400, 'Invalid entry id.');

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	return json(updateTransaction('expense', companyId, entryId(params), await readJson(request)));
};

export const DELETE = ({ params, locals }) => {
	deleteTransaction('expense', requireCompanyId(locals), entryId(params));
	return json({ success: true });
};
