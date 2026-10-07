// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId, text } from '$lib/server/company.js';
import {
	getEntityById,
	normalizeProjectIds,
	replaceEntityProjects,
	validateProjectIds
} from '$lib/server/entities.js';
import { getEntityCode, getMasterOptions } from '$lib/server/master-options.js';

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const body = await readJson(request);
	const name = text(body.name);
	const entity_type = text(body.entity_type);
	const projectIds = normalizeProjectIds(body.project_ids);

	if (!name) error(400, 'Entity name is required.');
	const existing = db.prepare('SELECT entity_type FROM entities WHERE id = ? AND company_id = ?').get(id, companyId);
	if (!existing) error(404, 'Entity not found.');
	// A type removed from the custom list stays valid for records that already use it.
	const keepsType = existing.entity_type === entity_type;
	if (!keepsType && !getMasterOptions(companyId).entity_types.includes(entity_type)) error(400, 'Valid entity type is required.');
	if (!validateProjectIds(projectIds, companyId)) error(400, 'One or more attached projects are invalid.');

	const changes = db.transaction(() => {
		const result = db
			.prepare('UPDATE entities SET name = ?, entity_type = ?, entity_code = ?, comments = ? WHERE id = ? AND company_id = ?')
			.run(name, entity_type, getEntityCode(entity_type), text(body.comments) || null, id, companyId);
		if (result.changes > 0) replaceEntityProjects(id, projectIds);
		return result.changes;
	})();

	if (changes === 0) error(404, 'Entity not found.');
	return json(getEntityById(id, companyId));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const result = db.prepare('DELETE FROM entities WHERE id = ? AND company_id = ?').run(id, companyId);
	if (result.changes === 0) error(404, 'Entity not found.');
	return json({ success: true });
};
