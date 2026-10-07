// @ts-nocheck
import { json } from '@sveltejs/kit';
import { readJson, requireCompanyId } from '$lib/server/company.js';
import { createTransaction, listTransactions } from '$lib/server/transactions.js';

export const GET = ({ url, locals }) => json(listTransactions('income', requireCompanyId(locals), url.searchParams));

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	return json(createTransaction('income', companyId, await readJson(request)), { status: 201 });
};
