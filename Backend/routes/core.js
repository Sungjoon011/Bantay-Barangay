// core.js : households, resident update/archive, documents, staff accounts, blotters.
// Registered from server.js with:  require('./routes/core')(app, prisma);
const bcrypt = require('bcryptjs');
const { pick, int, handle, cleanName, findDuplicateResident, duplicateMessage } = require('../utils');

module.exports = function registerCoreRoutes(app, prisma) {
  // ---------------- HOUSEHOLDS ----------------
  app.post('/api/households', handle(async (req, res) => {
    const { addressDetails, purokZone } = req.body;
    if (!addressDetails || !purokZone) {
      return res.status(400).json({ error: 'addressDetails and purokZone are required.' });
    }
    const household = await prisma.household.create({ data: { addressDetails, purokZone } });
    res.status(201).json(household);
  }));

  app.get('/api/households', handle(async (req, res) => {
    const households = await prisma.household.findMany({ include: { residents: true } });
    res.status(200).json(households);
  }));

  // ---------------- RESIDENTS (update + archive; list/create are in extra.js) ----------------
  app.put('/api/residents/:id', handle(async (req, res) => {
    const data = pick(req.body, ['firstName', 'lastName', 'gender', 'civilStatus', 'contactNumber', 'recordStatus']);
    if (req.body.birthDate) data.birthDate = new Date(req.body.birthDate);
    if (req.body.householdId) data.householdId = int(req.body.householdId);
    const id = int(req.params.id);
    if (data.firstName !== undefined) data.firstName = cleanName(data.firstName);
    if (data.lastName !== undefined) data.lastName = cleanName(data.lastName);
    if (data.firstName === '' || data.lastName === '') return res.status(400).json({ error: 'Names cannot be empty.' });
    // changing the name or birth date must not turn this resident into a copy of someone else
    if (data.firstName !== undefined || data.lastName !== undefined || data.birthDate) {
      const cur = await prisma.resident.findUnique({ where: { residentId: id } });
      if (!cur) return res.status(404).json({ error: 'Resident not found.' });
      const dup = await findDuplicateResident(prisma, data.firstName ?? cur.firstName, data.lastName ?? cur.lastName, data.birthDate ?? cur.birthDate, id);
      if (dup) return res.status(409).json({ error: duplicateMessage(dup), existingResidentId: dup.residentId, existingResidentCode: dup.residentCode });
    }
    let resident;
    try { resident = await prisma.resident.update({ where: { residentId: id }, data }); }
    catch (e) { if (e.code === 'P2002') return res.status(409).json({ error: 'That would duplicate an existing resident.' }); throw e; }
    res.status(200).json(resident);
  }));

  // Soft delete: the record stays, its status becomes "Moved" (Admin only, see middleware/auth.js)
  app.delete('/api/residents/:id', handle(async (req, res) => {
    const resident = await prisma.resident.update({
      where: { residentId: int(req.params.id) },
      data: { recordStatus: 'Moved' },
    });
    res.status(200).json({ message: 'Resident archived.', resident });
  }));

  // ---------------- DOCUMENT REQUESTS (the workflow itself is the stored procedure in extra.js) ----------------
  app.post('/api/documents', handle(async (req, res) => {
    const { residentId, documentType, purpose } = req.body;
    if (!residentId || !documentType || !purpose) {
      return res.status(400).json({ error: 'residentId, documentType and purpose are required.' });
    }
    const request = await prisma.documentRequest.create({
      data: { residentId: int(residentId), documentType, purpose },
    });
    res.status(201).json(request);
  }));

  app.get('/api/documents', handle(async (req, res) => {
    const documents = await prisma.documentRequest.findMany({
      include: { resident: { select: { firstName: true, lastName: true } }, payment: true },
      orderBy: { requestDate: 'desc' },
      take: 200,
    });
    res.status(200).json(documents);
  }));

  // ---------------- STAFF ACCOUNTS ----------------
  // Admin: sees every account, can add and remove staff.
  // Staff / Official: see and edit ONLY their own account (the route :id is the accountId). The hash is never returned.
  app.post('/api/staff', handle(async (req, res) => {
    const { email, password, systemRole, firstName, lastName, positionTitle } = req.body;
    if (!email || !password || !systemRole || !firstName || !lastName || !positionTitle) {
      return res.status(400).json({ error: 'email, password, systemRole, firstName, lastName and positionTitle are required.' });
    }
    if (!['Admin', 'Staff', 'Official'].includes(systemRole)) {
      return res.status(400).json({ error: 'systemRole must be Admin, Staff or Official.' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    let account;
    try {
      account = await prisma.privateAccount.create({
        data: {
          email: String(email).trim(),
          passwordHash: await bcrypt.hash(password, 10),
          systemRole,
          staffProfile: { create: { firstName: cleanName(firstName), lastName: cleanName(lastName), positionTitle: cleanName(positionTitle) } },
        },
        include: { staffProfile: true },
      });
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'That email is already used by another account.' });
      throw e;
    }
    const { passwordHash, ...safe } = account;
    res.status(201).json(safe);
  }));

  app.get('/api/staff', handle(async (req, res) => {
    const staff = await prisma.privateAccount.findMany({
      where: req.user.role === 'Admin' ? {} : { accountId: req.user.accountId }, // not an Admin = only yourself
      select: { accountId: true, email: true, systemRole: true, accountStatus: true, staffProfile: true },
      orderBy: { accountId: 'asc' },
    });
    res.status(200).json(staff);
  }));

  // Admin only (see middleware/auth.js). Accounts are not erased because audit logs, documents and announcements point to them:
  // "remove" = the account becomes Inactive (cannot log in any more) and the staff record becomes Resigned.
  app.delete('/api/staff/:id', handle(async (req, res) => {
    const id = int(req.params.id);
    if (id === req.user.accountId) return res.status(400).json({ error: 'You cannot remove your own account.' });
    const target = await prisma.privateAccount.findUnique({ where: { accountId: id }, include: { staffProfile: true } });
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });
    if (target.systemRole === 'Admin' && target.accountStatus === 'Active') {
      const admins = await prisma.privateAccount.count({ where: { systemRole: 'Admin', accountStatus: 'Active' } });
      if (admins <= 1) return res.status(400).json({ error: 'You cannot remove the last active Admin.' });
    }
    const account = await prisma.privateAccount.update({
      where: { accountId: id },
      data: { accountStatus: 'Inactive', ...(target.staffProfile ? { staffProfile: { update: { recordStatus: 'Resigned' } } } : {}) },
      select: { accountId: true, email: true, systemRole: true, accountStatus: true, staffProfile: true },
    });
    res.status(200).json({ message: 'Staff account removed (set to Inactive).', account });
  }));

  // ---------------- INCIDENT BLOTTERS ----------------
  app.post('/api/blotters', handle(async (req, res) => {
    const { dateOfIncident, incidentType, complainantResidentId, respondentName, description, recordedByStaffId } = req.body;
    if (!dateOfIncident || !incidentType || !complainantResidentId || !respondentName || !description || !recordedByStaffId) {
      return res.status(400).json({ error: 'dateOfIncident, incidentType, complainantResidentId, respondentName, description and recordedByStaffId are required.' });
    }
    const blotter = await prisma.incidentBlotter.create({
      data: {
        dateOfIncident: new Date(dateOfIncident),
        incidentType,
        respondentName,
        description,
        ...(req.body.confidentialityLevel ? { confidentialityLevel: req.body.confidentialityLevel } : {}),
        complainant: { connect: { residentId: int(complainantResidentId) } },
        recordedBy: { connect: { staffId: int(recordedByStaffId) } },
      },
    });
    res.status(201).json(blotter);
  }));

  // Query-level data isolation: Staff never see VAWC / Restricted cases
  app.get('/api/blotters', handle(async (req, res) => {
    const blotters = await prisma.incidentBlotter.findMany({
      where: req.user.role === 'Staff' ? { confidentialityLevel: 'Standard' } : {},
      include: {
        complainant: { select: { firstName: true, lastName: true } },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { dateOfIncident: 'desc' },
      take: 200,
    });
    res.status(200).json(blotters);
  }));

  app.patch('/api/blotters/:id/status', handle(async (req, res) => {
    const { status } = req.body; // Open, Ongoing or Resolved
    if (!status) return res.status(400).json({ error: 'status is required.' });
    const blotter = await prisma.incidentBlotter.update({
      where: { caseId: int(req.params.id) },
      data: { status },
    });
    res.status(200).json(blotter);
  }));
};
