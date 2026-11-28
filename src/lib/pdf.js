// @ts-nocheck

const asCell = (value, style = {}) => ({ text: String(value ?? ''), ...style });

const tableLayout = {
	hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0 : 0.5),
	vLineWidth: () => 0,
	hLineColor: () => '#d0d5dd',
	fillColor: (index, node) => {
		if (index === 0) return '#e9eef6';
		if (node.table.body[index][0].bold) return '#f2f4f7';
		return index % 2 === 0 ? '#f8fafc' : null;
	},
	paddingLeft: () => 6,
	paddingRight: () => 6,
	paddingTop: () => 5,
	paddingBottom: () => 5
};

const sectionContent = ({ title, columns, rows, totals = [] }) => {
	const cells = (row, bold = false) => columns.map((column) => asCell(column.value(row), {
		alignment: column.numeric ? 'right' : 'left',
		color: column.color?.(row) || '#101828',
		bold
	}));
	return [
		...(title ? [{ text: title, style: 'section' }] : []),
		rows.length || totals.length
			? {
					layout: tableLayout,
					table: {
						headerRows: 1,
						keepWithHeaderRows: 1,
						widths: columns.map((column) => column.width ?? '*'),
						body: [
							columns.map((column) => asCell(column.label, { alignment: column.numeric ? 'right' : 'left', bold: true })),
							...rows.map((row) => cells(row)),
							...totals.map((row) => cells(row, true))
						]
					}
				}
			: { text: 'No entries', style: 'detail' }
	];
};

export const pdfMoneyColor = (isCredit) => (isCredit ? '#067647' : '#b42318');

export const createTablePdf = async ({ title, subtitle, details = [], landscape, sections }) => {
	const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
		import('pdfmake/build/pdfmake.js'),
		import('pdfmake/build/vfs_fonts.js')
	]);
	pdfMake.addVirtualFileSystem(fonts);
	return pdfMake.createPdf({
		pageSize: 'A4',
		pageOrientation: landscape ? 'landscape' : 'portrait',
		pageMargins: [32, 34, 32, 38],
		info: { title },
		defaultStyle: { fontSize: 9, color: '#101828' },
		background: (_page, size) => ({
			canvas: [{ type: 'rect', x: 0, y: 0, w: size.width, h: size.height, color: '#ffffff' }]
		}),
		styles: {
			title: { fontSize: 20, bold: true, margin: [0, 0, 0, 5] },
			detail: { fontSize: 9, color: '#475467', margin: [0, 0, 0, 4] },
			section: { fontSize: 12, bold: true, margin: [0, 14, 0, 6] }
		},
		footer: (page, pages) => ({
			text: `Page ${page} of ${pages}`, alignment: 'right', fontSize: 8, color: '#475467', margin: [32, 12, 32, 0]
		}),
		content: [
			{ text: title, style: 'title' },
			...[subtitle, ...details].filter(Boolean).map((text) => ({ text, style: 'detail' })),
			...sections.flatMap(sectionContent)
		]
	});
};

export const downloadTablePdf = async (filename, options) => {
	const pdf = await createTablePdf(options);
	await pdf.download(filename);
};
