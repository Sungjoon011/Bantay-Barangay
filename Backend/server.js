const express = require('express');
const { PrismaClient } = require('@prisma/client');
const cors = require('cors');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

// ==========================================
// MIDDLEWARE CONFIGURATION
// ==========================================
app.use(cors());
app.use(express.json());

// Serve static frontend UI files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// 1. SYSTEM HEALTH & AUDIT ENDPOINTS
// ==========================================

// System Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    system: 'Bantay-Barangay API Engine v1.0',
    timestamp: new Date().toISOString()
  });
});

// Fetch Audit Logs (Triggers Database Output Verification)
app.get('/api/audit-logs', async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 100,
      orderBy: { changedAt: 'desc' }
    });
    res.json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. INCIDENT MANAGEMENT ROUTES
// ==========================================

// GET: List all incidents (with status query filter)
app.get('/api/incidents', async (req, res) => {
  try {
    const { status } = req.query;
    const incidents = await prisma.incident.findMany({
      where: status ? { status: String(status) } : {},
      include: {
        reporter: {
          select: { id: true, fullName: true, email: true, contactNo: true }
        },
        responders: {
          include: { resident: true }
        }
      },
      orderBy: { reportedAt: 'desc' }
    });
    res.json({ success: true, count: incidents.length, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET: Single Incident Details
app.get('/api/incidents/:id', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id);
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        reporter: true,
        responders: { include: { resident: true } }
      }
    });

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident record not found.' });
    }

    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Create a new Incident Report
app.post('/api/incidents', async (req, res) => {
  try {
    const { reporterId, title, description, location, category } = req.body;

    if (!reporterId || !title || !description || !location) {
      return res.status(400).json({
        success: false,
        error: 'reporterId, title, description, and location are required.'
      });
    }

    const incident = await prisma.incident.create({
      data: {
        reporterId: parseInt(reporterId),
        title,
        description,
        location,
        category: category || 'GENERAL',
        status: 'REPORTED'
      }
    });

    res.status(201).json({ success: true, data: incident });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PATCH: Update Incident Status (Executes Stored Procedure)
app.patch('/api/incidents/:id/status', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id);
    const { status, updatedBy } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status parameter is required.' });
    }

    // Database Automation Call: Stored Procedure
    await prisma.$executeRaw`CALL update_incident_status(${incidentId}, ${status}, ${updatedBy ? parseInt(updatedBy) : null})`;

    const updatedIncident = await prisma.incident.findUnique({
      where: { id: incidentId }
    });

    res.json({ success: true, data: updatedIncident });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Assign Responders to Incident (M:N Junction Table)
app.post('/api/incidents/:id/responders', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id);
    const { residentId, roleAssigned } = req.body;

    if (!residentId) {
      return res.status(400).json({ success: false, error: 'residentId is required.' });
    }

    const responder = await prisma.incidentResponder.create({
      data: {
        incidentId,
        residentId: parseInt(residentId),
        roleAssigned: roleAssigned || 'OFFICER'
      }
    });

    res.status(201).json({ success: true, data: responder });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. BLOTTER & LEGAL CASE ROUTES
// ==========================================

// GET: List all Blotter Records
app.get('/api/blotters', async (req, res) => {
  try {
    const blotters = await prisma.blotterRecord.findMany({
      include: {
        parties: { include: { resident: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, count: blotters.length, data: blotters });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Create a Blotter Record
app.post('/api/blotters', async (req, res) => {
  try {
    const { incidentId, caseTitle, caseType, summary } = req.body;

    if (!caseTitle || !caseType) {
      return res.status(400).json({ success: false, error: 'caseTitle and caseType are required.' });
    }

    const blotter = await prisma.blotterRecord.create({
      data: {
        incidentId: incidentId ? parseInt(incidentId) : null,
        caseTitle,
        caseType,
        summary,
        caseStatus: 'PENDING'
      }
    });

    res.status(201).json({ success: true, data: blotter });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST: Add Party to Blotter Case (Complainant/Respondent/Witness)
app.post('/api/blotters/:id/parties', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    const { residentId, partyRole, statement } = req.body;

    if (!residentId || !partyRole) {
      return res.status(400).json({ success: false, error: 'residentId and partyRole are required.' });
    }

    const party = await prisma.blotterParty.create({
      data: {
        caseId,
        residentId: parseInt(residentId),
        partyRole,
        statement
      }
    });

    res.status(201).json({ success: true, data: party });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET: List Parties in a Blotter Case
app.get('/api/blotters/:id/parties', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    const parties = await prisma.blotterParty.findMany({
      where: { caseId },
      include: { resident: true }
    });
    res.json({ success: true, count: parties.length, data: parties });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH: Update Blotter Case Status
app.patch('/api/blotters/:id/status', async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    const { caseStatus } = req.body;

    const updatedBlotter = await prisma.blotterRecord.update({
      where: { id: caseId },
      data: { caseStatus }
    });

    res.json({ success: true, data: updatedBlotter });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. RESIDENTS & RBAC USER MANAGEMENT
// ==========================================

// GET: Fetch all Residents
app.get('/api/residents', async (req, res) => {
  try {
    const residents = await prisma.resident.findMany({
      include: {
        userRoles: { include: { role: true } }
      },
      orderBy: { fullName: 'asc' }
    });
    res.json({ success: true, count: residents.length, data: residents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Register New Resident
app.post('/api/residents', async (req, res) => {
  try {
    const { fullName, email, contactNo, address, isVoter } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ success: false, error: 'fullName and email are required.' });
    }

    const resident = await prisma.resident.create({
      data: {
        fullName,
        email,
        contactNo,
        address,
        isVoter: isVoter || false
      }
    });

    res.status(201).json({ success: true, data: resident });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST: Assign RBAC Role to User (M:N Junction Table)
app.post('/api/residents/:id/roles', async (req, res) => {
  try {
    const residentId = parseInt(req.params.id);
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ success: false, error: 'roleId is required.' });
    }

    const userRole = await prisma.userRole.create({
      data: {
        residentId,
        roleId: parseInt(roleId)
      }
    });

    res.status(201).json({ success: true, data: userRole });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. WILDCARD CLIENT ROUTE & SERVER LISTEN
// ==========================================

// Wildcard route to serve index.html for web client navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Server Initialization (Single Port Declaration)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Bantay-Barangay API & Full-Stack UI running on http://localhost:${PORT}`);
});