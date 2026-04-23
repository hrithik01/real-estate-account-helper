// @ts-nocheck
import db from '$lib/server/db.js';
import { json } from '@sveltejs/kit';

const parseJson = (value, fallback) => {
	if (!value) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};

const normalizeItems = (items) =>
	Array.isArray(items)
		? items
				.map((item) => ({
					text: String(item?.text || '').trim(),
					done: Boolean(item?.done)
				}))
				.filter((item) => item.text.length > 0)
		: [];

export const GET = () => {
	const row = db.prepare('SELECT todos_json, coming_income_json, coming_expenses_json FROM settings WHERE id = 1').get();
	const todos = parseJson(row?.todos_json, []);
	const comingIncome = parseJson(row?.coming_income_json, []);
	const comingExpenses = parseJson(row?.coming_expenses_json, []);
	return json({
		todos: normalizeItems(todos),
		coming_income: normalizeItems(comingIncome),
		coming_expenses: normalizeItems(comingExpenses)
	});
};

export const PUT = async ({ request }) => {
	const { todos, coming_income, coming_expenses } = await request.json();
	const normalizedTodos = normalizeItems(todos);
	const normalizedIncome = normalizeItems(coming_income);
	const normalizedExpenses = normalizeItems(coming_expenses);

	db.prepare(
		'UPDATE settings SET todos_json = ?, coming_income_json = ?, coming_expenses_json = ? WHERE id = 1'
	).run(JSON.stringify(normalizedTodos), JSON.stringify(normalizedIncome), JSON.stringify(normalizedExpenses));

	return json({ success: true });
};
