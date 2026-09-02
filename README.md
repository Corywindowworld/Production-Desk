# Production Desk — Vercel + Supabase migration

Both Production Desk (`/`) and Installer Desk (`/installers`) run in this Next.js app. This is a separate migration copy of source commit `64539391ce20171afba8ca9e9a43cf750f286bd1`. It includes the payment-method dropdown (Finance, Check, Credit Card, PO). The existing ChatGPT Sites app is not modified by this package.

## Architecture

- Next.js 16 / React 19 on Vercel's Node.js runtime.
- Supabase PostgreSQL, using the transaction pooler and parameterized server-side queries. Prepared statements are disabled for transaction pooling.
- Private Supabase Storage bucket for documents and photos. The browser uploads to a signed staging URL; the server validates the file type and size, hashes the bytes, and saves an immutable final object. Downloads require job access and redirect to a 60-second signed URL.
- Existing application-owned email/password authentication, hashed session cookies, account administration and role permissions are retained. This migration **does not use Supabase Auth**. Database records live in a private `production` schema, outside the public Data API. Keep this schema unexposed; no browser database access is needed.
- Resend invitation email and web-push notifications remain optional services.

## Quick SQL Editor option

The separate private data package contains `01-create-and-import.sql`. Run it once in the SQL Editor of Supabase project `gyuwnxfllexbvzwwfbck` to create the schema and import the current snapshot in one transaction. This replaces steps 4 and 6 below. Do not run both import methods. In Supabase Storage, create a private bucket named `job-files` with a 15 MB limit, or use step 5.

## Deploy in order

1. Use `https://github.com/Corywindowworld/Production-Desk` (set repository visibility to private if appropriate) and upload this folder's contents at the repository root. Include `.env.example`, `.gitignore`, and the lockfile. Do not upload the separate private data export, `.env.local`, `node_modules`, or `.next`.
2. In Supabase project `gyuwnxfllexbvzwwfbck` (`https://gyuwnxfllexbvzwwfbck.supabase.co`), find the connection string under **Connect → Transaction pooler**. Set `DATABASE_URL` in a local `.env.local` copied from `.env.example`. Also set the Supabase project URL and server-only service-role key. Store secrets through the provider settings, never in Git or chat. Choose Vercel/Supabase regions near each other; change the Vercel region in `vercel.json` if appropriate.
3. Install Node.js 22.13+ and run `npm ci` from this folder.
4. Run `npm run db:migrate`. This creates the private PostgreSQL schema. Use a fresh Supabase project/database to avoid colliding with another app. Migrations are tracked and transactional.
5. Run `npm run storage:setup`. It configures the private `job-files` bucket with a 15 MB object-size limit. Do not add public read/write Storage policies.
6. Import the separate private export **before the first login**: `npm run db:import -- /absolute/path/production-data.json`. The importer refuses nonempty target tables, verifies row counts, and rolls back the whole import on error. Do not set owner-bootstrap values when importing existing accounts.
7. In Vercel, import the GitHub repository using the Next.js preset. Add `.env.example` values in Project Settings → Environment Variables for Production. Keep database and service-role keys server-only. Use a separate Supabase project for Preview, or leave Preview credentials unset so previews cannot change production data.
8. Deploy. Set `APP_URL` to the new HTTPS address, then redeploy so account emails use the correct login URL. Configure a custom domain if desired.
9. Validate login as owner, field supervisor and installer. Check the two imported jobs, payment method, schedule, read-only permissions, a real phone-photo upload/download, a test installation report, and optional email/push delivery. Test against staging first so validation does not change real production jobs.
10. Stop edits in the old app for the final transfer. Refresh the export if it has changed since the snapshot, import into the clean target, compare record counts, then distribute the new link. Do not let both apps accept edits during cutover. Keep the old app available read-only as a reference until acceptance.

## Important migration details

- The export prepared during this conversation contained 2 jobs, 5 staff accounts and 11 account-audit records, with no reports, visits, or job attachments. Counts are a snapshot, not a guarantee about later live changes.
- Account password hashes can be imported without knowing plaintext passwords. Existing permanent passwords continue to work. Expired/consumed temporary passwords still need an administrator reset. Sessions do not move: everyone must sign in again.
- Push subscriptions belong to the old origin. Staff must enable notifications and reinstall/update home-screen shortcuts for the new domain. Generate new VAPID keys with `npx web-push generate-vapid-keys`; enter them in Vercel's environment settings.
- Source ZIPs do not contain customer/account data. The separate data ZIP is confidential and must not be committed to GitHub.
- This importer intentionally stops if newer exports contain files. Migrate those file bytes plus ownership/kind/hash metadata into Storage and `production.attachment_uploads` before cutover. Do not treat the empty-file snapshot as a general attachment export tool.
- Files abandoned during an upload may remain under `pending/`; periodically remove expired staging objects. Do not delete `jobs/` objects based only on age.
- No external sales-app integration or shared Supabase Auth has been added. Agree on ownership, identifiers and API authentication before connecting the collaborator's app. Do not give their frontend your database password or service-role key.

## Commands

```
npm ci
npm run db:migrate
npm run storage:setup
npm run db:import -- /absolute/path/production-data.json
npm test
npm run build
npm run dev -- --experimental-https
```

HTTPS is needed for the existing Secure session cookie when testing sign-in locally. See `https://nextjs.org/docs/app/api-reference/cli/next#using-https-during-development` for local HTTPS setup.

## Validation and limits

The production Next.js build includes TypeScript checks. The PostgreSQL integration suite uses PGlite (an embedded PostgreSQL engine) and mocked object storage. It exercises database rollback, account activation, permissions, job transitions, payment methods, upload authorization and finalization, and installation reports. This does not replace real Supabase/Vercel staging validation. Historical SQLite tests are retained under `tests/legacy` for reference and are not the migration test suite.

Official references:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/storage
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/frameworks/full-stack/nextjs
