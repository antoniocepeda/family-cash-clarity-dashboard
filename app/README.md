# Family Cash Clarity Dashboard

A local-first Next.js dashboard for tracking household cash position, bills, income, upcoming commitments, and short-term balance projections.

## Requirements

- Node.js 20 or newer
- npm

## Setup

From the repository root:

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The Next.js app is nested in the `app/` directory. Running `npm run dev` from the repository root will fail because the root folder does not contain `package.json`.

## Useful Commands

Run these from `app/`:

```bash
npm run dev
npm run lint
npm run build
```

## Local Data

The app uses SQLite through `better-sqlite3`. By default, the database is created at:

```text
app/data/family-cash.db
```

Files under `app/data/*.db*` are ignored by Git because they are local runtime data. Back up that folder before resetting data or moving to another machine.

## Project Layout

```text
src/app/           Next.js pages and API routes
src/components/    Dashboard UI components
src/lib/           SQLite setup, projection logic, recurrence helpers, shared types
data/              Local SQLite database files
KB.md              User guide and product knowledge base
```

## Notes

- The dashboard is intended for local use unless authentication and deployment hardening are added.
- Projection and alert accuracy depends on keeping account balances reconciled and commitments up to date.
- The app uses system fonts so builds do not depend on downloading Google-hosted fonts.
