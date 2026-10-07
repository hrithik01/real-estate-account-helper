// @ts-nocheck
import db from '$lib/server/db.js';
import { error, json } from '@sveltejs/kit';
import { parseId, readJson, requireCompanyId } from '$lib/server/company.js';
import { readProject } from '$lib/server/projects.js';

export const PUT = async ({ params, request, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const existing = db.prepare('SELECT property_type FROM projects WHERE id = ? AND company_id = ?').get(id, companyId);
	if (!existing) error(404, 'Project not found.');
	const values = readProject(await readJson(request), companyId, existing.property_type);
	const result = db
		.prepare(
			'UPDATE projects SET property_name = ?, property_location = ?, property_type = ?, current_registered_owner_entity_id = ?, official_record = ?, comments = ? WHERE id = ? AND company_id = ?'
		)
		.run(...values, id, companyId);
	if (result.changes === 0) error(404, 'Project not found.');
	return json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
};

export const DELETE = ({ params, locals }) => {
	const companyId = requireCompanyId(locals);
	const id = parseId(params.id) ?? error(400, 'Invalid id.');
	const result = db.prepare('DELETE FROM projects WHERE id = ? AND company_id = ?').run(id, companyId);
	if (result.changes === 0) error(404, 'Project not found.');
	return json({ success: true });
};
