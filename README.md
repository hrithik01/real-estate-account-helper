# Balaji Ledger

Local web-based accounting app for Balaji company (INR only), built with SvelteKit + SQLite using JavaScript only.

## Start

```bash
pnpm install
pnpm dev
```

## Database

- SQLite DB file is created at `data/ledger.db`
- WAL mode is enabled

## Features

- Master balances: Shree, PKB (Praveen Bhatt), HKJ (Hemant Joshi)
- Accounts CRUD with bank, account number, holder, and account balance
- Projects CRUD with name, location, and type (land/house/housing-project/plotting-project)
- Entities CRUD with entity type and code
- Income/Expense transactions with editable date, amount, entity, and comments
- Finance board with independent entries (date, entity, amount, interest %, payout cycle, comments)
- Daily Overview with To-Dos, Coming Income, and Coming Expenses boards
- Reports page for income, expense, or combined report with entity filter
