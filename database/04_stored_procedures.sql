-- 04_stored_procedures.sql
-- Business rules that run inside the database, each call = one transaction (all-or-nothing).

-- 1) Move a document request through its workflow and create its payment record when it is Ready.
--    Allowed: Pending -> Processing | Rejected ; Processing -> Ready | Rejected ; Ready -> Claimed (only if Paid)
CREATE OR REPLACE PROCEDURE sp_process_document_request(
  p_request_id INTEGER,
  p_staff_id   INTEGER,
  p_new_status TEXT,
  p_amount     NUMERIC DEFAULT 50.00,
  p_method     TEXT    DEFAULT 'Cash'
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- row lock: two staff cannot process the same request at the same moment
  SELECT "status"::TEXT INTO v_status
  FROM "DocumentRequest"
  WHERE "requestId" = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document request % not found', p_request_id;
  END IF;

  IF NOT (
       (v_status = 'Pending'    AND p_new_status IN ('Processing', 'Rejected'))
    OR (v_status = 'Processing' AND p_new_status IN ('Ready', 'Rejected'))
    OR (v_status = 'Ready'      AND p_new_status = 'Claimed')
  ) THEN
    RAISE EXCEPTION 'Invalid status change: % -> %', v_status, p_new_status;
  END IF;

  IF p_new_status = 'Claimed' AND NOT EXISTS (
    SELECT 1 FROM "Payment"
    WHERE "requestId" = p_request_id AND "paymentStatus" = 'Paid'
  ) THEN
    RAISE EXCEPTION 'Cannot release document %: payment is not settled', p_request_id;
  END IF;

  UPDATE "DocumentRequest"
  SET "status" = p_new_status::"RequestStatus",
      "processedByStaffId" = p_staff_id
  WHERE "requestId" = p_request_id;

  IF p_new_status = 'Ready' AND NOT EXISTS (
    SELECT 1 FROM "Payment" WHERE "requestId" = p_request_id
  ) THEN
    INSERT INTO "Payment" ("transactionType", "requestId", "amount", "paymentMethod", "paymentStatus")
    VALUES ('Document', p_request_id, p_amount, p_method::"PaymentMethod", 'Unpaid');
  END IF;
END;
$$;

-- 2) Record the payment of a document request
CREATE OR REPLACE PROCEDURE sp_record_payment(
  p_request_id INTEGER,
  p_or_number  TEXT,
  p_method     TEXT DEFAULT 'Cash'
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id INTEGER;
  v_pstatus    TEXT;
BEGIN
  SELECT "paymentId", "paymentStatus"::TEXT INTO v_payment_id, v_pstatus
  FROM "Payment"
  WHERE "requestId" = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payment record for request % (is it Ready yet?)', p_request_id;
  END IF;

  IF v_pstatus = 'Paid' THEN
    RAISE EXCEPTION 'Request % is already paid', p_request_id;
  END IF;

  UPDATE "Payment"
  SET "paymentStatus" = 'Paid',
      "orNumber" = p_or_number,
      "paymentMethod" = p_method::"PaymentMethod",
      "datePaid" = NOW()
  WHERE "paymentId" = v_payment_id;
END;
$$;

-- 3) Age calculation function
CREATE OR REPLACE FUNCTION fn_resident_age(p_birth DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, p_birth))::INTEGER;
$$;

-- 4) Dashboard numbers in one call (returns plain integers so JSON works)
CREATE OR REPLACE FUNCTION fn_barangay_stats()
RETURNS TABLE (
  active_residents INTEGER,
  pending_documents INTEGER,
  open_blotters INTEGER,
  unpaid_payments INTEGER,
  senior_citizens INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT COUNT(*) FROM "Resident" WHERE "recordStatus" = 'Active')::INTEGER,
    (SELECT COUNT(*) FROM "DocumentRequest" WHERE "status" IN ('Pending', 'Processing'))::INTEGER,
    (SELECT COUNT(*) FROM "IncidentBlotter" WHERE "status"::TEXT IN ('Open', 'Ongoing'))::INTEGER,
    (SELECT COUNT(*) FROM "Payment" WHERE "paymentStatus" = 'Unpaid')::INTEGER,
    (SELECT COUNT(*) FROM "Resident" WHERE "recordStatus" = 'Active' AND fn_resident_age("birthDate") >= 60)::INTEGER;
$$;
