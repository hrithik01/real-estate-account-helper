// @ts-nocheck
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const formatINR = (value) => {
	const number = Number(value || 0);
	return Number.isInteger(number) ? inrWhole.format(number) : inr.format(number);
};

/** Compact Indian notation: ₹1.25 Cr, ₹4.5 L, ₹12.3 K. */
export const formatCompact = (value) => {
	const number = Number(value || 0);
	const abs = Math.abs(number);
	const sign = number < 0 ? '-' : '';
	if (abs >= 1e7) return `${sign}₹${plain.format(+(abs / 1e7).toFixed(2))} Cr`;
	if (abs >= 1e5) return `${sign}₹${plain.format(+(abs / 1e5).toFixed(2))} L`;
	if (abs >= 1e3) return `${sign}₹${plain.format(+(abs / 1e3).toFixed(1))} K`;
	return `${sign}₹${plain.format(abs)}`;
};

export const formatNumber = (value) => plain.format(Number(value || 0));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "07 Oct 2026" for ISO dates; passes anything else through. */
export const formatDate = (value) => {
	const raw = String(value || '').slice(0, 10);
	const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return value || '—';
	return `${match[3]} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
};

export const formatShortDate = (value) => {
	const raw = String(value || '').slice(0, 10);
	const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return value || '—';
	return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
};

export const formatMonth = (key) => {
	const [year, month] = String(key).split('-');
	return `${MONTHS[Number(month) - 1]} ${year.slice(2)}`;
};

/** Created-at timestamps are stored in UTC by SQLite. */
export const formatTimestamp = (value) => {
	if (!value) return '—';
	const date = new Date(`${String(value).replace(' ', 'T')}Z`);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** "material-bill" / "SERVICE_mason" -> "Material bill" / "Service mason". */
export const labelize = (value) => {
	const text = String(value ?? '').replace(/[_-]+/g, ' ').trim();
	if (!text) return '—';
	const lower = text === text.toUpperCase() ? text.toLowerCase() : text;
	return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export const todayIso = () => {
	const now = new Date();
	const offset = now.getTimezoneOffset() * 60000;
	return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

export const toIsoDate = (date) => {
	const offset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

/** Indian-system words for an amount, e.g. "1.5 lakh". Used as an entry hint. */
export const amountInWords = (value) => {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) return '';
	if (number >= 1e7) return `${plain.format(+(number / 1e7).toFixed(4))} crore`;
	if (number >= 1e5) return `${plain.format(+(number / 1e5).toFixed(4))} lakh`;
	if (number >= 1e3) return `${plain.format(+(number / 1e3).toFixed(3))} thousand`;
	return '';
};

export const initials = (name) =>
	String(name || '')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0].toUpperCase())
		.join('') || '?';

export const plural = (count, word, pluralWord = `${word}s`) =>
	`${Number(count || 0).toLocaleString('en-IN')} ${Number(count) === 1 ? word : pluralWord}`;
