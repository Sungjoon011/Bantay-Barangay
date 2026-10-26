-- 11_readme_features.sql : features promised in the README, done inside the database.

-- 1) Emergency alerts: announcements get a priority
ALTER TABLE "Announcement" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'Normal';
ALTER TABLE "Announcement" DROP CONSTRAINT IF EXISTS "Announcement_priority_chk";
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_priority_chk" CHECK ("priority" IN ('Normal', 'Urgent', 'Emergency'));

-- 2) Fee schedule (Admin edits it); a trigger copies the fee into every new document payment
CREATE TABLE IF NOT EXISTS "DocumentFee" ("documentType" TEXT PRIMARY KEY, "fee" NUMERIC(10,2) NOT NULL CHECK ("fee" >= 0));
INSERT INTO "DocumentFee" VALUES ('Barangay Clearance', 50), ('Certificate of Residency', 30), ('Certificate of Indigency', 0) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON "DocumentFee" TO app_user;

CREATE OR REPLACE FUNCTION fn_apply_fee() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."requestId" IS NOT NULL THEN
    NEW."amount" := COALESCE((SELECT f."fee" FROM "DocumentFee" f JOIN "DocumentRequest" d ON d."documentType" = f."documentType" WHERE d."requestId" = NEW."requestId"), NEW."amount");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_apply_fee ON "Payment";
CREATE TRIGGER trg_apply_fee BEFORE INSERT ON "Payment" FOR EACH ROW EXECUTE FUNCTION fn_apply_fee();

-- 3) Verification code on every document (for QR / authenticity checks)
ALTER TABLE "DocumentRequest" ADD COLUMN IF NOT EXISTS "verificationCode" TEXT UNIQUE;
UPDATE "DocumentRequest" SET "verificationCode" = upper(substr(md5(random()::text || "requestId"::text), 1, 10)) WHERE "verificationCode" IS NULL;
CREATE OR REPLACE FUNCTION fn_set_verification_code() RETURNS TRIGGER AS $$
BEGIN
  NEW."verificationCode" := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_verification_code ON "DocumentRequest";
CREATE TRIGGER trg_verification_code BEFORE INSERT ON "DocumentRequest" FOR EACH ROW EXECUTE FUNCTION fn_set_verification_code();

-- 4) Blotter case history: every status change is kept
CREATE TABLE IF NOT EXISTS "BlotterHistory" (
  "historyId" SERIAL PRIMARY KEY,
  "caseId" INTEGER NOT NULL REFERENCES "IncidentBlotter"("caseId") ON DELETE CASCADE,
  "oldStatus" TEXT, "newStatus" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "changedBy" INTEGER
);
GRANT SELECT, INSERT ON "BlotterHistory" TO app_user;
GRANT USAGE, SELECT ON SEQUENCE "BlotterHistory_historyId_seq" TO app_user;

CREATE OR REPLACE FUNCTION fn_blotter_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."status" = NEW."status" THEN RETURN NULL; END IF;
  INSERT INTO "BlotterHistory" ("caseId", "oldStatus", "newStatus", "changedBy")
  VALUES (NEW."caseId", CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::TEXT END, NEW."status"::TEXT,
          NULLIF(current_setting('app.account_id', true), '')::INTEGER);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_blotter_history ON "IncidentBlotter";
CREATE TRIGGER trg_blotter_history AFTER INSERT OR UPDATE OF "status" ON "IncidentBlotter" FOR EACH ROW EXECUTE FUNCTION fn_blotter_history();

-- 5) Reports (population, incident trends, request volume, revenue)
CREATE OR REPLACE FUNCTION fn_report_population() RETURNS TABLE (purok TEXT, residents INTEGER, seniors INTEGER, minors INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT h."purokZone", COUNT(*)::INTEGER,
         (COUNT(*) FILTER (WHERE fn_resident_age(r."birthDate") >= 60))::INTEGER,
         (COUNT(*) FILTER (WHERE fn_resident_age(r."birthDate") < 18))::INTEGER
  FROM "Resident" r JOIN "Household" h ON h."householdId" = r."householdId"
  WHERE r."recordStatus" = 'Active' GROUP BY h."purokZone" ORDER BY 1;
$$;
CREATE OR REPLACE FUNCTION fn_report_incidents() RETURNS TABLE (period TEXT, incident_type TEXT, total INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT to_char("dateOfIncident", 'YYYY-MM'), "incidentType", COUNT(*)::INTEGER
  FROM "IncidentBlotter" GROUP BY 1, 2 ORDER BY 1 DESC, 2;
$$;
CREATE OR REPLACE FUNCTION fn_report_requests() RETURNS TABLE (document_type TEXT, status TEXT, total INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT "documentType", "status"::TEXT, COUNT(*)::INTEGER FROM "DocumentRequest" GROUP BY 1, 2 ORDER BY 1, 2;
$$;
CREATE OR REPLACE FUNCTION fn_report_revenue() RETURNS TABLE (period TEXT, source TEXT, collected FLOAT8)
LANGUAGE sql STABLE AS $$
  SELECT to_char("datePaid", 'YYYY-MM'), "transactionType"::TEXT, SUM("amount")::FLOAT8
  FROM "Payment" WHERE "paymentStatus" = 'Paid' GROUP BY 1, 2 ORDER BY 1 DESC, 2;
$$;
