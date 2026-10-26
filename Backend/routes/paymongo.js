// paymongo.js : residents pay document fees online with PayMongo Hosted Checkout (/v2).
// Flow: resident clicks "Pay online" -> we create a checkout session (its id is saved on the Payment row) ->
//       PayMongo hosted page -> PayMongo calls our webhook -> we verify the signature -> the stored procedure marks it Paid.
// Backup: if the webhook never arrives (e.g. running on localhost), the portal calls /sync-payment, which asks
//       PayMongo directly whether the saved checkout session was paid.
const crypto = require('crypto');
const { int, handle } = require('../utils');

const KEY = () => process.env.PAYMONGO_SECRET_KEY;
const auth = () => 'Basic ' + Buffer.from(`${KEY()}:`).toString('base64');

function validSignature(header, raw, secret, live) {
  const p = Object.fromEntries(String(header || '').split(',').map((s) => s.split(/=(.*)/s).slice(0, 2)));
  const theirs = live ? p.li : p.te;
  if (!p.t || !theirs || !secret) return false;
  const mine = crypto.createHmac('sha256', secret).update(`${p.t}.${raw}`).digest('hex');
  return mine.length === theirs.length && crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(theirs));
}

module.exports = function registerPayMongoRoutes(app, prisma) {
  // Mark a request Paid (via the stored procedure) AND release the certificate (Ready), in one transaction.
  // Used by both the webhook and the sync route, so they behave identically. Returns true if THIS call settled it.
  async function settle(requestId, paidPayment) {
    const payment = await prisma.payment.findFirst({ where: { requestId } });
    if (!payment || payment.paymentStatus !== 'Unpaid') return false;
    if (paidPayment.attributes.amount < Math.round(Number(payment.amount) * 100)) return false; // paid less than the fee
    try {
      await prisma.$transaction([
        prisma.$executeRaw`CALL sp_record_payment(${requestId}::integer, ${'PM-' + paidPayment.id}::text, ${'PayMongo'}::text)`,
        prisma.documentRequest.updateMany({ where: { requestId, status: { in: ['Pending', 'Processing', 'Cancelled'] } }, data: { status: 'Ready' } }),
      ]);
      return true;
    } catch (e) {
      // the webhook and the sync route can race: if the other one already settled it, that is fine
      const again = await prisma.payment.findFirst({ where: { requestId } });
      if (again && again.paymentStatus === 'Paid') return false;
      throw e;
    }
  }

  // Resident starts an online payment for their OWN document
  app.post('/api/me/documents/:id/pay', handle(async (req, res) => {
    if (req.user.role !== 'Resident') return res.status(403).json({ error: 'Residents only.' });
    if (!KEY()) return res.status(503).json({ error: 'Online payment is not set up yet (PAYMONGO_SECRET_KEY).' });
    const doc = await prisma.documentRequest.findFirst({
      where: { requestId: int(req.params.id), residentId: req.user.residentId },
      include: { payment: true },
    });
    if (!doc || !doc.payment) return res.status(404).json({ error: 'No payment is due for this document yet.' });
    if (['Rejected', 'Cancelled'].includes(doc.status)) return res.status(400).json({ error: `This request was ${doc.status.toLowerCase()}.` });
    if (doc.payment.paymentStatus === 'Cancelled') return res.status(400).json({ error: 'This fee was cancelled by the Barangay Hall. Please contact the office.' });
    if (doc.payment.paymentStatus !== 'Unpaid') return res.status(400).json({ error: 'This document is already paid.' });
    const centavos = Math.round(Number(doc.payment.amount) * 100);
    if (!(centavos > 0)) return res.status(400).json({ error: 'This document is free of charge.' });

    const base = process.env.APP_URL || 'http://localhost:3000';
    const r = await fetch('https://api.paymongo.com/v2/checkout_sessions', {
      method: 'POST',
      headers: { Authorization: auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { attributes: {
        line_items: [{ name: `${doc.documentType} fee`, amount: centavos, currency: 'PHP', quantity: 1 }],
        payment_method_types: ['gcash', 'card', 'qrph'],
        success_url: `${base}/resident.html?paid=${doc.requestId}`,
        cancel_url: `${base}/resident.html`,
        reference_number: String(doc.requestId),
        metadata: { requestId: String(doc.requestId) },
      } } }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: (body.errors && body.errors[0] && body.errors[0].detail) || 'PayMongo refused the request.' });
    // remember the session so we can ask PayMongo about it later if the webhook never arrives
    await prisma.payment.update({ where: { requestId: doc.requestId }, data: { checkoutSessionId: body.data.id } });
    res.status(200).json({ checkoutUrl: body.data.attributes.checkout_url });
  }));

  // Backup to the webhook: ask PayMongo directly if this document's checkout session was paid.
  app.post('/api/me/documents/:id/sync-payment', handle(async (req, res) => {
    if (req.user.role !== 'Resident') return res.status(403).json({ error: 'Residents only.' });
    if (!KEY()) return res.status(503).json({ error: 'Online payment is not set up yet (PAYMONGO_SECRET_KEY).' });
    const id = int(req.params.id);
    const doc = await prisma.documentRequest.findFirst({ where: { requestId: id, residentId: req.user.residentId }, include: { payment: true } });
    if (!doc || !doc.payment) return res.status(404).json({ error: 'Document request not found.' });
    if (doc.payment.paymentStatus === 'Paid') return res.status(200).json({ paid: true });
    if (!doc.payment.checkoutSessionId) return res.status(200).json({ paid: false, reason: 'No online checkout was started for this document.' });

    // NOTE: PayMongo's lookup route is /v1 (it also finds sessions created through /v2). Creating stays on /v2 above.
    const r = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(doc.payment.checkoutSessionId)}`, { headers: { Authorization: auth() } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn('PayMongo sync failed for request', id, r.status, JSON.stringify(body).slice(0, 300));
      return res.status(502).json({ error: 'Could not reach PayMongo to check the payment. Try again in a moment.' });
    }
    const session = (body.data && body.data.attributes) || {};
    const payments = session.payments || [];
    const statuses = payments.map((p) => p.attributes && p.attributes.status);
    console.log(`PayMongo sync request ${id}: session status="${session.status}", payments=[${statuses.join(', ')}]`);
    let paid = payments.find((p) => p.attributes && p.attributes.status === 'paid');
    // PayMongo itself says the whole session is paid (we created it with exactly our fee), even if the payments list is empty
    if (!paid && session.status === 'paid') paid = { id: body.data.id, attributes: { amount: Math.round(Number(doc.payment.amount) * 100) } };
    if (!paid) return res.status(200).json({ paid: false, sessionStatus: session.status || 'unknown', paymentStatuses: statuses });
    const settled = await settle(id, paid);
    if (!settled) {
      const now = await prisma.payment.findFirst({ where: { requestId: id } });
      if (!now || now.paymentStatus !== 'Paid') return res.status(200).json({ paid: false, sessionStatus: session.status, paymentStatuses: statuses, reason: 'PayMongo shows a payment, but it is less than the fee.' });
    }
    res.status(200).json({ paid: true });
  }));

  // PayMongo -> us (public route, protected by the signature)
  app.post('/api/paymongo/webhook', async (req, res) => {
    try {
      const event = JSON.parse(req.rawBody ? req.rawBody.toString('utf8') : '{}');
      const live = !!(event.data && event.data.livemode);
      if (!validSignature(req.headers['paymongo-signature'], req.rawBody, process.env.PAYMONGO_WEBHOOK_SECRET, live)) {
        console.warn('PayMongo webhook REJECTED: bad signature. Check PAYMONGO_WEBHOOK_SECRET matches this webhook in the PayMongo dashboard (test vs live).');
        return res.status(400).json({ error: 'Bad signature.' });
      }
      if (!event.data || event.data.type !== 'checkout_session.payment.paid') return res.status(200).json({ ignored: true });

      const session = event.data.data.attributes;
      const paid = (session.payments || []).find((p) => p.attributes.status === 'paid');
      const requestId = int(session.reference_number);
      if (!paid) return res.status(200).json({ ignored: true });
      const done = await settle(requestId, paid);
      console.log('PayMongo webhook: request', requestId, done ? 'marked Paid' : 'ignored (already paid / amount too low)');
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('PayMongo webhook failed:', e.message);
      res.status(500).json({ error: 'Webhook failed.' });
    }
  });
};
