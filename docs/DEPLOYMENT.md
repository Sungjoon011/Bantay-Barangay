# Deploying Bantay-Barangay

The system is ONE Node server (`npm start`) that serves both the API and the web pages (`Public/`), and it talks to
the Neon PostgreSQL database you already use. So deploying = running that one server somewhere with a public HTTPS address.

These steps use **Render** (connects to GitHub, gives HTTPS automatically). Any host that runs Node 18+ works the same way.

## 1. Before you start
- Database steps done in Neon: `database/00` to `16` (see README). Run `14_cancel_request.sql` on its own.
- Never upload `.env`. Check that `.gitignore` contains `.env`, and that `git status` does not list it.
- Push the project to a **private** GitHub repository.

## 2. Create the web service (Render)
1. Render dashboard -> **New** -> **Web Service** -> pick your GitHub repo.
2. Runtime **Node**. Build command: `npm install` (the `postinstall` script generates the Prisma client). Start command: `npm start`.
3. Under **Advanced**, set Health Check Path to `/api/health`.
4. Instance type: **Free** is fine for a demo; it sleeps after 15 minutes without visitors and the next visit takes about a minute
   to wake it. For real barangay use choose a paid instance that does not sleep.

## 3. Environment variables (Render -> Environment)
| Name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string for the limited `app_user` role (same as your `.env`) |
| `JWT_SECRET` | a long random text. Make one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `APP_URL` | your public address, e.g. `https://bantay-barangay.onrender.com` (no slash at the end). Set it after the first deploy shows the address, then redeploy. |
| `PAYMONGO_SECRET_KEY` | `sk_test_...` while testing, `sk_live_...` when real |
| `PAYMONGO_WEBHOOK_SECRET` | the `whsk_...` secret of the webhook in step 4 |

`PORT` is set by the host. `DIRECT_URL` (the owner connection) is only for running Prisma commands from your own computer;
leave the owner password off the server. If the app ever fails at start asking for it, add it.

## 4. PayMongo webhook
PayMongo dashboard -> Developers -> Webhooks -> add `https://YOUR-ADDRESS/api/paymongo/webhook` for the event
`checkout_session.payment.paid`. Copy its secret into `PAYMONGO_WEBHOOK_SECRET`. Test and live modes have separate keys
and separate webhooks.
If a free instance was asleep and missed the webhook, the portal still confirms the payment when the resident comes back
("Check payment status" asks PayMongo directly), so nobody who paid is left stuck.

## 5. Check it works
- `https://YOUR-ADDRESS/api/health` shows `ONLINE`.
- `/console.html` (staff) and `/resident.html` (residents) load and sign in.
- Make one test payment, then print the certificate: the QR code now opens the real public verify page on any phone.

## 6. Before real residents use it
- Strong `JWT_SECRET`; change any default or demo staff passwords.
- Switch PayMongo to live keys only after a full test-mode payment worked end to end.
- Know your Neon restore options and keep a backup of the database.
- The login has no attempt limit yet; consider adding one before going public.

## 7. Updating later
Push to GitHub; Render redeploys automatically. Run any new `database/*.sql` file in Neon BEFORE pushing code that needs it.
