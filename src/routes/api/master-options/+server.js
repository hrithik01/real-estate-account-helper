import { json } from '@sveltejs/kit';
import { getMasterOptions, setCustomMasterOptions } from '$lib/server/master-options.js';

const asTextList = (value) => (Array.isArray(value) ? value : []).map((item) => String(item || '').trim());

export const GET = () => {
	return json(getMasterOptions());
};

export const PUT = async ({ request }) => {
	const body = await request.json();
	const updated = setCustomMasterOptions({
		custom_expense_sources: asTextList(body.custom_expense_sources),
		custom_credit_sources: asTextList(body.custom_credit_sources),
		custom_entity_types: asTextList(body.custom_entity_types),
		custom_property_types: asTextList(body.custom_property_types)
	});
	return json(updated);
};
