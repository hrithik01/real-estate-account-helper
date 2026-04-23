// @ts-nocheck
import db from '$lib/server/db.js';

export const normalizeProjectIds = (value) => {
	if (!Array.isArray(value)) return [];

	const uniqueIds = new Set();
	for (const item of value) {
		const id = Number(item);
		if (Number.isInteger(id) && id > 0) {
			uniqueIds.add(id);
		}
	}

	return Array.from(uniqueIds);
};

export const validateProjectIds = (projectIds) => {
	if (projectIds.length === 0) return true;

	const placeholders = projectIds.map(() => '?').join(', ');
	const rows = db
		.prepare(`SELECT id FROM projects WHERE id IN (${placeholders})`)
		.all(...projectIds);

	return rows.length === projectIds.length;
};

export const replaceEntityProjects = (entityId, projectIds) => {
	db.prepare('DELETE FROM entity_projects WHERE entity_id = ?').run(entityId);

	if (projectIds.length === 0) return;

	const insert = db.prepare('INSERT INTO entity_projects (entity_id, project_id) VALUES (?, ?)');
	for (const projectId of projectIds) {
		insert.run(entityId, projectId);
	}
};

const getEntityProjectRows = (entityIds) => {
	if (entityIds.length === 0) return [];

	const placeholders = entityIds.map(() => '?').join(', ');
	return db
		.prepare(
			`SELECT ep.entity_id, p.id AS project_id, p.property_name
			 FROM entity_projects ep
			 JOIN projects p ON p.id = ep.project_id
			 WHERE ep.entity_id IN (${placeholders})
			 ORDER BY p.property_name ASC`
		)
		.all(...entityIds);
};

const hydrateEntities = (rows) => {
	const projectRows = getEntityProjectRows(rows.map((row) => row.id));
	const entityProjects = new Map();

	for (const row of projectRows) {
		const current = entityProjects.get(row.entity_id) || [];
		current.push({ id: row.project_id, property_name: row.property_name });
		entityProjects.set(row.entity_id, current);
	}

	return rows.map((row) => {
		const attachedProjects = entityProjects.get(row.id) || [];
		return {
			...row,
			project_ids: attachedProjects.map((project) => project.id),
			project_names: attachedProjects.map((project) => project.property_name)
		};
	});
};

export const listEntities = () => {
	const rows = db.prepare('SELECT * FROM entities ORDER BY name ASC').all();
	return hydrateEntities(rows);
};

export const getEntityById = (id) => {
	const row = db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
	if (!row) return null;
	return hydrateEntities([row])[0] || null;
};