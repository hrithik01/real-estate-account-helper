// @ts-nocheck
import { error } from '@sveltejs/kit';
import { PAYOUT_TYPES } from '$lib/constants.js';
import { ownsRow, parseId, text } from '$lib/server/company.js';

export const FINANCE_SELECT = `
	SELECT f.*, e.name AS entity_name, e.entity_code
	FROM finance_entries f
	LEFT JOIN entities e ON e.id = f.entity_id`;

/** Validates a finance payload and returns its column values in table order. */
export const readFinanceEntry = (body, companyId, existingType = 'finance_taken') => {
	const date = text(body.date);
	const parsedDate = new Date(`${date}T00:00:00Z`);
	const entity_id = parseId(body.entity_id);
	const amount = Number(body.amount);
	const entry_type = body.entry_type ?? existingType;

	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(+parsedDate) || parsedDate.toISOString().slice(0, 10) !== date) error(400, 'A valid date is required.');
	if (!entity_id || !ownsRow('entities', entity_id, companyId)) error(400, 'Select a valid entity.');
	if (!['finance_taken', 'payout'].includes(entry_type)) error(400, 'Invalid finance entry type.');
	const paise = Math.round(amount * 100);
	if (!Number.isSafeInteger(paise) || paise <= 0 || Math.abs(paise / 100 - amount) > 0.000001) error(400, 'Enter a positive amount with at most two decimal places.');
	const comments = text(body.comments) || null;
	if (entry_type === 'payout') return [date, entity_id, paise / 100, entry_type, 0, 'monthly', comments];

	const interest_rate = body.interest_rate === '' || body.interest_rate == null ? 1.5 : Number(body.interest_rate);
	const interest_payout = text(body.interest_payout || 'monthly');
	if (!Number.isFinite(interest_rate) || interest_rate < 0) error(400, 'Interest rate must be 0 or greater.');
	if (!PAYOUT_TYPES.some((payout) => payout.value === interest_payout)) error(400, 'Invalid interest payout cycle.');

	return [date, entity_id, paise / 100, entry_type, interest_rate, interest_payout, comments];
};
