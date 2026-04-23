// @ts-nocheck
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve('data');
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ledger.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = `
CREATE TABLE IF NOT EXISTS settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	master_shree_start REAL NOT NULL DEFAULT 0,
	master_pkb_start REAL NOT NULL DEFAULT 0,
	master_hkj_start REAL NOT NULL DEFAULT 0,
	custom_expense_sources_json TEXT NOT NULL DEFAULT '[]',
	custom_credit_sources_json TEXT NOT NULL DEFAULT '[]',
	custom_entity_types_json TEXT NOT NULL DEFAULT '[]',
	custom_property_types_json TEXT NOT NULL DEFAULT '[]',
	todos_json TEXT NOT NULL DEFAULT '[]',
	coming_income_json TEXT NOT NULL DEFAULT '[]',
	coming_expenses_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS accounts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	bank_name TEXT NOT NULL,
	account_number TEXT,
	account_holder TEXT NOT NULL,
	account_balance REAL NOT NULL DEFAULT 0,
	comments TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	property_name TEXT NOT NULL,
	property_location TEXT NOT NULL,
	property_type TEXT NOT NULL CHECK (property_type IN ('land', 'house', 'housing-project', 'plotting-project')),
	current_registered_owner_entity_id INTEGER,
	official_record TEXT,
	comments TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entities (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	entity_type TEXT NOT NULL,
	entity_code TEXT NOT NULL,
	comments TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_projects (
	entity_id INTEGER NOT NULL,
	project_id INTEGER NOT NULL,
	PRIMARY KEY (entity_id, project_id),
	FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS income (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	date TEXT NOT NULL,
	amount REAL NOT NULL,
	entity_id INTEGER,
	project_id INTEGER,
	account_id INTEGER,
	payment_mode TEXT NOT NULL DEFAULT 'cash',
	credit_source TEXT NOT NULL DEFAULT 'other',
	master_owner TEXT NOT NULL DEFAULT 'SHREE' CHECK (master_owner IN ('SHREE', 'PKB', 'HKJ')),
	comments TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
	FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS expenses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	date TEXT NOT NULL,
	amount REAL NOT NULL,
	entity_id INTEGER,
	project_id INTEGER,
	account_id INTEGER,
	payment_mode TEXT NOT NULL DEFAULT 'cash',
	expense_source TEXT NOT NULL DEFAULT 'other',
	material_type TEXT,
	service_type TEXT,
	utility_type TEXT,
	master_owner TEXT NOT NULL DEFAULT 'SHREE' CHECK (master_owner IN ('SHREE', 'PKB', 'HKJ')),
	comments TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
	FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS income_projects (
	income_id INTEGER NOT NULL,
	project_id INTEGER NOT NULL,
	PRIMARY KEY (income_id, project_id),
	FOREIGN KEY (income_id) REFERENCES income(id) ON DELETE CASCADE,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_projects (
	expense_id INTEGER NOT NULL,
	project_id INTEGER NOT NULL,
	PRIMARY KEY (expense_id, project_id),
	FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS finance_entries (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	date TEXT NOT NULL,
	entity_id INTEGER,
	amount REAL NOT NULL,
	interest_rate REAL NOT NULL DEFAULT 1.5,
	interest_payout TEXT NOT NULL DEFAULT 'monthly' CHECK (interest_payout IN ('monthly', 'quarterly', 'half-yearly', 'annually')),
	comments TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
);
`;

db.exec(schema);

db.exec(`
CREATE INDEX IF NOT EXISTS idx_income_date ON income(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_income_entity_id ON income(entity_id);
CREATE INDEX IF NOT EXISTS idx_expenses_entity_id ON expenses(entity_id);
CREATE INDEX IF NOT EXISTS idx_finance_date ON finance_entries(date);
CREATE INDEX IF NOT EXISTS idx_finance_entity_id ON finance_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_projects_project_id ON entity_projects(project_id);
`);

const ensureColumn = (tableName, columnName, definition) => {
	const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
	const exists = columns.some((column) => column.name === columnName);
	if (!exists) {
		db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
	}
};

ensureColumn('accounts', 'comments', 'TEXT');
ensureColumn('projects', 'comments', 'TEXT');
ensureColumn('projects', 'current_registered_owner_entity_id', 'INTEGER');
ensureColumn('projects', 'official_record', 'TEXT');
ensureColumn('entities', 'comments', 'TEXT');
ensureColumn('settings', 'custom_expense_sources_json', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('settings', 'custom_credit_sources_json', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('settings', 'custom_entity_types_json', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('settings', 'custom_property_types_json', "TEXT NOT NULL DEFAULT '[]'");

db.exec(
	`INSERT OR IGNORE INTO income_projects (income_id, project_id)
	 SELECT id, project_id FROM income WHERE project_id IS NOT NULL`
);
db.exec(
	`INSERT OR IGNORE INTO expense_projects (expense_id, project_id)
	 SELECT id, project_id FROM expenses WHERE project_id IS NOT NULL`
);

db.prepare(
	`INSERT OR IGNORE INTO settings (
		id,
		master_shree_start,
		master_pkb_start,
		master_hkj_start,
		custom_expense_sources_json,
		custom_credit_sources_json,
		custom_entity_types_json,
		custom_property_types_json,
		todos_json,
		coming_income_json,
		coming_expenses_json
	)
	VALUES (1, 0, 0, 0, '[]', '[]', '[]', '[]', '[]', '[]', '[]')`
).run();

const seedAccounts = [
	{ bank_name: 'PNB', account_holder: 'Balaji Constructions account' },
	{ bank_name: 'PNB', account_holder: 'VH buildcom account' },
	{ bank_name: 'PNB', account_holder: 'Neela Bhatt account' },
	{ bank_name: 'PNB', account_holder: 'Vasanti joshi account' }
];

const seedProjects = [
	{ property_name: 'Balaji Green City', property_location: 'Jaipur', property_type: 'housing-project' },
	{ property_name: 'Balaji Paradise', property_location: 'Jaipur', property_type: 'plotting-project' }
];

const seedEntities = [
	{ name: 'Praveen Bhatt', entity_type: 'owner', entity_code: 'OWN' },
	{ name: 'Hemant Joshi', entity_type: 'owner', entity_code: 'OWN' }
];

const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
if (accountCount === 0) {
	const stmt = db.prepare(
		'INSERT INTO accounts (bank_name, account_number, account_holder, account_balance) VALUES (?, ?, ?, ?)'
	);
	const insertMany = db.transaction((items) => {
		for (const item of items) {
			stmt.run(item.bank_name, '', item.account_holder, 0);
		}
	});
	insertMany(seedAccounts);
}

const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
if (projectCount === 0) {
	const stmt = db.prepare(
		'INSERT INTO projects (property_name, property_location, property_type) VALUES (?, ?, ?)'
	);
	const insertMany = db.transaction((items) => {
		for (const item of items) {
			stmt.run(item.property_name, item.property_location, item.property_type);
		}
	});
	insertMany(seedProjects);
}

const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get().count;
if (entityCount === 0) {
	const stmt = db.prepare(
		'INSERT INTO entities (name, entity_type, entity_code) VALUES (?, ?, ?)'
	);
	const insertMany = db.transaction((items) => {
		for (const item of items) {
			stmt.run(item.name, item.entity_type, item.entity_code);
		}
	});
	insertMany(seedEntities);
}

export default db;
