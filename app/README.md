# Family Cash Clarity Dashboard

A Next.js dashboard for tracking household cash position, bills, income, upcoming commitments, and short-term balance projections.

## Requirements

- Node.js 20 or newer
- npm
- A Firebase project with Authentication and Firestore enabled

## Setup

From the repository root:

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The Next.js app is nested in the `app/` directory. Running `npm run dev` from the repository root will fail because the root folder does not contain `package.json`.

Copy `.env.local.example` to `.env.local` and fill in the browser Firebase config plus server-side Firebase Admin credentials for local development. Add Plaid values there only for local development. Do not prefix Admin credentials or Plaid secrets with `NEXT_PUBLIC_`.

## Useful Commands

Run these from `app/`:

```bash
npm run dev
npm run lint
npm run build
```

## Firebase App Hosting

This is a full-stack Next.js app with API routes, so deploy it with Firebase App Hosting instead of plain Firebase Hosting.

The App Hosting configuration lives at:

```text
app/apphosting.yaml
```

When creating the App Hosting backend in the Firebase console or CLI, set the repo-relative app root directory to:

```text
app
```

App Hosting will install dependencies, run `npm run build`, and serve the Next.js app on Cloud Run. Do not add a static Firebase Hosting rewrite for this app unless the API routes are moved elsewhere.

For CLI setup:

```bash
firebase apphosting:backends:create --project <firebase-project-id>
```

When prompted for the app root directory, enter `app`.

### Plaid Secrets

Plaid credentials are server-only runtime secrets. Local development reads them from `app/.env.local`; deployed Firebase App Hosting/Cloud Run instances read them from Cloud Secret Manager through `app/apphosting.yaml`.

Required environment variables:

```text
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV
```

Create the App Hosting secrets before deploying:

```bash
firebase apphosting:secrets:set plaidClientId --project <firebase-project-id>
firebase apphosting:secrets:set plaidSecret --project <firebase-project-id>
firebase apphosting:secrets:set plaidEnv --project <firebase-project-id>
```

Set `plaidEnv` to `sandbox`, `development`, or `production`. If you create or manage the secrets directly in Google Cloud Secret Manager instead, grant the App Hosting backend/service account access to each secret, for example with:

```bash
firebase apphosting:secrets:grantaccess plaidClientId --project <firebase-project-id>
firebase apphosting:secrets:grantaccess plaidSecret --project <firebase-project-id>
firebase apphosting:secrets:grantaccess plaidEnv --project <firebase-project-id>
```

Redeploy the App Hosting backend after creating or rotating these secrets. Plaid secrets must not be committed, logged, returned from API routes, or imported into client components.

## Firestore Data

The app stores data in Firestore using Firebase Admin from server-only API routes. Runtime filesystem storage is not used as the source of truth, so the app can run across Firebase App Hosting/Cloud Run instances.

Documents are scoped under the authenticated Firebase user:

```text
users/{userId}
users/{userId}/accounts/{accountId}
users/{userId}/commitments/{commitmentId}
users/{userId}/commitmentInstances/{instanceId}
users/{userId}/ledger/{ledgerId}
users/{userId}/commitmentAllocations/{allocationId}
users/{userId}/ledgerItems/{itemId}
users/{userId}/plaidItems/{itemId}
users/{userId}/plaidAccounts/{plaidAccountId}
users/{userId}/plaidSync/{itemId}
```

Each persisted document includes stable `createdAt` and `updatedAt` fields. Existing API responses keep the app's snake_case fields for UI compatibility.

Deploy `firestore.rules` to enforce `request.auth.uid == userId` document scoping for any direct client Firestore access. The current app primarily accesses Firestore through authenticated server API routes.

For local Admin access, either use Application Default Credentials:

```bash
gcloud auth application-default login
```

or set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in `.env.local`.

## Project Layout

```text
src/app/           Next.js pages and API routes
src/components/    Dashboard UI components
src/lib/           Firestore repositories, projection logic, recurrence helpers, shared types
KB.md              User guide and product knowledge base
```

## Notes

- The dashboard requires Firebase Authentication; server routes also check the authorized user email list.
- Projection and alert accuracy depends on keeping account balances reconciled and commitments up to date.
- The app uses system fonts so builds do not depend on downloading Google-hosted fonts.
