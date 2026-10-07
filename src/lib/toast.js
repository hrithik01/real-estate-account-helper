// @ts-nocheck
import { writable } from 'svelte/store';

export const toasts = writable([]);
let nextId = 1;

const push = (type, message, timeout = 3500) => {
	const id = nextId++;
	toasts.update((items) => [...items.slice(-3), { id, type, message }]);
	if (timeout) setTimeout(() => dismissToast(id), timeout);
};

export const dismissToast = (id) => toasts.update((items) => items.filter((item) => item.id !== id));

export const toast = {
	success: (message) => push('success', message),
	error: (message) => push('error', message, 6000),
	info: (message) => push('info', message)
};
