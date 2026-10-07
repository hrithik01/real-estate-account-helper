// @ts-nocheck
const escape = (value) => {
	const text = value == null ? '' : String(value);
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Downloads rows as a CSV file. `columns` is [{ label, value: (row) => any }]. */
export const downloadCsv = (filename, columns, rows) => {
	const lines = [columns.map((column) => escape(column.label)).join(',')];
	for (const row of rows) lines.push(columns.map((column) => escape(column.value(row))).join(','));
	const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const slug = (value) =>
	String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
