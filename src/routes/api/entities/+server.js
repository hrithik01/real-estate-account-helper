// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { readJson, requireCompanyId, text } from '$lib/server/company.js';
import {
	getEntityById,
	listEntities,
	normalizeProjectIds,
	replaceEntityProjects,
	validateProjectIds
} from '$lib/server/entities.js';
import { getEntityCode, getMasterOptions } from '$lib/server/master-options.js';

export const GET = ({ locals }) => json(listEntities(requireCompanyId(locals)));

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const body = await readJson(request);
	const name = text(body.name);
	const entity_type = text(body.entity_type);
	const projectIds = normalizeProjectIds(body.project_ids);

	if (!name) error(400, 'Entity name is required.');
	if (!getMasterOptions(companyId).entity_types.includes(entity_type)) error(400, 'Valid entity type is required.');
	if (!validateProjectIds(projectIds, companyId)) error(400, 'One or more attached projects are invalid.');

	const id = db.transaction(() => {
		const result = db
			.prepare('INSERT INTO entities (company_id, name, entity_type, entity_code, comments) VALUES (?, ?, ?, ?, ?)')
			.run(companyId, name, entity_type, getEntityCode(entity_type), text(body.comments) || null);
		replaceEntityProjects(Number(result.lastInsertRowid), projectIds);
		return Number(result.lastInsertRowid);
	})();

	return json(getEntityById(id, companyId), { status: 201 });
};
