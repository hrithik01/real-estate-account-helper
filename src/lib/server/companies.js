// @ts-nocheck
import db from '$lib/server/db.js';
import { error } from '@sveltejs/kit';
import { COMPANY_COLORS } from '$lib/constants.js';
import { COMPANY_COOKIE, deriveCode, normalizeHeadCode, text } from '$lib/server/company.js';

export const selectCompanyCookie = (cookies, id) => {
	cookies.set(COMPANY_COOKIE, String(id), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 365
	});
};

/** Validates editable company profile fields. */
export const readCompanyProfile = (body, currentId = null) => {
	const name = text(body.name);
	if (!name) error(400, 'Company name is required.');
	if (name.length > 80) error(400, 'Company name is too long.');

	const clash = db.prepare('SELECT id FROM companies WHERE name = ? COLLATE NOCASE AND id IS NOT ?').get(name, currentId);
	if (clash) error(400, `A company named "${name}" already exists.`);

	const color = /^#[0-9a-f]{6}$/i.test(text(body.color)) ? text(body.color) : COMPANY_COLORS[0];
	const email = text(body.email);
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error(400, 'Email address looks invalid.');

	return {
		name,
		code: text(body.code).toUpperCase().slice(0, 4) || deriveCode(name, 3) || 'CO',
		legal_name: text(body.legal_name) || null,
		tax_id: text(body.tax_id).toUpperCase() || null,
		address: text(body.address) || null,
		phone: text(body.phone) || null,
		email: email || null,
		color
	};
};

/** Master balance heads requested at company creation; defaults to a single main balance. */
export const readInitialHeads = (value) => {
	const heads = [];
	const seen = new Set();
	for (const item of Array.isArray(value) ? value : []) {
		const name = text(item?.name);
		if (!name) continue;
		const code = normalizeHeadCode(item?.code) || deriveCode(name, 6);
		if (!code) continue;
		if (seen.has(code)) error(400, `Master balance code ${code} is repeated.`);
		const opening_balance = Number(item?.opening_balance || 0);
		if (!Number.isFinite(opening_balance)) error(400, `Opening balance for ${name} must be numeric.`);
		seen.add(code);
		heads.push({ name, code, opening_balance });
	}
	return heads.length > 0 ? heads : [{ name: 'Main', code: 'MAIN', opening_balance: 0 }];
};

export const listCompaniesWithStats = () =>
	db
		.prepare(
			`SELECT c.*,
				(SELECT COUNT(*) FROM income WHERE company_id = c.id) AS income_count,
				(SELECT COUNT(*) FROM expenses WHERE company_id = c.id) AS expense_count,
				(SELECT COALESCE(SUM(amount), 0) FROM income WHERE company_id = c.id) AS total_income,
				(SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE company_id = c.id) AS total_expense,
				(SELECT COUNT(*) FROM entities WHERE company_id = c.id) AS entity_count,
				(SELECT COUNT(*) FROM projects WHERE company_id = c.id) AS project_count,
				(SELECT COUNT(*) FROM accounts WHERE company_id = c.id) AS account_count,
				(SELECT MAX(date) FROM (SELECT date FROM income WHERE company_id = c.id UNION ALL SELECT date FROM expenses WHERE company_id = c.id)) AS last_entry_date
			 FROM companies c
			 ORDER BY c.name COLLATE NOCASE ASC`
		)
		.all();
