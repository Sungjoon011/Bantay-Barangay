// server.js : starts the API. Routes live in ./routes, security in ./middleware, the DB client in ./db.
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { prisma } = require('./db');
const { guard } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } })); // raw body is needed to verify webhook signatures

// browser UI (Public/index.html)
app.use(express.static(path.join(__dirname, '..', 'Public')));

// ---------------- PUBLIC ENDPOINTS (no token needed) ----------------
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ONLINE', timestamp: new Date().toISOString() });
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const user = await prisma.privateAccount.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.accountStatus !== 'Active') return res.status(403).json({ error: 'Account is not active.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });

    // the token carries who you are (accountId) and your role; it expires in 8 hours
    const token = jwt.sign(
      { accountId: user.accountId, role: user.systemRole },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.status(200).json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------- EVERYTHING ELSE UNDER /api NEEDS A TOKEN AND A ROLE ----------------
app.use('/api', guard);

require('./routes/core')(app, prisma);
require('./routes/junction')(app, prisma);
require('./routes/extra')(app, prisma);
require('./routes/resident')(app, prisma);
require('./routes/features')(app, prisma);
require('./routes/paymongo')(app, prisma);

app.use('/api', (req, res) => {
  res.status(404).json({ error: `No such route: ${req.method} ${req.originalUrl}` });
});

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('any-long-random')) {
  console.warn('WARNING: set a long random JWT_SECRET in .env');
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Barangay Backend server running on port ${PORT}`);
  });
}

module.exports = app;
