// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';
import { readJson, requireCompanyId } from '$lib/server/company.js';
import { getCompanySettingsRow } from '$lib/server/master-options.js';

const parseJson = (value, fallback) => {
	if (!value) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};

const normalizeItems = (items) =>
	Array.isArray(items)
		? items
				.map((item) => ({
					text: String(item?.text || '').trim(),
					done: Boolean(item?.done)
				}))
				.filter((item) => item.text.length > 0)
		: [];

export const GET = ({ locals }) => {
	const row = getCompanySettingsRow(requireCompanyId(locals));
	return json({
		todos: normalizeItems(parseJson(row?.todos_json, [])),
		coming_income: normalizeItems(parseJson(row?.coming_income_json, [])),
		coming_expenses: normalizeItems(parseJson(row?.coming_expenses_json, []))
	});
};

export const PUT = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	getCompanySettingsRow(companyId);
	const { todos, coming_income, coming_expenses } = await readJson(request);

	db.prepare(
		'UPDATE company_settings SET todos_json = ?, coming_income_json = ?, coming_expenses_json = ? WHERE company_id = ?'
	).run(
		JSON.stringify(normalizeItems(todos)),
		JSON.stringify(normalizeItems(coming_income)),
		JSON.stringify(normalizeItems(coming_expenses)),
		companyId
	);

	return json({ success: true });
};
