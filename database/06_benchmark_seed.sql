-- 06_benchmark_seed.sql : 50,000 temporary residents so index tests are meaningful.
-- The audit trigger is switched off during the seed so the audit log is not flooded.
ALTER TABLE "Resident" DISABLE TRIGGER trg_audit_resident;

INSERT INTO "Resident" ("householdId", "firstName", "lastName", "birthDate", "gender", "civilStatus", "recordStatus")
SELECT (SELECT MIN("householdId") FROM "Household"),
       'Bench' || g,
       'Surname' || (g % 2000),
       DATE '1960-01-01' + (g % 20000),
       'Male',
       'Single',
       'Active'
FROM generate_series(1, 50000) AS g;

ALTER TABLE "Resident" ENABLE TRIGGER trg_audit_resident;
ANALYZE "Resident";
