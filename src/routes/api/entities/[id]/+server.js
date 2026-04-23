// @ts-nocheck
import db from '$lib/server/db.js';
import {
	getEntityById,
	normalizeProjectIds,
	replaceEntityProjects,
	validateProjectIds
} from '$lib/server/entities.js';
import { getEntityCode, getMasterOptions } from '$lib/server/master-options.js';
import { json } from '@sveltejs/kit';

export const PUT = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid id.' }, { status: 400 });

	const body = await request.json();
	const name = String(body.name || '').trim();
	const entity_type = String(body.entity_type || '').trim();
	const comments = String(body.comments || '').trim();
	const projectIds = normalizeProjectIds(body.project_ids);

	if (!name) {
		return json({ error: 'Entity name is required.' }, { status: 400 });
	}
	const { entity_types } = getMasterOptions();
	if (!entity_types.includes(entity_type)) {
		return json({ error: 'Valid entity type is required.' }, { status: 400 });
	}
	if (!validateProjectIds(projectIds)) {
		return json({ error: 'One or more attached projects are invalid.' }, { status: 400 });
	}

	const entity_code = getEntityCode(entity_type);
	const result = db.transaction(() => {
		const updateResult = db
			.prepare('UPDATE entities SET name = ?, entity_type = ?, entity_code = ?, comments = ? WHERE id = ?')
			.run(name, entity_type, entity_code, comments || null, id);

		if (updateResult.changes === 0) {
			return updateResult;
		}

		replaceEntityProjects(id, projectIds);
		return updateResult;
	})();

	if (result.changes === 0) return json({ error: 'Entity not found.' }, { status: 404 });
	return json(getEntityById(id));
};

export const DELETE = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid id.' }, { status: 400 });

	const result = db.prepare('DELETE FROM entities WHERE id = ?').run(id);
	if (result.changes === 0) return json({ error: 'Entity not found.' }, { status: 404 });
	return json({ success: true });
};
