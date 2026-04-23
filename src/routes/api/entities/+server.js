// @ts-nocheck
import db from '$lib/server/db.js';
import {
	getEntityById,
	listEntities,
	normalizeProjectIds,
	replaceEntityProjects,
	validateProjectIds
} from '$lib/server/entities.js';
import { getEntityCode, getMasterOptions } from '$lib/server/master-options.js';
import { json } from '@sveltejs/kit';

export const GET = () => {
	return json(listEntities());
};

export const POST = async ({ request }) => {
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
		const insertResult = db
			.prepare('INSERT INTO entities (name, entity_type, entity_code, comments) VALUES (?, ?, ?, ?)')
			.run(name, entity_type, entity_code, comments || null);
		replaceEntityProjects(Number(insertResult.lastInsertRowid), projectIds);
		return insertResult;
	})();

	const created = getEntityById(Number(result.lastInsertRowid));
	return json(created, { status: 201 });
};
