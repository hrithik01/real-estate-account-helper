// @ts-nocheck
import { json } from '@sveltejs/kit';
import { COMPANY_COOKIE, listCompanies } from '$lib/server/company.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle = async ({ event, resolve }) => {
	const companies = listCompanies();
	const requestedId = Number(event.cookies.get(COMPANY_COOKIE));
	const company = companies.find((item) => item.id === requestedId) || companies[0] || null;

	event.locals.companies = companies;
	event.locals.company = company;

	// A page opened for one company must never write into another company that was
	// selected later in a different tab. Clients send the company they were rendered for.
	const { pathname } = event.url;
	if (
		MUTATING.has(event.request.method) &&
		pathname.startsWith('/api/') &&
		!pathname.startsWith('/api/companies')
	) {
		const expected = event.request.headers.get('x-company-id');
		if (expected && company && Number(expected) !== company.id) {
			return json(
				{ message: 'The active company was changed in another tab. Reload this page and try again.' },
				{ status: 409 }
			);
		}
	}

	return resolve(event);
};
