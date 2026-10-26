-- 14_cancel_request.sql : residents can cancel a document request they no longer want.
-- Run this on its own (a new enum value cannot be used in the same run that adds it).
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'Cancelled';

-- Cancelled requests keep their (Unpaid) payment row, so keep them out of the "unpaid payments" dashboard number.
CREATE OR REPLACE FUNCTION fn_barangay_stats()
RETURNS TABLE (active_residents INTEGER, pending_documents INTEGER, open_blotters INTEGER, unpaid_payments INTEGER, senior_citizens INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT COUNT(*) FROM "Resident" WHERE "recordStatus" = 'Active')::INTEGER,
    (SELECT COUNT(*) FROM "DocumentRequest" WHERE "status" IN ('Pending', 'Processing'))::INTEGER,
    (SELECT COUNT(*) FROM "IncidentBlotter" WHERE "status"::TEXT IN ('Open', 'Ongoing'))::INTEGER,
    (SELECT COUNT(*) FROM "Payment" p JOIN "DocumentRequest" d ON d."requestId" = p."requestId"
       WHERE p."paymentStatus" = 'Unpaid' AND d."status"::TEXT <> 'Cancelled')::INTEGER
    + (SELECT COUNT(*) FROM "Payment" WHERE "paymentStatus" = 'Unpaid' AND "requestId" IS NULL)::INTEGER,
    (SELECT COUNT(*) FROM "Resident" WHERE "recordStatus" = 'Active' AND fn_resident_age("birthDate") >= 60)::INTEGER;
$$;
