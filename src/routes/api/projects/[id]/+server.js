import db from '$lib/server/db.js';
import { getMasterOptions } from '$lib/server/master-options.js';
import { json } from '@sveltejs/kit';

export const PUT = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid id.' }, { status: 400 });

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
			'UPDATE projects SET property_name = ?, property_location = ?, property_type = ?, current_registered_owner_entity_id = ?, official_record = ?, comments = ? WHERE id = ?'
		)
		.run(
			property_name,
			property_location,
			property_type,
			current_registered_owner_entity_id,
			official_record || null,
			comments || null,
			id
		);

	if (result.changes === 0) return json({ error: 'Project not found.' }, { status: 404 });
	return json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
};

export const DELETE = ({ params }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'Invalid id.' }, { status: 400 });

	const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
	if (result.changes === 0) return json({ error: 'Project not found.' }, { status: 404 });
	return json({ success: true });
};
