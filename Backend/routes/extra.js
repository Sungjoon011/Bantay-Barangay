// extra.js : the remaining CRUD routes, the stored-procedure endpoints and the dashboard/audit endpoints.
// Registered from server.js with:  require('./routes/extra')(app, prisma);
// Every body is whitelisted with pick() so a client cannot write columns it should not touch.

const bcrypt = require('bcryptjs');
const { pick, int, handle, checkNotPast, cleanName, findDuplicateResident, duplicateMessage } = require('../utils');

const timeOnly = (hhmm) => new Date(`1970-01-01T${hhmm}:00Z`);

module.exports = function registerExtraRoutes(app, prisma) {
  // ---------------- RESIDENTS (read + create) ----------------
  app.get('/api/residents', handle(async (req, res) => {
    const q = req.query.q ? String(req.query.q) : null;
    const residents = await prisma.resident.findMany({
      where: q
        ? { OR: [{ lastName: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }] }
        : {},
      include: { household: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    });
    res.status(200).json(residents);
  }));

  app.get('/api/residents/:id', handle(async (req, res) => {
    const resident = await prisma.resident.findUnique({
      where: { residentId: int(req.params.id) },
      include: { household: true },
    });
    if (!resident) return res.status(404).json({ error: 'Resident not found.' });
    res.status(200).json(resident);
  }));

  app.post('/api/residents', handle(async (req, res) => {
    const { householdId, firstName, lastName, birthDate } = req.body;
    if (!householdId || !firstName || !lastName || !birthDate) {
      return res.status(400).json({ error: 'householdId, firstName, lastName and birthDate are required.' });
    }
    const data = pick(req.body, ['firstName', 'lastName', 'gender', 'civilStatus', 'contactNumber']);
    data.firstName = cleanName(data.firstName); data.lastName = cleanName(data.lastName);
    if (!data.firstName || !data.lastName) return res.status(400).json({ error: 'firstName and lastName cannot be empty.' });
    if (Number.isNaN(Date.parse(birthDate))) return res.status(400).json({ error: 'birthDate must be YYYY-MM-DD.' });
    // no double residents: same first name + last name + birth date is the same person
    const dup = await findDuplicateResident(prisma, data.firstName, data.lastName, birthDate);
    if (dup) return res.status(409).json({ error: duplicateMessage(dup), existingResidentId: dup.residentId, existingResidentCode: dup.residentCode });
    let resident;
    try {
      resident = await prisma.resident.create({ data: { ...data, householdId: int(householdId), birthDate: new Date(birthDate) } });
    } catch (e) {
      // two people pressing Save at the same moment: the database's own unique rule catches the second one
      if (e.code === 'P2002') return res.status(409).json({ error: 'This resident is already registered.' });
      throw e;
    }
    res.status(201).json(resident);
  }));

  // Staff creates the online (portal) account for a resident who is already in the registry.
  // Admin and Staff only (see middleware/auth.js). The resident can change nothing about the record, only log in.
  app.post('/api/residents/:id/account', handle(async (req, res) => {
    const id = int(req.params.id);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const resident = await prisma.resident.findUnique({ where: { residentId: id } });
    if (!resident) return res.status(404).json({ error: 'Resident not found.' });
    if (resident.accountId) return res.status(409).json({ error: 'This resident already has an online account.' });
    const taken = await prisma.publicAccount.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (taken) return res.status(409).json({ error: 'That email is already used by another account.' });
    await prisma.publicAccount.create({
      data: { email, passwordHash: await bcrypt.hash(password, 10), residentProfile: { connect: { residentId: id } } },
    });
    res.status(201).json({ message: 'Online account created. The resident can now sign in at the Resident Portal.' });
  }));

  // ---------------- HOUSEHOLDS ----------------
  app.get('/api/households/:id', handle(async (req, res) => {
    const household = await prisma.household.findUnique({
      where: { householdId: int(req.params.id) },
      include: { residents: true },
    });
    if (!household) return res.status(404).json({ error: 'Household not found.' });
    res.status(200).json(household);
  }));

  app.put('/api/households/:id', handle(async (req, res) => {
    const household = await prisma.household.update({
      where: { householdId: int(req.params.id) },
      data: pick(req.body, ['addressDetails', 'purokZone']),
    });
    res.status(200).json(household);
  }));

  // ---------------- STAFF (hash is never returned) ----------------
  // :id is the accountId (same id the staff list shows).
  //   Admin  : can edit anyone: name, position, account status (Active again / Inactive), role (not their own).
  //   others : can edit ONLY their own name and position.
  app.put('/api/staff/:id', handle(async (req, res) => {
    const id = int(req.params.id);
    const isAdmin = req.user.role === 'Admin';
    if (!isAdmin && id !== req.user.accountId) {
      return res.status(403).json({ error: 'You can only edit your own staff record.' });
    }
    const target = await prisma.privateAccount.findUnique({ where: { accountId: id }, include: { staffProfile: true } });
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });

    const profile = pick(req.body, ['firstName', 'lastName', 'positionTitle']);
    Object.keys(profile).forEach((k) => { profile[k] = cleanName(profile[k]); });
    if (Object.values(profile).some((v) => v === '')) return res.status(400).json({ error: 'Name and position cannot be empty.' });

    const account = {};
    if (isAdmin) {
      if (req.body.systemRole !== undefined) {
        if (!['Admin', 'Staff', 'Official'].includes(req.body.systemRole)) return res.status(400).json({ error: 'systemRole must be Admin, Staff or Official.' });
        if (id === req.user.accountId && req.body.systemRole !== target.systemRole) return res.status(400).json({ error: 'You cannot change your own role.' });
        account.systemRole = req.body.systemRole;
      }
      if (req.body.accountStatus !== undefined) {
        if (!['Active', 'Inactive', 'Banned'].includes(req.body.accountStatus)) return res.status(400).json({ error: 'accountStatus must be Active, Inactive or Banned.' });
        if (id === req.user.accountId && req.body.accountStatus !== 'Active') return res.status(400).json({ error: 'You cannot deactivate your own account.' });
        account.accountStatus = req.body.accountStatus;
        profile.recordStatus = req.body.accountStatus === 'Active' ? 'Active' : 'Resigned'; // keep both in step
      }
    }
    if (!Object.keys(profile).length && !Object.keys(account).length) return res.status(400).json({ error: 'Nothing to update.' });
    if (!target.staffProfile && Object.keys(profile).length) return res.status(400).json({ error: 'This account has no staff record.' });

    const updated = await prisma.privateAccount.update({
      where: { accountId: id },
      data: { ...account, ...(Object.keys(profile).length ? { staffProfile: { update: profile } } : {}) },
      select: { accountId: true, email: true, systemRole: true, accountStatus: true, staffProfile: true },
    });
    res.status(200).json(updated);
  }));

  // ---------------- DOCUMENT REQUESTS ----------------
  app.put('/api/documents/:id', handle(async (req, res) => {
    const doc = await prisma.documentRequest.update({
      where: { requestId: int(req.params.id) },
      data: pick(req.body, ['documentType', 'purpose']),
    });
    res.status(200).json(doc);
  }));

  // Stored procedure: status workflow + payment record (one transaction inside PostgreSQL)
  app.patch('/api/documents/:id/process', handle(async (req, res) => {
    const { newStatus, amount, method } = req.body;
    if (!newStatus) return res.status(400).json({ error: 'newStatus is required.' });

    const staff = await prisma.staffOfficial.findUnique({ where: { accountId: req.user.accountId } });
    if (!staff) return res.status(403).json({ error: 'Your account has no staff profile.' });

    const id = int(req.params.id);
    await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('app.account_id', ${String(req.user.accountId)}, true)`,
      prisma.$executeRaw`CALL sp_process_document_request(${id}::integer, ${staff.staffId}::integer, ${String(newStatus)}::text, ${Number(amount ?? 50)}::numeric, ${String(method || 'Cash')}::text)`,
    ]);

    const doc = await prisma.documentRequest.findUnique({ where: { requestId: id }, include: { payment: true } });
    res.status(200).json(doc);
  }));

  // Stored procedure: record payment
  app.patch('/api/documents/:id/payment', handle(async (req, res) => {
    if (req.user.role === 'Official') {
      return res.status(403).json({ error: 'Payments are recorded by Admin or Staff.' });
    }
    const { orNumber, method } = req.body;
    if (!orNumber) return res.status(400).json({ error: 'orNumber is required.' });

    const id = int(req.params.id);
    await prisma.$transaction([
      prisma.$executeRaw`SELECT set_config('app.account_id', ${String(req.user.accountId)}, true)`,
      prisma.$executeRaw`CALL sp_record_payment(${id}::integer, ${String(orNumber)}::text, ${String(method || 'Cash')}::text)`,
    ]);

    const doc = await prisma.documentRequest.findUnique({ where: { requestId: id }, include: { payment: true } });
    res.status(200).json(doc);
  }));

  // ---------------- BLOTTERS ----------------
  app.put('/api/blotters/:id', handle(async (req, res) => {
    const data = pick(req.body, ['respondentName', 'incidentType', 'description', 'confidentialityLevel']);
    if (req.body.dateOfIncident) data.dateOfIncident = new Date(req.body.dateOfIncident);
    const blotter = await prisma.incidentBlotter.update({ where: { caseId: int(req.params.id) }, data });
    res.status(200).json(blotter);
  }));

  // ---------------- APPOINTMENTS ----------------
  app.get('/api/appointments', handle(async (req, res) => {
    const rows = await prisma.appointment.findMany({
      include: { resident: { select: { firstName: true, lastName: true } } },
      orderBy: { scheduledDate: 'desc' },
      take: 200,
    });
    res.status(200).json(rows);
  }));

  app.post('/api/appointments', handle(async (req, res) => {
    const { residentId, purpose, scheduledDate, scheduledTime } = req.body;
    if (!residentId || !purpose || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ error: 'residentId, purpose, scheduledDate (YYYY-MM-DD) and scheduledTime (HH:MM) are required.' });
    }
    const problem = checkNotPast(scheduledDate, scheduledTime); // real-time (Philippine time): no past dates
    if (problem) return res.status(400).json({ error: problem });
    const row = await prisma.appointment.create({
      data: { residentId: int(residentId), purpose, scheduledDate: new Date(scheduledDate), scheduledTime: timeOnly(scheduledTime) },
    });
    res.status(201).json(row);
  }));

  app.put('/api/appointments/:id', handle(async (req, res) => {
    const data = pick(req.body, ['purpose', 'status']);
    if (req.body.scheduledDate || req.body.scheduledTime) {
      // only a CHANGED date/time must be in the future (re-saving an old appointment's status is fine)
      const old = await prisma.appointment.findUnique({ where: { appointmentId: int(req.params.id) } });
      if (!old) return res.status(404).json({ error: 'Appointment not found.' });
      const oldDate = old.scheduledDate.toISOString().slice(0, 10), oldTime = old.scheduledTime.toISOString().slice(11, 16);
      const newDate = req.body.scheduledDate ? String(req.body.scheduledDate).slice(0, 10) : oldDate;
      const newTime = req.body.scheduledTime ? String(req.body.scheduledTime).slice(0, 5) : oldTime;
      if (newDate !== oldDate || newTime !== oldTime) {
        const problem = checkNotPast(newDate, newTime);
        if (problem) return res.status(400).json({ error: problem });
      }
    }
    if (req.body.scheduledDate) data.scheduledDate = new Date(req.body.scheduledDate);
    if (req.body.scheduledTime) data.scheduledTime = timeOnly(req.body.scheduledTime);
    const row = await prisma.appointment.update({ where: { appointmentId: int(req.params.id) }, data });
    res.status(200).json(row);
  }));

  // ---------------- BUSINESS PERMITS ----------------
  app.get('/api/permits', handle(async (req, res) => {
    const rows = await prisma.businessPermit.findMany({
      include: { resident: { select: { firstName: true, lastName: true } }, payment: true },
      orderBy: { applicationDate: 'desc' },
      take: 200,
    });
    res.status(200).json(rows);
  }));

  app.post('/api/permits', handle(async (req, res) => {
    const { residentId, businessName, businessType, applicationDate } = req.body;
    if (!residentId || !businessName || !businessType || !applicationDate) {
      return res.status(400).json({ error: 'residentId, businessName, businessType and applicationDate are required.' });
    }
    const row = await prisma.businessPermit.create({
      data: { residentId: int(residentId), businessName, businessType, applicationDate: new Date(applicationDate) },
    });
    res.status(201).json(row);
  }));

  app.put('/api/permits/:id', handle(async (req, res) => {
    const row = await prisma.businessPermit.update({
      where: { permitId: int(req.params.id) },
      data: pick(req.body, ['businessName', 'businessType']),
    });
    res.status(200).json(row);
  }));

  // Approving a permit is done by an Official (PATCH)
  app.patch('/api/permits/:id/status', handle(async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required.' });
    const staff = await prisma.staffOfficial.findUnique({ where: { accountId: req.user.accountId } });
    const row = await prisma.businessPermit.update({
      where: { permitId: int(req.params.id) },
      data: { status, approvedByStaffId: staff ? staff.staffId : null },
    });
    res.status(200).json(row);
  }));

  // ---------------- PAYMENTS (read only: money records are created by the stored procedures) ----------------
  app.get('/api/payments', handle(async (req, res) => {
    const rows = await prisma.payment.findMany({ orderBy: { paymentId: 'desc' }, take: 200 });
    res.status(200).json(rows);
  }));

  // ---------------- ANNOUNCEMENTS ----------------
  // Audience values:
  //   "All"        = everyone: every staff / official / admin account AND every resident
  //   "Residents"  = all residents
  //   "<a purok>"  = only residents of that purok (Purok 1, Purok 2, ...)
  // Staff, Official and Admin see every announcement in the console (they manage them).
  // A resident sees "All", "Residents" and their OWN purok; another purok's announcement is hidden (decided here on the server).
  const PRIORITIES = ['Normal', 'Important', 'Emergency'];
  const lower = (x) => String(x == null ? '' : x).trim().toLowerCase();

  app.get('/api/announcements', handle(async (req, res) => {
    const rows = await prisma.announcement.findMany({
      orderBy: { datePosted: 'desc' },
      take: 200,
      include: { postedBy: { select: { firstName: true, lastName: true } } },
    });
    if (req.user.role !== 'Resident') {
      // add "who posted it" and "may I edit / delete it" (Admin: all; Staff / Official: only their own)
      const me = await prisma.staffOfficial.findUnique({ where: { accountId: req.user.accountId }, select: { staffId: true } });
      return res.status(200).json(rows.map(({ postedBy, ...a }) => ({
        ...a,
        postedByName: postedBy ? `${postedBy.firstName} ${postedBy.lastName}` : '',
        canManage: req.user.role === 'Admin' || (!!me && a.postedByStaffId === me.staffId),
      })));
    }
    const [me, houses] = await Promise.all([
      prisma.resident.findUnique({ where: { residentId: req.user.residentId }, select: { household: { select: { purokZone: true } } } }),
      prisma.household.findMany({ select: { purokZone: true }, distinct: ['purokZone'] }),
    ]);
    const mine = lower(me && me.household && me.household.purokZone);
    const puroks = new Set(houses.map((h) => lower(h.purokZone)));
    res.status(200).json(rows
      .filter((a) => { const aud = lower(a.targetAudience || 'all'); return !puroks.has(aud) || aud === mine; })
      .map(({ postedBy, ...a }) => a));
  }));

  // checks the audience and priority a client sent. Returns { error } or { audience, priority } (only the fields that were sent).
  async function checkAnnouncementFields(body, requireAll) {
    const out = {};
    if (body.priority !== undefined || requireAll) {
      // a typo such as "Emergancy" would silently skip the red banner, so only known priorities are accepted
      const wanted = lower(body.priority || 'Normal');
      const priority = PRIORITIES.find((p) => p.toLowerCase() === wanted);
      if (!priority) return { error: `priority must be one of: ${PRIORITIES.join(', ')}.` };
      out.priority = priority;
    }
    if (body.targetAudience !== undefined || requireAll) {
      const wanted = lower(body.targetAudience || 'All');
      if (wanted === 'all') out.targetAudience = 'All';
      else if (wanted === 'residents') out.targetAudience = 'Residents';
      else {
        const houses = await prisma.household.findMany({ select: { purokZone: true }, distinct: ['purokZone'] });
        const purok = houses.map((h) => h.purokZone).find((p) => lower(p) === wanted);
        if (!purok) return { error: 'targetAudience must be "All" (everyone), "Residents" (all residents) or an existing purok.' };
        out.targetAudience = purok;
      }
    }
    return out;
  }

  // Admin may change any announcement; Staff / Official only the ones they posted
  async function ownAnnouncementOrError(req, res) {
    const row = await prisma.announcement.findUnique({ where: { announcementId: int(req.params.id) } });
    if (!row) { res.status(404).json({ error: 'Announcement not found.' }); return null; }
    if (req.user.role !== 'Admin') {
      const me = await prisma.staffOfficial.findUnique({ where: { accountId: req.user.accountId }, select: { staffId: true } });
      if (!me || me.staffId !== row.postedByStaffId) {
        res.status(403).json({ error: 'You can only change announcements that you posted.' });
        return null;
      }
    }
    return row;
  }

  app.post('/api/announcements', handle(async (req, res) => {
    const { title, messageBody } = req.body;
    if (!title || !messageBody || !String(title).trim() || !String(messageBody).trim()) {
      return res.status(400).json({ error: 'title and messageBody are required.' });
    }
    const f = await checkAnnouncementFields(req.body, true);
    if (f.error) return res.status(400).json({ error: f.error });
    // who posted it: the signed-in staff member (so nobody has to know their staff id); an explicit id is only a fallback
    const staff = await prisma.staffOfficial.findUnique({ where: { accountId: req.user.accountId } });
    const postedByStaffId = staff ? staff.staffId : (req.body.postedByStaffId ? int(req.body.postedByStaffId) : null);
    if (!postedByStaffId) return res.status(400).json({ error: 'Your account is not linked to a staff record, so it cannot post announcements. Ask an Admin to link it, or send postedByStaffId.' });
    const row = await prisma.announcement.create({
      data: { title: String(title).trim(), messageBody: String(messageBody).trim(), targetAudience: f.targetAudience, priority: f.priority, postedByStaffId },
    });
    res.status(201).json(row);
  }));

  app.put('/api/announcements/:id', handle(async (req, res) => {
    if (!(await ownAnnouncementOrError(req, res))) return;
    const data = pick(req.body, ['title', 'messageBody']);
    if (data.title !== undefined) data.title = String(data.title).trim();
    if (data.messageBody !== undefined) data.messageBody = String(data.messageBody).trim();
    if (data.title === '' || data.messageBody === '') return res.status(400).json({ error: 'title and messageBody cannot be empty.' });
    const f = await checkAnnouncementFields(req.body, false);
    if (f.error) return res.status(400).json({ error: f.error });
    Object.assign(data, f);
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update.' });
    const row = await prisma.announcement.update({ where: { announcementId: int(req.params.id) }, data });
    res.status(200).json(row);
  }));

  // needs:  GRANT DELETE ON "Announcement" TO app_user;  (05_integrity_3nf.sql)
  app.delete('/api/announcements/:id', handle(async (req, res) => {
    if (!(await ownAnnouncementOrError(req, res))) return;
    await prisma.announcement.delete({ where: { announcementId: int(req.params.id) } });
    res.status(200).json({ message: 'Announcement deleted.' });
  }));

  // ---------------- DASHBOARD / VIEWS / AUDIT ----------------
  app.get('/api/stats', handle(async (req, res) => {
    const rows = await prisma.$queryRaw`SELECT * FROM fn_barangay_stats()`;
    res.status(200).json(rows[0]);
  }));

  app.get('/api/directory', handle(async (req, res) => {
    const rows = await prisma.$queryRaw`SELECT * FROM vw_resident_directory ORDER BY "lastName", "firstName" LIMIT 200`;
    res.status(200).json(rows);
  }));

  app.get('/api/audit-logs', handle(async (req, res) => {
    if (req.user.role === 'Staff') {
      return res.status(403).json({ error: 'Audit logs are for Admin and Official only.' });
    }
    const rows = await prisma.systemAuditLog.findMany({ orderBy: { logId: 'desc' }, take: 100 });
    res.status(200).json(rows);
  }));
};
