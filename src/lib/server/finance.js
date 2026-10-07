// @ts-nocheck
import { error } from '@sveltejs/kit';
import { PAYOUT_TYPES } from '$lib/constants.js';
import { ownsRow, parseId, text } from '$lib/server/company.js';

export const FINANCE_SELECT = `
	SELECT f.*, e.name AS entity_name, e.entity_code
	FROM finance_entries f
	LEFT JOIN entities e ON e.id = f.entity_id`;

/** Validates a finance payload and returns its column values in table order. */
export const readFinanceEntry = (body, companyId) => {
	const date = text(body.date);
	const entity_id = parseId(body.entity_id);
	const amount = Number(body.amount);
	const interest_rate = body.interest_rate === '' || body.interest_rate == null ? 1.5 : Number(body.interest_rate);
	const interest_payout = text(body.interest_payout || 'monthly');

	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) error(400, 'A valid date is required.');
	if (!entity_id || !ownsRow('entities', entity_id, companyId)) error(400, 'Select a valid entity.');
	if (!Number.isFinite(amount) || amount <= 0) error(400, 'Amount must be greater than 0.');
	if (!Number.isFinite(interest_rate) || interest_rate < 0) error(400, 'Interest rate must be 0 or greater.');
	if (!PAYOUT_TYPES.some((payout) => payout.value === interest_payout)) error(400, 'Invalid interest payout cycle.');

	return [date, entity_id, amount, interest_rate, interest_payout, text(body.comments) || null];
};
