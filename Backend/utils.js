// utils.js : small helpers shared by every route file.

// keep only the listed keys from the request body (stops clients writing columns they should not touch)
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const int = (v) => parseInt(v, 10);

// turn a Prisma / PostgreSQL error into a short readable message
const cleanError = (e) => {
  const m = String(e.message).match(/ERROR: ([^\n`]+)/);
  return m ? m[1] : e.message;
};

// wrap a route so any error becomes a JSON 400 instead of crashing the server
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(400).json({ error: cleanError(e) });
  }
};

// "now" in the Philippines, no matter where the server runs
const manilaDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
const manilaTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }); // HH:MM

// returns an error message when the date (and optional HH:MM time) is malformed or already in the past, else null
function checkNotPast(date, time) {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return 'scheduledDate must be YYYY-MM-DD.';
  if (d < manilaDate()) return 'That date has already passed. Choose today or a future date.';
  if (time) {
    const t = String(time).slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return 'scheduledTime must be HH:MM.';
    if (d === manilaDate() && t <= manilaTime()) return 'That time has already passed today.';
  }
  return null;
}

// names are stored without stray spaces ("  maria   santos " -> "maria santos")
const cleanName = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');

// the same person = same first name + last name + birth date (capital letters ignored). Returns the existing record or null.
async function findDuplicateResident(prisma, firstName, lastName, birthDate, excludeId) {
  return prisma.resident.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
      birthDate: new Date(birthDate),
      ...(excludeId ? { residentId: { not: excludeId } } : {}),
    },
    select: { residentId: true, residentCode: true, recordStatus: true },
  });
}

// the 409 answer for a duplicate, with a hint that fits the existing record's status
function duplicateMessage(d) {
  const who = d.residentCode || `#${d.residentId}`;
  return d.recordStatus === 'Active'
    ? `This resident is already registered as ${who}. Update that record instead of adding a new one.`
    : `This resident already exists as ${who} (status: ${d.recordStatus}). Change that record's status back to Active instead of adding a new one.`;
}

module.exports = { pick, int, cleanError, handle, manilaDate, manilaTime, checkNotPast, cleanName, findDuplicateResident, duplicateMessage };
