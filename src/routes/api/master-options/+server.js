// @ts-nocheck
import { json } from '@sveltejs/kit';
import { readJson, requireCompanyId } from '$lib/server/company.js';
import { getMasterOptions, setCustomMasterOptions } from '$lib/server/master-options.js';

const asTextList = (value) => (Array.isArray(value) ? value : []).map((item) => String(item || '').trim());

export const GET = ({ locals }) => json(getMasterOptions(requireCompanyId(locals)));

export const PUT = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const body = await readJson(request);
	return json(
		setCustomMasterOptions(companyId, {
			custom_expense_sources: asTextList(body.custom_expense_sources),
			custom_credit_sources: asTextList(body.custom_credit_sources),
			custom_entity_types: asTextList(body.custom_entity_types),
			custom_property_types: asTextList(body.custom_property_types)
		})
	);
};
