// resident.js : the resident (Standard Client) side. Residents only ever see their OWN rows.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { int, handle, manilaDate, manilaTime } = require('../utils');

// Barangay hall pick-up rules for cash payments / printed copies. Edit these to match the real office hours.
const PICKUP = { days: [1, 2, 3, 4, 5], open: '08:00', close: '17:00' }; // 1 = Monday ... 5 = Friday


// returns an error message, or null when the slot is fine
function checkPickupSlot(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return 'scheduledDate must be YYYY-MM-DD.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'scheduledTime must be HH:MM.';
  if (date < manilaDate()) return 'Pick a date that is today or later.';
  if (date === manilaDate() && time <= manilaTime()) return 'That time has already passed today.';
  if (!PICKUP.days.includes(new Date(date + 'T00:00:00Z').getUTCDay())) return 'The barangay hall is open Monday to Friday only.';
  if (time < PICKUP.open || time > PICKUP.close) return `Please visit between ${PICKUP.open} and ${PICKUP.close}.`;
  return null;
}

module.exports = function registerResidentRoutes(app, prisma) {
  // PUBLIC: a resident claims the record staff created for them (lastName + birthDate must match)
  app.post('/api/resident/register', handle(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const lastName = String(req.body.lastName || '').trim().replace(/\s+/g, ' ');
    const birthDate = String(req.body.birthDate || '').slice(0, 10);
    if (!email || !password || !lastName || !birthDate) {
      return res.status(400).json({ error: 'email, password, lastName and birthDate are required.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (Number.isNaN(Date.parse(birthDate))) return res.status(400).json({ error: 'birthDate must be YYYY-MM-DD.' });
    const matches = await prisma.resident.findMany({
      where: { lastName: { equals: lastName, mode: 'insensitive' }, birthDate: new Date(birthDate) },
    });
    if (!matches.length) return res.status(404).json({ error: 'No resident record matches that surname and birth date. Ask the barangay hall to add you first.' });
    const resident = matches.find((r) => !r.accountId);
    if (!resident) return res.status(409).json({ error: 'This resident already has an online account. Sign in instead, or ask the barangay hall to help.' });
    const taken = await prisma.publicAccount.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (taken) return res.status(409).json({ error: 'That email is already used by another account.' });
    await prisma.publicAccount.create({
      data: { email, passwordHash: await bcrypt.hash(password, 10), residentProfile: { connect: { residentId: resident.residentId } } },
    });
    res.status(201).json({ message: 'Account created. You can log in now.' });
  }));

  // PUBLIC: resident login (token carries role "Resident" and the resident's own id)
  app.post('/api/resident/login', handle(async (req, res) => {
    const { email, password } = req.body;
    const acc = await prisma.publicAccount.findFirst({ where: { email: { equals: String(email || '').trim(), mode: 'insensitive' } }, include: { residentProfile: true } });
    if (!acc || !acc.residentProfile) return res.status(404).json({ error: 'Account not found' });
    if (acc.accountStatus !== 'Active') return res.status(403).json({ error: 'Account is not active.' });
    if (!(await bcrypt.compare(password || '', acc.passwordHash))) return res.status(401).json({ error: 'Incorrect password' });
    const token = jwt.sign({ accountId: acc.accountId, role: 'Resident', residentId: acc.residentProfile.residentId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.status(200).json({ message: 'Login successful', token });
  }));

  const mine = (req, res, next) => (req.user.role === 'Resident' ? next() : res.status(403).json({ error: 'Residents only.' }));

  // PRIVATE: everything is filtered by the resident id inside the token, never by a client value
  app.get('/api/me', mine, handle(async (req, res) => {
    const id = req.user.residentId;
    const [profile, documents, complaints, appointments] = await Promise.all([
      prisma.resident.findUnique({ where: { residentId: id }, include: { household: true } }),
      prisma.documentRequest.findMany({ where: { residentId: id }, include: { payment: true }, orderBy: { requestDate: 'desc' } }),
      prisma.incidentBlotter.findMany({ where: { complainantId: id }, orderBy: { dateOfIncident: 'desc' } }),
      prisma.appointment.findMany({ where: { residentId: id }, orderBy: { scheduledDate: 'desc' } }),
    ]);
    res.status(200).json({ profile, documents, complaints, appointments });
  }));

  // fees + hall pick-up rules, so the portal never hard-codes prices
  app.get('/api/me/options', mine, handle(async (req, res) => {
    const fees = await prisma.$queryRaw`SELECT "documentType", "fee"::FLOAT8 AS fee FROM "DocumentFee" ORDER BY "documentType"`;
    res.status(200).json({ fees, pickup: PICKUP });
  }));

  // A request and its payment record are created together, so "Pay online" / "Pay cash" work right away.
  // (The fee itself is stamped by the trg_apply_fee trigger from the DocumentFee table.)
  app.post('/api/me/documents', mine, handle(async (req, res) => {
    const { documentType, purpose } = req.body;
    if (!documentType || !purpose) return res.status(400).json({ error: 'documentType and purpose are required.' });
    const rows = await prisma.$queryRaw`SELECT "fee"::FLOAT8 AS fee FROM "DocumentFee" WHERE "documentType" = ${String(documentType)}`;
    if (!rows.length) return res.status(400).json({ error: 'Unknown document type.' });
    // a double click must not create the same request twice
    const recent = await prisma.documentRequest.findFirst({ where: { residentId: req.user.residentId, documentType, purpose, requestDate: { gte: new Date(Date.now() - 60000) } } });
    if (recent) return res.status(409).json({ error: 'You already submitted this request a moment ago.' });
    const fee = rows[0].fee;
    const free = fee === 0; // nothing to settle for a free document
    const created = await prisma.documentRequest.create({
      data: {
        residentId: req.user.residentId, documentType, purpose,
        payment: { create: { transactionType: 'Document', amount: fee, paymentMethod: 'Cash', paymentStatus: free ? 'Paid' : 'Unpaid', datePaid: free ? new Date() : undefined } },
      },
      include: { payment: true },
    });
    res.status(201).json(created);
  }));

  // Pay CASH (or collect a free document): book the barangay-hall visit for this document.
  // The payment stays Unpaid until staff record it at the counter.
  app.post('/api/me/documents/:id/pickup', mine, handle(async (req, res) => {
    const date = String(req.body.scheduledDate || ''), time = String(req.body.scheduledTime || '');
    const problem = checkPickupSlot(date, time);
    if (problem) return res.status(400).json({ error: problem });

    const id = int(req.params.id);
    const doc = await prisma.documentRequest.findFirst({ where: { requestId: id, residentId: req.user.residentId }, include: { payment: true } });
    if (!doc) return res.status(404).json({ error: 'Document request not found.' });
    if (['Rejected', 'Claimed', 'Cancelled'].includes(doc.status)) return res.status(400).json({ error: `This request is already ${doc.status.toLowerCase()}.` });

    const tag = `(Request #${id})`;
    const booked = await prisma.appointment.findFirst({ where: { residentId: req.user.residentId, status: 'Upcoming', purpose: { contains: tag } } });
    if (booked) return res.status(400).json({ error: 'You already have an upcoming visit booked for this document.' });

    const owes = !!doc.payment && doc.payment.paymentStatus === 'Unpaid';
    const ops = [prisma.appointment.create({ data: {
      residentId: req.user.residentId,
      purpose: `${owes ? 'Pay cash & pick up' : 'Pick up'} ${doc.documentType} ${tag}`,
      scheduledDate: new Date(date),
      scheduledTime: new Date(`1970-01-01T${time}:00Z`),
    } })];
    if (owes) ops.push(prisma.payment.update({ where: { requestId: id }, data: { paymentMethod: 'Cash' } }));
    const [appointment] = await prisma.$transaction(ops);
    res.status(201).json({ appointment, amountDue: owes ? Number(doc.payment.amount) : 0 });
  }));

  app.post('/api/me/complaints', mine, handle(async (req, res) => {
    const { incidentType, respondentName, description, dateOfIncident } = req.body;
    if (!incidentType || !respondentName || !description || !dateOfIncident) {
      return res.status(400).json({ error: 'incidentType, respondentName, description and dateOfIncident are required.' });
    }
    // the same report that is still being handled is not filed twice (double click / resubmit)
    const dup = await prisma.incidentBlotter.findFirst({ where: { complainantId: req.user.residentId, incidentType, respondentName, description, dateOfIncident: new Date(dateOfIncident), status: { not: 'Resolved' } } });
    if (dup) return res.status(409).json({ error: `You already filed this report (Case #${dup.caseId}). Check Incident / Complaint Status.` });
    res.status(201).json(await prisma.incidentBlotter.create({
      data: { complainantId: req.user.residentId, incidentType, respondentName, description, dateOfIncident: new Date(dateOfIncident) },
    }));
  }));

  app.post('/api/me/appointments', mine, handle(async (req, res) => {
    const { purpose, scheduledDate, scheduledTime } = req.body;
    if (!purpose || !scheduledDate || !scheduledTime) return res.status(400).json({ error: 'purpose, scheduledDate and scheduledTime are required.' });
    const problem = checkPickupSlot(String(scheduledDate), String(scheduledTime)); // same rules as a pick-up visit: real-time, no past dates
    if (problem) return res.status(400).json({ error: problem });
    res.status(201).json(await prisma.appointment.create({
      data: { residentId: req.user.residentId, purpose, scheduledDate: new Date(scheduledDate), scheduledTime: new Date(`1970-01-01T${scheduledTime}:00Z`) },
    }));
  }));
  // Cancel a request the resident no longer wants. Allowed only while nothing has been paid
  // (unpaid, or a free document) and the document is not yet released. Any booked hall visit is cancelled too.
  app.post('/api/me/documents/:id/cancel', mine, handle(async (req, res) => {
    const id = int(req.params.id);
    const doc = await prisma.documentRequest.findFirst({ where: { requestId: id, residentId: req.user.residentId }, include: { payment: true } });
    if (!doc) return res.status(404).json({ error: 'Document request not found.' });
    if (doc.status === 'Cancelled') return res.status(400).json({ error: 'This request is already cancelled.' });
    if (['Claimed', 'Rejected'].includes(doc.status)) return res.status(400).json({ error: `This request is already ${doc.status.toLowerCase()}.` });
    const paidFee = !!doc.payment && doc.payment.paymentStatus === 'Paid' && Number(doc.payment.amount) > 0;
    if (paidFee) return res.status(400).json({ error: 'This document is already paid. Please contact the Barangay Hall to cancel or ask for a refund.' });

    const tag = `(Request #${id})`;
    const [changed] = await prisma.$transaction([
      prisma.documentRequest.updateMany({ where: { requestId: id, residentId: req.user.residentId, status: { in: ['Pending', 'Processing', 'Ready'] } }, data: { status: 'Cancelled' } }),
      prisma.appointment.updateMany({ where: { residentId: req.user.residentId, status: 'Upcoming', purpose: { contains: tag } }, data: { status: 'Cancelled' } }),
    ]);
    if (!changed.count) return res.status(400).json({ error: 'This request can no longer be cancelled.' });
    res.status(200).json({ message: 'Request cancelled.' });
  }));
};
