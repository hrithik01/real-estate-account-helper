import db from '$lib/server/db.js';
import { getMasterOptions } from '$lib/server/master-options.js';
import { json } from '@sveltejs/kit';

export const GET = () => {
	const rows = db
		.prepare(
			`SELECT p.*, e.name as current_registered_owner_name
			 FROM projects p
			 LEFT JOIN entities e ON e.id = p.current_registered_owner_entity_id
			 ORDER BY p.property_name ASC`
		)
		.all();
	return json(rows);
};

export const POST = async ({ request }) => {
	const body = await request.json();
	const property_name = String(body.property_name || '').trim();
	const property_location = String(body.property_location || '').trim();
	const property_type = String(body.property_type || '').trim();
	const current_registered_owner_entity_id = body.current_registered_owner_entity_id
		? Number(body.current_registered_owner_entity_id)
		: null;
	const official_record = String(body.official_record || '').trim();
	const comments = String(body.comments || '').trim();

	if (!property_name || !property_location) {
		return json({ error: 'Property name and location are required.' }, { status: 400 });
	}
	const { property_types } = getMasterOptions();
	if (!property_types.includes(property_type)) {
		return json({ error: 'Valid property type is required.' }, { status: 400 });
	}
	if (
		current_registered_owner_entity_id !== null &&
		(!Number.isInteger(current_registered_owner_entity_id) || current_registered_owner_entity_id <= 0)
	) {
		return json({ error: 'Invalid current registered owner.' }, { status: 400 });
	}

	const result = db
		.prepare(
			'INSERT INTO projects (property_name, property_location, property_type, current_registered_owner_entity_id, official_record, comments) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(
			property_name,
			property_location,
			property_type,
			current_registered_owner_entity_id,
			official_record || null,
			comments || null
		);

	const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
	return json(created, { status: 201 });
};
