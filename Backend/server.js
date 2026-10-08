const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(cors());

// ==========================================
// 1. HOUSEHOLD ROUTES
// ==========================================

// POST: Create a Household
app.post('/api/households', async (req, res) => {
  try {
    const { addressDetails, purokZone } = req.body;

    if (!addressDetails || !purokZone) {
      return res.status(400).json({ error: 'addressDetails and purokZone are required.' });
    }

    const newHousehold = await prisma.household.create({
      data: {
        addressDetails,
        purokZone
      }
    });

    res.status(201).json(newHousehold);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET: Fetch all Households (includes nested Residents)
app.get('/api/households', async (req, res) => {
  try {
    const households = await prisma.household.findMany({
      include: {
        residents: true
      }
    });
    res.status(200).json(households);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 2. RESIDENT ROUTES
// ==========================================

// PUT: Update a Resident
app.put('/api/residents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body; 

    const updatedResident = await prisma.resident.update({
      where: { residentId: parseInt(id) },
      data: updateData,
    });
    res.status(200).json(updatedResident);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE: Soft Delete/Archive a Resident
app.delete('/api/residents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 

    const archivedResident = await prisma.resident.update({
      where: { residentId: parseInt(id) },
      data: { recordStatus: status || 'Moved' },
    });
    res.status(200).json({ 
      message: `Resident marked as ${archivedResident.recordStatus}`, 
      resident: archivedResident 
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// 3. DOCUMENT REQUEST ROUTES
// ==========================================

// POST: Create a Document Request
app.post('/api/documents', async (req, res) => {
  try {
    const { residentId, documentType, purpose } = req.body;

    if (!residentId || !documentType || !purpose) {
      return res.status(400).json({ error: 'residentId, documentType, and purpose are required.' });
    }

    const newRequest = await prisma.documentRequest.create({
      data: {
        residentId: parseInt(residentId),
        documentType,
        purpose
      }
    });

    res.status(201).json(newRequest);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET: Fetch all Document Requests
app.get('/api/documents', async (req, res) => {
  try {
    const documents = await prisma.documentRequest.findMany({
      include: {
        resident: true
      },
      orderBy: {
        requestDate: 'desc'
      }
    });
    res.status(200).json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. STAFF / ADMIN ROUTES
// ==========================================

// POST: Create Staff Account (PrivateAccount + StaffOfficial nested)
app.post('/api/staff', async (req, res) => {
  try {
    const { email, password, systemRole, firstName, lastName, positionTitle } = req.body;

    const newAccount = await prisma.privateAccount.create({
      data: {
        email,
        passwordHash: password,
        systemRole,
        staffProfile: {
          create: {
            firstName,
            lastName,
            positionTitle
          }
        }
      },
      include: {
        staffProfile: true
      }
    });

    res.status(201).json(newAccount);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==========================================
// 5. INCIDENT BLOTTER ROUTES
// ==========================================

// POST: Create an Incident Blotter (with proper relation connects)
app.post('/api/blotters', async (req, res) => {
  try {
    const { 
      dateOfIncident, 
      incidentType, 
      complainantResidentId, 
      respondentName, 
      description, // Removed incidentDetails, using description
      recordedByStaffId 
    } = req.body;

    const newBlotter = await prisma.incidentBlotter.create({
      data: {
        dateOfIncident: new Date(dateOfIncident),
        incidentType,
        respondentName,
        description, // Passed directly here
        complainant: {
          connect: { residentId: parseInt(complainantResidentId) }
        },
        recordedBy: {
          connect: { staffId: parseInt(recordedByStaffId) }
        }
      }
    });

    res.status(201).json(newBlotter);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET: Fetch all Incident Blotters
app.get('/api/blotters', async (req, res) => {
  try {
    const blotters = await prisma.incidentBlotter.findMany({
      include: {
        complainant: true,
        recordedBy: true
      },
      orderBy: {
        dateOfIncident: 'desc'
      }
    });
    res.status(200).json(blotters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Barangay Backend server running on port ${PORT}`);
});
// GET: Fetch all Staff Accounts
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await prisma.privateAccount.findMany({
      include: {
        staffProfile: true
      }
    });
    res.status(200).json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ==========================================
// STATUS UPDATE ROUTES
// ==========================================

// PATCH: Update Document Request Status
app.patch('/api/documents/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // e.g., "Approved", "Released", "Rejected"

    const updatedDocument = await prisma.documentRequest.update({
      where: { requestId: parseInt(id) }, // Make sure 'requestId' matches your Prisma schema
      data: { requestStatus: status }
    });

    res.status(200).json(updatedDocument);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PATCH: Update Incident Blotter Status
app.patch('/api/blotters/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // e.g., "Resolved", "Closed"

    const updatedBlotter = await prisma.incidentBlotter.update({
      where: { caseId: parseInt(id) }, 
      data: { status: status }
    });

    res.status(200).json(updatedBlotter);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// POST: Staff Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check if the user exists in the database
    const user = await prisma.privateAccount.findUnique({
      where: { email: email }
    });

    if (!user) {
      return res.status(404).json({ error: "Account not found" });
    }
    
    // 2. Verify the password 
    // (Note: We are using raw passwords for this test. Later, we will encrypt them!)
    if (password !== user.passwordHash) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // 3. Generate the JWT (The "Digital ID Badge")
    const token = jwt.sign(
      { accountId: user.accountId, role: user.systemRole }, // Data hidden inside the token
      process.env.JWT_SECRET,                               // Your secret key from .env
      { expiresIn: '8h' }                                   // Token expires in 8 hours
    );

    // 4. Send the token to the user
    res.status(200).json({ 
      message: "Login successful", 
      token: token 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});