// @ts-nocheck
import { writable } from 'svelte/store';

export const confirmState = writable(null);

/**
 * Promise-based confirmation dialog.
 * @returns {Promise<boolean>}
 */
export const confirmDialog = ({ title, message = '', confirmLabel = 'Delete', danger = true }) =>
	new Promise((resolve) => {
		confirmState.set({ title, message, confirmLabel, danger, resolve });
	});
