// @ts-nocheck
let activeCompanyId = null;

/** Called by the layout so every write is tagged with the company the page was rendered for. */
export const setActiveCompanyId = (id) => {
	activeCompanyId = id ?? null;
};

/**
 * JSON fetch helper. Resolves with the parsed body, rejects with an Error whose
 * message is the server's explanation.
 */
export const api = async (path, { method = 'GET', body, signal } = {}) => {
	const headers = {};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	if (activeCompanyId && method !== 'GET') headers['x-company-id'] = String(activeCompanyId);

	const res = await fetch(path, {
		method,
		headers,
		signal,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const payload = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(payload?.message || payload?.error || `Request failed (${res.status}).`);
	}
	return payload;
};

/** Localstorage helpers that never throw (private mode, blocked storage). */
export const storage = {
	get(key, fallback = '') {
		try {
			return localStorage.getItem(key) ?? fallback;
		} catch {
			return fallback;
		}
	},
	set(key, value) {
		try {
			if (value === '' || value == null) localStorage.removeItem(key);
			else localStorage.setItem(key, String(value));
		} catch {
			/* ignore */
		}
	}
};

export const companyKey = (name) => `ledger:${activeCompanyId ?? 'none'}:${name}`;
