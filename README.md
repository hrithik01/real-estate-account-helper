# Company Ledger

Local, multi-company accounting ledger (INR) built with SvelteKit + SQLite, JavaScript only.

## Start

```bash
npm install
npm run dev
```

## Database

- SQLite file at `data/ledger.db` (override with `LEDGER_DB_PATH=/path/to/file.db`)
- WAL mode is enabled
- Schema migrations run on startup. Before any migration, and before a company is deleted, a single-file copy is written to `data/backups/`.
- Databases from the single-company "Balaji Ledger" are migrated automatically: all existing data moves into a **Balaji Group** company and the Shree / PKB / HKJ master balances become that company's master balances.

## Companies

- Create any number of companies from the sidebar switcher or the **Companies** page (name, short code, colour, legal name, GSTIN/PAN, contact details, address and initial master balances).
- Every account, project, entity, entry, finance record, custom list and daily board belongs to exactly one company. The active company is remembered in a cookie; switching reloads the current page for the new company.
- Writes are tagged with the company a page was opened for, so a tab that is out of date after a switch in another tab is rejected instead of writing into the wrong company.

## Features

- **Overview**: day and month-to-date income, expense and net, bank balance, six-month cash-flow chart, master balances, recent activity, account balances, and To-do / Coming income / Coming expenses boards.
- **Income and Expenses**: fast entry form (T/L amount shortcuts, remembered date and default project, entities filtered by project, cash vs account rules with automatic account balance adjustment, expense sub-types), paginated ledger with search, filters, column toggles, edit dialog and CSV export.
- **Finance**: independent capital entries with interest rate and payout cycle.
- **Reports**: income, expense or combined reports for any period (presets include financial years), multi-entity and multi-project filters, per-entity running totals, source breakdowns, CSV export and A4 print with the company letterhead.
- **Masters**: bank accounts, projects, entities (auto entity codes), master balances (opening balances, renameable codes) and custom source/type lists.
- Light and dark themes; responsive down to phone width.
