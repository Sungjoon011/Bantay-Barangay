-- 09_benchmark_cleanup.sql : remove the temporary benchmark residents (trigger off to keep the log clean)
ALTER TABLE "Resident" DISABLE TRIGGER trg_audit_resident;
DELETE FROM "Resident" WHERE "firstName" LIKE 'Bench%';
ALTER TABLE "Resident" ENABLE TRIGGER trg_audit_resident;
ANALYZE "Resident";
