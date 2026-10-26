-- 15_checkout_session_id.sql : remember the PayMongo checkout session of each online payment,
-- so the API can ask PayMongo directly whether it was paid when the webhook is late or never arrives.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "checkoutSessionId" TEXT;
