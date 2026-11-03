# NovaTasks operations and preview review

The existing white, blue, and purple layout and page entry points were retained. Browser preview records were removed; existing local task previews are intentionally not imported into the database.

Netlify Database provisions PostgreSQL automatically. Drizzle defines the schema in `db/schema.ts`; generated migrations in `netlify/database/migrations` are applied by Netlify during deployment. Do not manually push or apply the schema. Deploy previews use an isolated database branch. No database credentials belong in browser code.

## Authentication configuration

Netlify Identity was enabled. Passwords are handled by Identity, never by the application database. Keep email confirmation enabled. Confirm the production site URL and email redirect URLs point to the intended domain, and configure a reliable transactional email sender in Identity before inviting real users. Test confirmation, invitation, and password recovery links on the preview URL as well.

To establish the first administrator, open this project's Identity section in Netlify, invite the real owner's email, accept the invitation and set a password, then add `admin` to that user's Roles in Identity and save. Sign in again. No public form or application endpoint can grant this role. Other administrators are assigned or revoked there too. Account suspension through the administration workspace immediately blocks application API access; Identity credentials remain managed separately.

Database profiles are created on the first verified authenticated API request, using the Identity user ID, registration timestamp, email, name, and server-managed roles. Users who have not yet entered the platform do not appear in the platform's statistics.

## Reward and withdrawal rules

Amounts are integer kobo, displayed as NGN. A submission reserves one task slot; rejection releases it. Each account may submit once per task. The submitted reward is fixed at submission time. Approval inserts one unique earned reward in the same transaction as the review decision. There is no balance editing endpoint.

A withdrawal reserves funds at request time. Available balance is earned rewards minus pending, approved, and paid withdrawals. Rejection releases the reservation. Requests have idempotency keys. User row locks serialize financial changes, while row locks and uniqueness constraints protect task slots and repeat approvals.

Withdrawals follow pending → approved → paid, or pending/approved → rejected. An administrator transfers money through their bank outside NovaTasks, then records the bank reference. This application does not initiate bank transfers or independently verify bank settlement. `paid` means an authorized administrator recorded that transfer and its reference. Never record payment before completing the real transfer. Automatic payouts require a separate payment-provider integration and reconciliation workflow.

Administration actions are appended to audit history. No application endpoint edits rewards or audit records. User data and payment details are only returned to the user concerned and authorized administrators. Only proof text or links are accepted; file uploads are not implemented.

## Review before production publication

Review the generated deploy preview before approving publication. Use real authorized test accounts and an operator-approved task if financial testing is needed; this change inserts no users, rewards, tasks, or withdrawals. Check registration and email verification, member isolation, administrator restrictions, task creation, slot limits, proof review, one reward per approval, withdrawal reservation, rejection, and recording an actual bank reference. Check two simultaneous requests cannot exceed a balance or task slot count.

Local validation covers TypeScript, frontend syntax, unauthenticated API rejection, and PostgreSQL-compatible schema constraints. Hosted Identity, email delivery, Netlify database provisioning, and concurrent authenticated financial workflows still require preview verification. No production publish was performed by this implementation.
