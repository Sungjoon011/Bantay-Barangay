// junction.js : the two many-to-many relationships (each junction table has its own columns).
//   BlotterParty    : IncidentBlotter <-> Resident  (partyRole, statement, statementDate)
//   ResidentProgram : BarangayProgram <-> Resident  (registeredAt, attendanceStatus, recordedByStaffId)
const { pick, int, handle } = require('../utils');

module.exports = function registerJunctionRoutes(app, prisma) {
  // ---------------- BLOTTER PARTIES ----------------
  app.post('/api/blotters/:id/parties', handle(async (req, res) => {
    const { residentId, partyRole, statement } = req.body;
    if (!residentId || !partyRole) {
      return res.status(400).json({ error: 'residentId and partyRole (Complainant, Respondent or Witness) are required.' });
    }
    const party = await prisma.blotterParty.create({
      data: { caseId: int(req.params.id), residentId: int(residentId), partyRole, statement },
    });
    res.status(201).json(party);
  }));

  app.get('/api/blotters/:id/parties', handle(async (req, res) => {
    const parties = await prisma.blotterParty.findMany({
      where: { caseId: int(req.params.id) },
      include: { resident: { select: { firstName: true, lastName: true } } },
    });
    res.status(200).json(parties);
  }));

  // ---------------- PROGRAMS ----------------
  app.post('/api/programs', handle(async (req, res) => {
    const { createdByStaffId, title, venue, programDate } = req.body;
    if (!createdByStaffId || !title || !venue || !programDate) {
      return res.status(400).json({ error: 'createdByStaffId, title, venue and programDate are required.' });
    }
    const program = await prisma.barangayProgram.create({
      data: {
        ...pick(req.body, ['title', 'description', 'venue']),
        createdByStaffId: int(createdByStaffId),
        programDate: new Date(programDate),
      },
    });
    res.status(201).json(program);
  }));

  app.get('/api/programs', handle(async (req, res) => {
    const programs = await prisma.barangayProgram.findMany({
      include: { participants: { include: { resident: { select: { firstName: true, lastName: true } } } } },
      orderBy: { programDate: 'desc' },
    });
    res.status(200).json(programs);
  }));

  app.post('/api/programs/:id/register', handle(async (req, res) => {
    const { residentId, recordedByStaffId } = req.body;
    if (!residentId) return res.status(400).json({ error: 'residentId is required.' });
    const entry = await prisma.residentProgram.create({
      data: {
        programId: int(req.params.id),
        residentId: int(residentId),
        recordedByStaffId: recordedByStaffId ? int(recordedByStaffId) : null,
      },
    });
    res.status(201).json(entry);
  }));

  app.patch('/api/programs/:id/residents/:residentId/attendance', handle(async (req, res) => {
    const { attendanceStatus } = req.body; // Registered, Attended, NoShow or Cancelled
    if (!attendanceStatus) return res.status(400).json({ error: 'attendanceStatus is required.' });
    const entry = await prisma.residentProgram.update({
      where: { programId_residentId: { programId: int(req.params.id), residentId: int(req.params.residentId) } },
      data: { attendanceStatus },
    });
    res.status(200).json(entry);
  }));
};
