// @ts-nocheck
import { error } from '@sveltejs/kit';
import { getMasterOptions } from '$lib/server/master-options.js';
import { ownsRow, parseId, text } from '$lib/server/company.js';

/** Validates a project payload and returns its column values in table order. */
export const readProject = (body, companyId, existingType = null) => {
	const property_name = text(body.property_name);
	const property_location = text(body.property_location);
	const property_type = text(body.property_type);
	const ownerId = body.current_registered_owner_entity_id ? parseId(body.current_registered_owner_entity_id) : null;

	if (!property_name || !property_location) error(400, 'Property name and location are required.');
	// A type removed from the custom list stays valid for projects that already use it.
	const keepsType = existingType !== null && existingType === property_type;
	if (!keepsType && !getMasterOptions(companyId).property_types.includes(property_type)) {
		error(400, 'Valid property type is required.');
	}
	if (body.current_registered_owner_entity_id && !(ownerId && ownsRow('entities', ownerId, companyId))) {
		error(400, 'Invalid current registered owner.');
	}

	return [
		property_name,
		property_location,
		property_type,
		ownerId,
		text(body.official_record) || null,
		text(body.comments) || null
	];
};
