-- 07_indexes.sql : indexing strategy (run AFTER the "before" benchmark)
-- Postgres does not index foreign keys automatically, so the FK columns are indexed here.
CREATE INDEX IF NOT EXISTS "Resident_lastName_firstName_idx"   ON "Resident"("lastName", "firstName");
CREATE INDEX IF NOT EXISTS "Resident_householdId_idx"          ON "Resident"("householdId");
CREATE INDEX IF NOT EXISTS "DocumentRequest_residentId_idx"    ON "DocumentRequest"("residentId");
CREATE INDEX IF NOT EXISTS "DocumentRequest_status_idx"        ON "DocumentRequest"("status");
CREATE INDEX IF NOT EXISTS "IncidentBlotter_complainantId_idx" ON "IncidentBlotter"("complainantId");
CREATE INDEX IF NOT EXISTS "IncidentBlotter_status_idx"        ON "IncidentBlotter"("status");
CREATE INDEX IF NOT EXISTS "BusinessPermit_residentId_idx"     ON "BusinessPermit"("residentId");
CREATE INDEX IF NOT EXISTS "Appointment_residentId_date_idx"   ON "Appointment"("residentId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "SystemAuditLog_timestamp_idx"      ON "SystemAuditLog"("timestamp");
ANALYZE;
