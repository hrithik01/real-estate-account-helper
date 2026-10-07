// @ts-nocheck
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.env.LEDGER_DB_PATH || path.join('data', 'ledger.db'));
const dataDir = path.dirname(dbPath);
const backupDir = path.join(dataDir, 'backups');
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA_VERSION = 1;

const timestampSlug = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Writes a consistent single-file copy of the database into data/backups. */
export const backupDatabase = (label) => {
	if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
	const safeLabel = String(label || 'backup').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
	const target = path.join(backupDir, `ledger-${safeLabel}-${timestampSlug()}.db`);
	db.prepare('VACUUM INTO ?').run(target);
	return target;
};

/*
 * Company-scoped tables. Each definition takes the table name so the same DDL
 * can be used for a fresh database and for rebuilding legacy tables.
 */
const TABLE_DEFS = {
	accounts: (name) => `
		CREATE TABLE ${name} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
			bank_name TEXT NOT NULL,
			account_number TEXT,
			account_holder TEXT NOT NULL,
			account_balance REAL NOT NULL DEFAULT 0,
			comments TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
	projects: (name) => `
		CREATE TABLE ${name} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
			property_name TEXT NOT NULL,
			property_location TEXT NOT NULL,
			property_type TEXT NOT NULL,
			current_registered_owner_entity_id INTEGER,
			official_record TEXT,
			comments TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
	entities: (name) => `
		CREATE TABLE ${name} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			entity_type TEXT NOT NULL,
			entity_code TEXT NOT NULL,
			comments TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`,
	income: (name) => `
		CREATE TABLE ${name} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			amount REAL NOT NULL,
			entity_id INTEGER,
			project_id INTEGER,
			account_id INTEGER,
			payment_mode TEXT NOT NULL DEFAULT 'cash',
			credit_source TEXT NOT NULL DEFAULT 'other',
			master_owner TEXT NOT NULL,
			comments TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL,
			FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
			FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
		)`,
	expenses: (name) => `
		CREATE TABLE ${name} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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
			master_owner TEXT NOT NULL,
			comments TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL,
			FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
			FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
		)`,
	finance_entries: (name) => `
		CREATE TABLE ${name} (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			entity_id INTEGER,
			amount REAL NOT NULL,
			interest_rate REAL NOT NULL DEFAULT 1.5,
			interest_payout TEXT NOT NULL DEFAULT 'monthly' CHECK (interest_payout IN ('monthly', 'quarterly', 'half-yearly', 'annually')),
			comments TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
		)`
};

const SCOPED_TABLES = Object.keys(TABLE_DEFS);

