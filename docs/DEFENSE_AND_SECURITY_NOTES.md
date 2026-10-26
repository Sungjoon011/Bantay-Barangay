# Defense & Security Notes — Bantay-Barangay

## Database roles (RBAC at the database level)
| Role | Used by | Rights |
|---|---|---|
| neondb_owner | Prisma CLI only (`DIRECT_URL`: db push / migrations) | owner, can change schema |
| app_user | the running API (`DATABASE_URL`) | SELECT, INSERT, UPDATE on the app tables; DELETE only on Announcement; no DDL, no DROP, no role management |

The API never connects as the owner. `.env` is in `.gitignore`.

## Application roles (enforced in `Backend/middleware/auth.js`)
| Role | Can do |
|---|---|
| Admin | everything: adds and removes staff accounts, deletes, the audit log, any announcement |
| Staff | read, create, update. No deletes (except their own announcements), cannot add or remove staff, sees and edits only their OWN staff record, no audit log, cannot see VAWC / Restricted blotters |
| Official | read, approve (PATCH: document workflow, permits, blotter status), read audit log |

## SQL injection
All queries go through Prisma (parameterised). The two raw calls (`CALL sp_...`, `fn_barangay_stats()`) use Prisma tagged templates, so values are sent as bound parameters.

## Prepared answers for the "what-if" questions
**"I delete a parent row in the DB client."** Foreign keys use `ON DELETE RESTRICT` for records that must be kept (e.g. Resident → Household, DocumentRequest → Resident), `SET NULL` for optional links (e.g. DocumentRequest.processedByStaffId), and `CASCADE` only for pure link rows (BlotterParty/ResidentProgram when the case/program is deleted). Payment → DocumentRequest/BusinessPermit is `SET NULL`, but the Payment CHECK constraint forbids a payment with no parent, so a request that has a payment cannot be deleted. PostgreSQL refuses the delete with a foreign-key error; the API never crashes because it only soft-deletes (recordStatus) and returns the error as JSON.
**"Show your connection string."** `DATABASE_URL` uses `app_user` (limited). Only `DIRECT_URL` uses the owner, and it is used by the CLI for schema changes, not by the running app.
**"Who changed this row?"** Triggers write the audit row. The API sets `app.account_id` (from the JWT) inside the same transaction (`Backend/db.js`), so the log has the account id.
**"Explain the data lifecycle of approving a document."** Client → `PATCH /api/documents/:id/process` → `guard` middleware (JWT + role) → route in `routes/extra.js` → one transaction: `set_config('app.account_id')` + `CALL sp_process_document_request(...)` → procedure locks the row (`FOR UPDATE`), validates the status change, updates the request, creates the Payment if it does not exist yet (it normally already does: the Payment is created together with the request) → audit triggers fire → JSON response.
**"Why a CHECK on Payment?"** Payment belongs to either a document request or a business permit. The CHECK guarantees exactly one of `requestId` / `permitId` is filled and matches `transactionType`.
**"Why is address not in Resident?"** 3NF: the address depends on the household, not on the resident, so it lives only in Household (`vw_resident_directory` joins them).

## Payments (online and cash)
- A document request and its Payment row are created together; the fee is stamped from `DocumentFee` by a trigger, so the client can never choose the amount.
- **Pay online:** PayMongo checkout; the API only trusts PayMongo, never the browser. Two paths mark it paid: the webhook (HMAC signature checked) and `POST /api/me/documents/:id/sync-payment`, which asks PayMongo directly. Both go through one function that refuses an underpayment and is safe to run twice. Paid online releases the request (Ready) so the printed certificate verifies on `/verify.html`.
- **Pay cash:** the resident books a hall visit tied to that request; the payment stays Unpaid until staff record it with an OR number.
- **Cancel:** a resident can cancel only while nothing was paid (unpaid or free). Paid requests must go through staff (refund). Cancelled requests cannot be revived by the stored procedure.

## Emergency alerts (in-app banner)
An announcement with priority `Emergency` (last 72 hours, for "All" or the resident's purok) appears as a red banner in the resident portal and refreshes every minute. Announcement text is inserted as plain text, so staff-typed HTML can never run in a resident's browser. No outside SMS service is used.

## Announcements
Admins, Staff and Officials publish from the Staff Portal (**Announcements** tab) or the console form (**Announcements -> Post announcement...**). The server records the signed-in staff member as the author (a user cannot post "as" someone else), trims the text, and accepts only the priorities Normal / Important / Emergency. Audience is `All` (everyone: every staff/admin account and every resident), `Residents` (all residents) or one existing purok; the server hides a purok-only announcement from residents of other puroks. Admin can edit or delete any announcement; Staff and Officials only the ones they posted.

## Certificate authenticity (QR code)
Every released certificate prints a verification code and a QR code (generated in the browser with the MIT-licensed `qrcode-generator`, file `Public/qrcode.js`). The QR holds only `/verify.html?code=<code>`: no personal data. The public verify page looks the code up through `GET /api/verify/:code`, which answers only for Ready / Claimed requests and returns just the document type and the name it was issued to.

## Duplicate residents
Same first name + last name + birth date = same person. Enforced twice: the API answers 409 with the existing resident's ID, and a unique index in PostgreSQL stops two simultaneous saves. Every resident also has a unique, readable `residentCode` (BB-000012).

## Dates
Appointment dates and times are checked on the server in Philippine time (past dates and times are rejected), not only in the browser calendar.

## Git workflow reminder
Feature branch → commits with `feat:` / `fix:` / `docs:` → Pull Request → reviewed and merged by the Git Administrator. Never push to `main`.


## Staff accounts
Only an Admin can add staff (`POST /api/staff`) or remove them (`DELETE /api/staff/:accountId`). Removing does not erase the row (audit logs, documents and announcements point to it): the account becomes `Inactive` and the staff record `Resigned`, and the middleware re-checks the account status on every request, so a removed person is locked out immediately. An Admin cannot remove themselves or the last active Admin. `GET /api/staff` returns every account to an Admin but only the caller's own account to Staff / Official, and `PUT /api/staff/:accountId` lets them change only their own name and position.
