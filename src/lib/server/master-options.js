// @ts-nocheck
import db from '$lib/server/db.js';
import {
	CREDIT_SOURCE,
	ENTITIES,
	ENTITY_TYPES,
	EXPENSE_SOURCE,
	PROPERTY_TYPES
} from '$lib/constants.js';

const parseArray = (value) => {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

const normalizeTextList = (items) =>
	[...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];

const mergeLists = (defaults, customs) => normalizeTextList([...(defaults || []), ...(customs || [])]);

export const ensureCompanySettings = (companyId) => {
	db.prepare('INSERT OR IGNORE INTO company_settings (company_id) VALUES (?)').run(companyId);
};

export const getCompanySettingsRow = (companyId) => {
	ensureCompanySettings(companyId);
	return db.prepare('SELECT * FROM company_settings WHERE company_id = ?').get(companyId);
};

export const getMasterOptions = (companyId) => {
	const row = getCompanySettingsRow(companyId);

	const customExpenseSources = parseArray(row?.custom_expense_sources_json);
	const customCreditSources = parseArray(row?.custom_credit_sources_json);
	const customEntityTypes = parseArray(row?.custom_entity_types_json);
	const customPropertyTypes = parseArray(row?.custom_property_types_json);

	return {
		expense_sources: mergeLists(EXPENSE_SOURCE, customExpenseSources),
		credit_sources: mergeLists(CREDIT_SOURCE, customCreditSources),
		entity_types: mergeLists(ENTITY_TYPES, customEntityTypes),
		property_types: mergeLists(PROPERTY_TYPES, customPropertyTypes),
		custom_expense_sources: normalizeTextList(customExpenseSources),
		custom_credit_sources: normalizeTextList(customCreditSources),
		custom_entity_types: normalizeTextList(customEntityTypes),
		custom_property_types: normalizeTextList(customPropertyTypes)
	};
};

export const setCustomMasterOptions = (
	companyId,
	{ custom_expense_sources, custom_credit_sources, custom_entity_types, custom_property_types }
) => {
	ensureCompanySettings(companyId);
	db.prepare(
		`UPDATE company_settings
		 SET custom_expense_sources_json = ?,
			 custom_credit_sources_json = ?,
			 custom_entity_types_json = ?,
			 custom_property_types_json = ?
		 WHERE company_id = ?`
	).run(
		JSON.stringify(normalizeTextList(custom_expense_sources)),
		JSON.stringify(normalizeTextList(custom_credit_sources)),
		JSON.stringify(normalizeTextList(custom_entity_types)),
		JSON.stringify(normalizeTextList(custom_property_types)),
		companyId
	);

	return getMasterOptions(companyId);
};

export const getEntityCode = (entityType) => {
	const normalized = String(entityType || '').trim();
	if (!normalized) return 'OTH';
	if (ENTITIES[normalized]) return ENTITIES[normalized];

	const words = normalized
		.toUpperCase()
		.split(/[^A-Z0-9]+/)
		.filter(Boolean);
	if (words.length === 0) return 'OTH';

	const compact = words.map((word) => word[0]).join('').slice(0, 3);
	return compact.padEnd(3, 'X');
};
