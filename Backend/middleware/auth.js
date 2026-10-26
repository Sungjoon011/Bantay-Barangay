// auth.js : JWT check + role rules + actor context for the audit triggers.
//   Admin    : everything (including adding / removing staff accounts and deletes)
//   Staff    : read + create + update (no deletes, cannot add/remove staff, sees and edits only their OWN staff record)
//   Official : read + approve (PATCH only), same own-record rule for staff
//   Staff and Official may post announcements and edit/delete only the ones THEY posted (checked in routes/extra.js)
const jwt = require('jsonwebtoken');
const { actorStore, prisma } = require('../db');

const STAFF_ITEM = /^\/staff\/\d+$/;
const ANNOUNCEMENT_ITEM = /^\/announcements\/\d+$/;

const PUBLIC_PATHS = ['/login', '/health', '/resident/login', '/resident/register', '/paymongo/webhook'];

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Login required. Send the header  Authorization: Bearer <token>' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { accountId, role }
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function rolePolicy(req, res, next) {
  const { role } = req.user;
  const method = req.method;

  // Residents (Standard Client) may only use their own portal and read public info
  if (role === 'Resident') {
    const ok = req.path.startsWith('/me') || (method === 'GET' && ['/announcements', '/programs'].includes(req.path));
    return ok ? next() : res.status(403).json({ error: 'Residents can only use their own portal.' });
  }

  if (method === 'GET') return next();

  if (role === 'Admin') return next();

  // staff accounts: only an Admin can add or remove them; everyone else may only edit their own record
  // (the route itself checks that the :id is really theirs)
  if (req.path.startsWith('/staff')) {
    if (method === 'PUT' && STAFF_ITEM.test(req.path)) return next();
    return res.status(403).json({ error: 'Only an Admin can add or remove staff accounts.' });
  }

  // announcements: Staff and Official can post, and edit / delete their own (the route checks ownership)
  if (role === 'Staff' || role === 'Official') {
    if (method === 'POST' && req.path === '/announcements') return next();
    if ((method === 'PUT' || method === 'DELETE') && ANNOUNCEMENT_ITEM.test(req.path)) return next();
  }

  if (role === 'Staff' && method !== 'DELETE') return next();
  if (role === 'Official' && method === 'PATCH') return next();

  return res.status(403).json({ error: `Role ${role} is not allowed to ${method} ${req.path}` });
}

// Mounted once:  app.use('/api', guard)
function guard(req, res, next) {
  if (PUBLIC_PATHS.includes(req.path) || req.path.startsWith('/verify/')) return next();
  authenticate(req, res, async () => {
    // a removed (Inactive / Banned) staff account must stop working right away, not when its 8-hour token expires
    if (req.user.role !== 'Resident') {
      try {
        const acc = await prisma.privateAccount.findUnique({ where: { accountId: req.user.accountId }, select: { accountStatus: true } });
        if (!acc || acc.accountStatus !== 'Active') return res.status(401).json({ error: 'This account is no longer active.' });
      } catch (e) {
        return res.status(500).json({ error: 'Could not verify the account.' });
      }
    }
    // residents are not in PrivateAccount, so their writes are logged without an account id
    const actor = req.user.role === 'Resident' ? null : { accountId: req.user.accountId };
    actorStore.run(actor, () => rolePolicy(req, res, next));
  });
}

module.exports = { guard, authenticate, rolePolicy };