const COMPANY_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS companies (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE COLLATE NOCASE,
	code TEXT NOT NULL,
	legal_name TEXT,
	tax_id TEXT,
	address TEXT,
	phone TEXT,
	email TEXT,
	color TEXT NOT NULL DEFAULT '#2563eb',
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_settings (
	company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
	custom_expense_sources_json TEXT NOT NULL DEFAULT '[]',
	custom_credit_sources_json TEXT NOT NULL DEFAULT '[]',
	custom_entity_types_json TEXT NOT NULL DEFAULT '[]',
	custom_property_types_json TEXT NOT NULL DEFAULT '[]',
	todos_json TEXT NOT NULL DEFAULT '[]',
	coming_income_json TEXT NOT NULL DEFAULT '[]',
	coming_expenses_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ledger_heads (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
	code TEXT NOT NULL,
	name TEXT NOT NULL,
	opening_balance REAL NOT NULL DEFAULT 0,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE (company_id, code)
);
`;

const LINK_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS entity_projects (
	entity_id INTEGER NOT NULL,
	project_id INTEGER NOT NULL,
	PRIMARY KEY (entity_id, project_id),
	FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
	FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
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
`;

const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_entities_company ON entities(company_id);
CREATE INDEX IF NOT EXISTS idx_income_company_date ON income(company_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_company_date ON expenses(company_id, date);
CREATE INDEX IF NOT EXISTS idx_finance_company ON finance_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_income_entity_id ON income(entity_id);
CREATE INDEX IF NOT EXISTS idx_expenses_entity_id ON expenses(entity_id);
CREATE INDEX IF NOT EXISTS idx_finance_entity_id ON finance_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_projects_project_id ON entity_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_income_projects_project_id ON income_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_projects_project_id ON expense_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_ledger_heads_company ON ledger_heads(company_id);
`;

const tableExists = (name) =>
	Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

const columnNames = (tableName) => db.prepare(`PRAGMA table_info(${tableName})`).all().map((c) => c.name);

const ensureColumn = (tableName, columnName, definition) => {
	if (!columnNames(tableName).includes(columnName)) {
		db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
	}
};

const createFreshSchema = () => {
	db.exec(COMPANY_TABLES_SQL);
	for (const table of SCOPED_TABLES) {
		if (!tableExists(table)) db.exec(TABLE_DEFS[table](table));
	}
	db.exec(LINK_TABLES_SQL);
	db.exec(INDEXES_SQL);
};

// Holders that existed when this was a single-company ledger (pre-v1 schema).
const LEGACY_HEADS = [
	{ code: 'SHREE', name: 'Shree', column: 'master_shree_start' },
	{ code: 'PKB', name: 'Praveen Bhatt', column: 'master_pkb_start' },
	{ code: 'HKJ', name: 'Hemant Joshi', column: 'master_hkj_start' }
];
const LEGACY_COMPANY = { name: 'Balaji Group', code: 'BG', color: '#b45309' };

/*
 * v0 -> v1: the database held a single company's books. Every existing row is
 * moved into a "Balaji Group" company, settings become company settings, and the
 * hard-coded SHREE/PKB/HKJ holders become ledger heads.
 */
const migrateLegacyDatabase = () => {
	backupDatabase('pre-multi-company');

	// Bring very old legacy databases up to the last single-company shape first.
	ensureColumn('accounts', 'comments', 'TEXT');
	ensureColumn('projects', 'comments', 'TEXT');
	ensureColumn('projects', 'current_registered_owner_entity_id', 'INTEGER');
	ensureColumn('projects', 'official_record', 'TEXT');
	ensureColumn('entities', 'comments', 'TEXT');
	if (tableExists('settings')) {
		for (const column of [
			'custom_expense_sources_json',
			'custom_credit_sources_json',
			'custom_entity_types_json',
			'custom_property_types_json',
			'todos_json',
			'coming_income_json',
			'coming_expenses_json'
		]) {
			ensureColumn('settings', column, "TEXT NOT NULL DEFAULT '[]'");
		}
	}

	// foreign_keys cannot be toggled inside a transaction.
	db.pragma('foreign_keys = OFF');
	try {
		db.transaction(() => {
			db.exec(COMPANY_TABLES_SQL);

			const companyId = Number(
				db
					.prepare('INSERT INTO companies (name, code, color) VALUES (?, ?, ?)')
					.run(LEGACY_COMPANY.name, LEGACY_COMPANY.code, LEGACY_COMPANY.color).lastInsertRowid
			);

			const settings = tableExists('settings') ? db.prepare('SELECT * FROM settings WHERE id = 1').get() : null;
			db.prepare(
				`INSERT INTO company_settings (
					company_id, custom_expense_sources_json, custom_credit_sources_json, custom_entity_types_json,
					custom_property_types_json, todos_json, coming_income_json, coming_expenses_json
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				companyId,
				settings?.custom_expense_sources_json || '[]',
				settings?.custom_credit_sources_json || '[]',
				settings?.custom_entity_types_json || '[]',
				settings?.custom_property_types_json || '[]',
				settings?.todos_json || '[]',
				settings?.coming_income_json || '[]',
				settings?.coming_expenses_json || '[]'
			);

			const insertHead = db.prepare(
				'INSERT INTO ledger_heads (company_id, code, name, opening_balance, sort_order) VALUES (?, ?, ?, ?, ?)'
			);
			LEGACY_HEADS.forEach((head, index) => {
				insertHead.run(companyId, head.code, head.name, Number(settings?.[head.column] || 0), index);
			});

			// Rebuild each scoped table: create new, copy, drop old, rename new -> old.
			for (const table of SCOPED_TABLES) {
				const tempName = `${table}__v1`;
				db.exec(TABLE_DEFS[table](tempName));
				if (!tableExists(table)) {
					db.exec(`ALTER TABLE ${tempName} RENAME TO ${table}`);
					continue;
				}
				const newColumns = columnNames(tempName);
				const copied = columnNames(table).filter((column) => newColumns.includes(column) && column !== 'company_id');
				const list = copied.join(', ');
				db.prepare(`INSERT INTO ${tempName} (company_id, ${list}) SELECT ?, ${list} FROM ${table}`).run(companyId);
				db.exec(`DROP TABLE ${table}`);
				db.exec(`ALTER TABLE ${tempName} RENAME TO ${table}`);
			}

			db.exec(LINK_TABLES_SQL);
			db.exec(
				`INSERT OR IGNORE INTO income_projects (income_id, project_id)
				 SELECT id, project_id FROM income WHERE project_id IS NOT NULL`
			);
			db.exec(
				`INSERT OR IGNORE INTO expense_projects (expense_id, project_id)
				 SELECT id, project_id FROM expenses WHERE project_id IS NOT NULL`
			);
			db.exec('DROP TABLE IF EXISTS settings');
			db.exec(INDEXES_SQL);

			const problems = db.pragma('foreign_key_check');
			if (problems.length > 0) {
				throw new Error(`Multi-company migration failed foreign key check: ${JSON.stringify(problems.slice(0, 5))}`);
			}
			db.pragma(`user_version = ${SCHEMA_VERSION}`);
		})();
	} finally {
		db.pragma('foreign_keys = ON');
	}
};

const runMigrations = () => {
	const version = db.pragma('user_version', { simple: true });
	if (version >= SCHEMA_VERSION) {
		createFreshSchema();
		return;
	}
	if (tableExists('income') || tableExists('settings')) {
		migrateLegacyDatabase();
		return;
	}
	db.transaction(() => {
		createFreshSchema();
		db.pragma(`user_version = ${SCHEMA_VERSION}`);
	})();
};

runMigrations();

export default db;
