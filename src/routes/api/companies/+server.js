// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { getCompany, parseId, readJson } from '$lib/server/company.js';
import {
	listCompaniesWithStats,
	readCompanyProfile,
	readInitialHeads,
	selectCompanyCookie
} from '$lib/server/companies.js';

export const GET = () => json(listCompaniesWithStats());

export const POST = async ({ request, cookies }) => {
	const body = await readJson(request);
	const profile = readCompanyProfile(body);
	const heads = readInitialHeads(body.heads);
	const copyFromId = body.copy_options_from ? parseId(body.copy_options_from) : null;
	if (body.copy_options_from && !(copyFromId && getCompany(copyFromId))) error(400, 'Company to copy lists from was not found.');

	const id = db.transaction(() => {
		const result = db
			.prepare(
				`INSERT INTO companies (name, code, legal_name, tax_id, address, phone, email, color)
				 VALUES (@name, @code, @legal_name, @tax_id, @address, @phone, @email, @color)`
			)
			.run(profile);
		const companyId = Number(result.lastInsertRowid);

		if (copyFromId) {
			db.prepare(
				`INSERT INTO company_settings (company_id, custom_expense_sources_json, custom_credit_sources_json, custom_entity_types_json, custom_property_types_json)
				 SELECT ?, custom_expense_sources_json, custom_credit_sources_json, custom_entity_types_json, custom_property_types_json
				 FROM company_settings WHERE company_id = ?`
			).run(companyId, copyFromId);
		}
		db.prepare('INSERT OR IGNORE INTO company_settings (company_id) VALUES (?)').run(companyId);

		const insertHead = db.prepare(
			'INSERT INTO ledger_heads (company_id, code, name, opening_balance, sort_order) VALUES (?, ?, ?, ?, ?)'
		);
		heads.forEach((head, index) => insertHead.run(companyId, head.code, head.name, head.opening_balance, index));
		return companyId;
	})();

	if (body.activate !== false) selectCompanyCookie(cookies, id);
	return json(getCompany(id), { status: 201 });
};
