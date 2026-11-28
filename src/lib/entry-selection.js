import { writable } from 'svelte/store';

/**
 * Track checked entries for one ledger, keeping only rows in its current view.
 * @template {{ id: number, amount: number }} Entry
 * @param {(row: Entry) => number} [getAmount]
 */
export function createEntrySelection(getAmount = (row) => row.amount) {
	/** @type {Entry[]} */
	let visibleRows = [];
	/** @type {{ active: boolean, ids: Set<number>, total: number }} */
	const empty = { active: false, ids: new Set(), total: 0 };
	const { subscribe, set, update } = writable(empty);

	/** @param {Set<number>} checked */
	const summarize = (checked) => {
		/** @type {Set<number>} */
		const ids = new Set();
		let total = 0;
		for (const row of visibleRows) {
			if (!checked.has(row.id)) continue;
			ids.add(row.id);
			total += getAmount(row);
		}
		return { active: true, ids, total };
	};

	return {
		subscribe,
		/** @param {Entry[]} rows */
		setRows(rows) {
			visibleRows = rows;
			update((selection) => selection.active ? summarize(selection.ids) : selection);
		},
		selectAll(checked = true) {
			set(summarize(new Set(checked ? visibleRows.map((row) => row.id) : [])));
		},
		/**
		 * @param {number} id
		 * @param {boolean} checked
		 */
		setChecked(id, checked) {
			update((selection) => {
				if (!selection.active) return selection;
				const ids = new Set(selection.ids);
				if (checked) ids.add(id);
				else ids.delete(id);
				return summarize(ids);
			});
		},
		close() {
			set(empty);
		}
	};
}
