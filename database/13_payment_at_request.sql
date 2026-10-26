-- 13_payment_at_request.sql : every document request now gets its payment record when it is created
-- (the API does this for new requests). This back-fills requests made before that change.
-- trg_apply_fee stamps the correct fee from "DocumentFee"; free documents are marked Paid (nothing to settle).
INSERT INTO "Payment" ("transactionType", "requestId", "amount", "paymentMethod", "paymentStatus", "datePaid")
SELECT 'Document', d."requestId", COALESCE(f."fee", 0), 'Cash',
       CASE WHEN COALESCE(f."fee", 0) = 0 THEN 'Paid'::"PaymentStatus" ELSE 'Unpaid'::"PaymentStatus" END,
       CASE WHEN COALESCE(f."fee", 0) = 0 THEN NOW() END
FROM "DocumentRequest" d
LEFT JOIN "DocumentFee" f ON f."documentType" = d."documentType"
WHERE d."status" <> 'Rejected'
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."requestId" = d."requestId");
