// @ts-nocheck
import db, { backupDatabase } from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { getCompany, parseId, readJson, text } from '$lib/server/company.js';
import { readCompanyProfile } from '$lib/server/companies.js';

const findCompany = (params) => {
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const company = getCompany(id);
	if (!company) error(404, 'Company not found.');
	return company;
};

export const PUT = async ({ params, request }) => {
	const company = findCompany(params);
	const profile = readCompanyProfile(await readJson(request), company.id);
	db.prepare(
		`UPDATE companies
		 SET name = @name, code = @code, legal_name = @legal_name, tax_id = @tax_id,
			 address = @address, phone = @phone, email = @email, color = @color
		 WHERE id = @id`
	).run({ ...profile, id: company.id });
	return json(getCompany(company.id));
};

export const DELETE = async ({ params, request }) => {
	const company = findCompany(params);
	const body = await readJson(request);
	if (text(body.confirm_name).toLowerCase() !== company.name.toLowerCase()) {
		error(400, 'Type the company name exactly to confirm deletion.');
	}
	// Deleting a company removes all of its books; keep a restorable copy first.
	const backup = backupDatabase(`before-delete-${company.name}`);
	db.prepare('DELETE FROM companies WHERE id = ?').run(company.id);
	return json({ success: true, backup });
};
