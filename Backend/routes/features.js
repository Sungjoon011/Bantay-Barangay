// features.js : README features: document verification, reports, blotter history, fee schedule.
const { handle } = require('../utils');

module.exports = function registerFeatureRoutes(app, prisma) {
  // PUBLIC (no login): anyone can check a document code printed on a certificate
  app.get('/api/verify/:code', handle(async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const rows = await prisma.$queryRaw`
      SELECT d."documentType", d."status"::TEXT AS status, d."requestDate", r."firstName", left(r."lastName", 1) AS initial
      FROM "DocumentRequest" d JOIN "Resident" r ON r."residentId" = d."residentId"
      WHERE d."verificationCode" = ${code}`;
    const d = rows[0];
    if (!d || !['Ready', 'Claimed'].includes(d.status)) return res.status(404).json({ valid: false });
    res.status(200).json({ valid: true, documentType: d.documentType, issuedTo: `${d.firstName} ${d.initial}.`, requestDate: d.requestDate });
  }));

  // Reports for Staff, Official and Admin (residents are blocked by middleware/auth.js)
  app.get('/api/reports/:name', handle(async (req, res) => {
    const q = {
      population: () => prisma.$queryRaw`SELECT * FROM fn_report_population()`,
      incidents: () => prisma.$queryRaw`SELECT * FROM fn_report_incidents()`,
      requests: () => prisma.$queryRaw`SELECT * FROM fn_report_requests()`,
      revenue: () => prisma.$queryRaw`SELECT * FROM fn_report_revenue()`,
      registry: () => prisma.$queryRaw`SELECT * FROM fn_report_registry()`,
      duplicates: () => prisma.$queryRaw`SELECT * FROM vw_duplicate_residents`,
    }[req.params.name];
    if (!q) return res.status(404).json({ error: 'Reports: population, registry, duplicates, incidents, requests, revenue.' });
    res.status(200).json(await q());
  }));

  app.get('/api/blotters/:id/history', handle(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    res.status(200).json(await prisma.$queryRaw`SELECT * FROM "BlotterHistory" WHERE "caseId" = ${id} ORDER BY "historyId"`);
  }));

  // Fee schedule: everyone logged in can read, only Admin can change
  app.get('/api/fees', handle(async (req, res) => {
    const rows = await prisma.$queryRaw`SELECT "documentType", "fee"::FLOAT8 AS fee FROM "DocumentFee" ORDER BY 1`;
    res.status(200).json(rows);
  }));

  app.put('/api/fees/:type', handle(async (req, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only an Admin can change fees.' });
    const fee = Number(req.body.fee);
    if (!(fee >= 0)) return res.status(400).json({ error: 'fee must be 0 or more.' });
    const n = await prisma.$executeRaw`UPDATE "DocumentFee" SET "fee" = ${fee} WHERE "documentType" = ${req.params.type}`;
    res.status(n ? 200 : 404).json(n ? { documentType: req.params.type, fee } : { error: 'Unknown document type.' });
  }));
};
