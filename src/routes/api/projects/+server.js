// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';
import { readJson, requireCompanyId } from '$lib/server/company.js';
import { readProject } from '$lib/server/projects.js';

export const GET = ({ locals }) => {
	const companyId = requireCompanyId(locals);
	const rows = db
		.prepare(
			`SELECT p.*, e.name AS current_registered_owner_name,
				(SELECT COUNT(*) FROM income_projects ip WHERE ip.project_id = p.id) +
				(SELECT COUNT(*) FROM expense_projects ep WHERE ep.project_id = p.id) AS transaction_count
			 FROM projects p
			 LEFT JOIN entities e ON e.id = p.current_registered_owner_entity_id AND e.company_id = p.company_id
			 WHERE p.company_id = ?
			 ORDER BY p.property_name COLLATE NOCASE ASC`
		)
		.all(companyId);
	return json(rows);
};

export const POST = async ({ request, locals }) => {
	const companyId = requireCompanyId(locals);
	const values = readProject(await readJson(request), companyId);
	const result = db
		.prepare(
			'INSERT INTO projects (company_id, property_name, property_location, property_type, current_registered_owner_entity_id, official_record, comments) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(companyId, ...values);
	return json(db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid), { status: 201 });
};
