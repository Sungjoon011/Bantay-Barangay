-- 05_integrity_3nf.sql
-- 3NF cleanup + stricter integrity rules.

-- 1) Views first (they read the address from Household, the single source of truth)
CREATE OR REPLACE VIEW vw_resident_directory AS
SELECT r."residentId",
       r."firstName",
       r."lastName",
       r."birthDate",
       fn_resident_age(r."birthDate") AS age,
       r."gender",
       r."civilStatus",
       r."contactNumber",
       r."recordStatus",
       h."householdId",
       h."addressDetails",
       h."purokZone"
FROM "Resident" r
JOIN "Household" h ON h."householdId" = r."householdId";

CREATE OR REPLACE VIEW vw_document_queue AS
SELECT d."requestId",
       d."documentType",
       d."status",
       d."requestDate",
       r."firstName" || ' ' || r."lastName" AS resident_name,
       p."paymentStatus"
FROM "DocumentRequest" d
JOIN "Resident" r ON r."residentId" = d."residentId"
LEFT JOIN "Payment" p ON p."requestId" = d."requestId";

GRANT SELECT ON vw_resident_directory, vw_document_queue TO app_user;

-- 2) Remove the duplicated text: Resident.address / Resident.purokZone repeat Household data
ALTER TABLE "Resident" DROP COLUMN IF EXISTS "address";
ALTER TABLE "Resident" DROP COLUMN IF EXISTS "purokZone";

-- 3) Payment points to exactly one parent (document request OR business permit), never both, never neither
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_exactly_one_target_chk";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exactly_one_target_chk" CHECK (
     ("transactionType" = 'Document'       AND "requestId" IS NOT NULL AND "permitId"  IS NULL)
  OR ("transactionType" = 'BusinessPermit' AND "permitId"  IS NOT NULL AND "requestId" IS NULL)
);

-- 4) Free-text status columns only accept known values
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_status_chk";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_status_chk"
  CHECK ("status" IN ('Upcoming', 'Completed', 'Cancelled', 'NoShow'));

-- 5) Least privilege: the app role may delete announcements only. It cannot delete residents, payments, audit logs...
GRANT DELETE ON "Announcement" TO app_user;
