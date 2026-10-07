// @ts-nocheck
import { getCompany } from '$lib/server/company.js';

export const load = ({ locals }) => ({
	companies: locals.companies,
	company: locals.company ? getCompany(locals.company.id) : null
});
