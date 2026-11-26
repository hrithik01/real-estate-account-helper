// @ts-nocheck
import db from '$lib/server/db.js';
import { ALL_PROJECT_ENTITY_TYPES } from '$lib/constants.js';
import { normalizeIdList, ownsAll } from '$lib/server/company.js';

export const normalizeProjectIds = (value) => normalizeIdList(Array.isArray(value) ? value : []);

export const validateProjectIds = (projectIds, companyId) => ownsAll('projects', projectIds, companyId);

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

const hydrateEntities = (rows, companyId) => {
	const manualRows = rows.filter((row) => !ALL_PROJECT_ENTITY_TYPES.includes(row.entity_type));
	const projectRows = getEntityProjectRows(manualRows.map((row) => row.id));
	const companyProjects = manualRows.length < rows.length
		? db.prepare('SELECT id, property_name FROM projects WHERE company_id = ? ORDER BY property_name ASC').all(companyId)
		: [];
	const allProjects = {
		project_ids: companyProjects.map((project) => project.id),
		project_names: companyProjects.map((project) => project.property_name)
	};
	const entityProjects = new Map();

	for (const row of projectRows) {
		const current = entityProjects.get(row.entity_id) || [];
		current.push({ id: row.project_id, property_name: row.property_name });
		entityProjects.set(row.entity_id, current);
	}

	return rows.map((row) => {
		if (ALL_PROJECT_ENTITY_TYPES.includes(row.entity_type)) {
			return { ...row, all_projects: true, ...allProjects };
		}
		const attachedProjects = entityProjects.get(row.id) || [];
		return {
			...row,
			all_projects: false,
			project_ids: attachedProjects.map((project) => project.id),
			project_names: attachedProjects.map((project) => project.property_name)
		};
	});
};

export const listEntities = (companyId) => {
	const rows = db
		.prepare(
			`SELECT e.*,
				(SELECT COUNT(*) FROM income i WHERE i.entity_id = e.id) +
				(SELECT COUNT(*) FROM expenses x WHERE x.entity_id = e.id) AS transaction_count
			 FROM entities e
			 WHERE e.company_id = ?
			 ORDER BY e.name COLLATE NOCASE ASC`
		)
		.all(companyId);
	return hydrateEntities(rows, companyId);
};

export const getEntityById = (id, companyId) => {
	const row = db.prepare('SELECT * FROM entities WHERE id = ? AND company_id = ?').get(id, companyId);
	if (!row) return null;
	return hydrateEntities([row], companyId)[0] || null;
};
