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

App Hosting detects `package-lock.json`, installs dependencies with `npm ci`, runs `npm run build`, and serves the app through Firebase's managed Next.js runtime on Cloud Run. Do not add a static Firebase Hosting rewrite for this app unless the API routes are moved elsewhere.

Production deployments should connect App Hosting to:

```text
GitHub repo: antoniocepeda/family-cash-clarity-dashboard
Live branch: main
App root directory: app
Build command: npm run build
Install command: npm ci
```

After that connection is in place, pushes to GitHub `main` trigger production rollouts automatically.

For CLI setup:

```bash
firebase apphosting:backends:create --project <firebase-project-id>
```

When prompted for the app root directory, enter `app`.

### Required App Hosting Values

Local development reads values from `app/.env.local`; deployed Firebase App Hosting/Cloud Run instances read them from Cloud Secret Manager through `app/apphosting.yaml`.

Required build/runtime values:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_AUTHORIZED_EMAILS
```

Required runtime-only Plaid secrets:

```text
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV
```

Create the App Hosting value sources before deploying:

```bash
firebase apphosting:secrets:set firebaseApiKey --project <firebase-project-id>
firebase apphosting:secrets:set firebaseAuthDomain --project <firebase-project-id>
firebase apphosting:secrets:set firebaseProjectId --project <firebase-project-id>
firebase apphosting:secrets:set firebaseAppId --project <firebase-project-id>
firebase apphosting:secrets:set authorizedEmails --project <firebase-project-id>
```

Create the Plaid secrets before deploying:

```bash
firebase apphosting:secrets:set plaidClientId --project <firebase-project-id>
firebase apphosting:secrets:set plaidSecret --project <firebase-project-id>
firebase apphosting:secrets:set plaidEnv --project <firebase-project-id>
```

Set `plaidEnv` to `sandbox`, `development`, or `production`. If you create or manage any values directly in Google Cloud Secret Manager instead, grant the App Hosting backend/service account access to each secret, for example with:

```bash
firebase apphosting:secrets:grantaccess firebaseApiKey --project <firebase-project-id>
firebase apphosting:secrets:grantaccess firebaseAuthDomain --project <firebase-project-id>
firebase apphosting:secrets:grantaccess firebaseProjectId --project <firebase-project-id>
firebase apphosting:secrets:grantaccess firebaseAppId --project <firebase-project-id>
firebase apphosting:secrets:grantaccess authorizedEmails --project <firebase-project-id>
firebase apphosting:secrets:grantaccess plaidClientId --project <firebase-project-id>
firebase apphosting:secrets:grantaccess plaidSecret --project <firebase-project-id>
firebase apphosting:secrets:grantaccess plaidEnv --project <firebase-project-id>
```

Redeploy the App Hosting backend after creating or rotating these values. Plaid secrets must not be committed, logged, returned from API routes, or imported into client components. `NEXT_PUBLIC_*` values are included in the browser bundle and should not contain confidential credentials.

### Firebase Console Checklist

Some production setup must be completed in Firebase Console or through an authenticated Firebase CLI session:

1. Confirm the Firebase project exists and billing is enabled. App Hosting requires a billing-enabled project.
2. Enable Firebase App Hosting for the project.
3. Create an App Hosting backend connected to GitHub repository `antoniocepeda/family-cash-clarity-dashboard`.
4. Grant Firebase access to the GitHub repository if prompted during the connection flow.
5. Set the app root directory to `app`.
6. Set the live branch to `main` so pushes to `main` automatically deploy.
7. Create/grant the App Hosting secrets listed above.
8. Trigger a rollout from the latest `main` commit.
9. Verify the deployed URL loads the dashboard and that authenticated API routes respond in the deployed environment.

### Preview Deployments

Keep the first App Hosting backend focused on stable production deploys from `main`. After production rollouts are consistently healthy, add preview deployments for pull requests or non-production branches using a separate preview backend or App Hosting preview workflow with the same `app` root, `npm ci`, `npm run build`, and non-production Firebase/Plaid values.

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

Plaid access tokens are stored only under `users/{userId}/plaidItems/{itemId}.encrypted_access_token`. The browser never receives this field. The server encrypts the token before persistence and decrypts it only inside authenticated Plaid API routes.

Plaid sync maps remote accounts into existing `accounts` documents by `plaid_account_id`, then by exact account name, and creates a new app account only when no match exists. Account balances are updated from Plaid while manual account fields such as reserve status are preserved. Imported transactions are stored in `users/{userId}/ledger` with `source: "plaid"` and `plaid_transaction_id`; repeated syncs update the same ledger document instead of creating duplicates. Plaid removals mark matching ledger rows with `removed: true`.

Deploy `firestore.rules` to enforce `request.auth.uid == userId` document scoping for any direct client Firestore access. The current app primarily accesses Firestore through authenticated server API routes.

For local Admin access, either use Application Default Credentials:

```bash
gcloud auth application-default login
```

or set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in `.env.local`.

## Plaid Setup

Create a Plaid app in the Plaid Dashboard and add the redirect/deployed app domains that will open Plaid Link. For local development, keep:

```text
PLAID_ENV=sandbox
PLAID_CLIENT_ID=<Plaid client id>
PLAID_SECRET=<Plaid sandbox secret>
```

The Manage Data account tab includes:

- `Connect Bank`: creates a server-side Link token, opens Plaid Link in the browser, and sends only the returned `public_token` to `/api/plaid/exchange-token`.
- `Sync Bank Data`: calls `/api/plaid/sync`, which reads encrypted access tokens server-side, refreshes accounts/balances, and imports transaction sync changes.

For sandbox testing, select a Plaid sandbox institution such as `First Platypus Bank` in Link and use Plaid's sandbox credentials (`user_good` / `pass_good`) plus any prompted MFA code shown by Plaid's sandbox flow. No live bank credentials are required.

Plaid routes:

```text
POST /api/plaid/link-token      Creates a user-scoped Plaid Link token.
POST /api/plaid/exchange-token  Exchanges a public token server-side and stores encrypted item metadata.
GET  /api/plaid/sync            Returns linked bank/account status without token fields.
POST /api/plaid/sync            Syncs Plaid accounts, balances, transactions, cursors, updates, and removals.
```

To switch from sandbox/trial to production, request Production access in the Plaid Dashboard, configure production redirect/application domains, rotate `PLAID_SECRET` to the production secret, set `PLAID_ENV=production`, and redeploy. Existing sandbox Items cannot be promoted; users must reconnect banks against the production environment.

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
