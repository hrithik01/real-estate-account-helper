// @ts-nocheck
import { error, json } from '@sveltejs/kit';
import { getCompany, parseId, readJson } from '$lib/server/company.js';
import { selectCompanyCookie } from '$lib/server/companies.js';

export const PUT = async ({ request, cookies }) => {
	const body = await readJson(request);
	const company = getCompany(parseId(body.id));
	if (!company) error(404, 'Company not found.');
	selectCompanyCookie(cookies, company.id);
	return json(company);
};
