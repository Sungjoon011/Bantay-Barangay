-- 16_resident_registry.sql : one unique ID per resident, no duplicate residents, and a registry report per purok.
-- Safe to run more than once.

-- 1) UNIQUE RESIDENT ID.
--    "residentId" is already the unique primary key (it can never repeat). This adds a readable code made from it,
--    for example residentId 12 -> BB-000012. The database fills it in automatically, nobody types it.
ALTER TABLE "Resident"
  ADD COLUMN IF NOT EXISTS "residentCode" TEXT GENERATED ALWAYS AS ('BB-' || lpad("residentId"::text, 6, '0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS "Resident_residentCode_key" ON "Resident" ("residentCode");

-- 2) DUPLICATE RESIDENTS: a person is the same when first name + last name + birth date match
--    (capital letters and extra spaces are ignored). This view lists any copies that already exist.
CREATE OR REPLACE VIEW vw_duplicate_residents AS
SELECT MIN(r."firstName") AS "firstName",
       MIN(r."lastName")  AS "lastName",
       r."birthDate",
       COUNT(*)::INTEGER  AS copies,
       string_agg(r."residentCode", ', ' ORDER BY r."residentId") AS "residentCodes"
FROM "Resident" r
GROUP BY lower(btrim(r."firstName")), lower(btrim(r."lastName")), r."birthDate"
HAVING COUNT(*) > 1;
GRANT SELECT ON vw_duplicate_residents TO app_user;

-- The database itself refuses a second copy. It is only switched on when no copies exist yet;
-- if some do, fix them first (open "Report: Duplicates" in the staff console), then run this file again.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vw_duplicate_residents) THEN
    RAISE NOTICE 'Duplicate residents already exist, so the no-duplicates rule was NOT switched on yet. Check: SELECT * FROM vw_duplicate_residents;';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "Resident_no_duplicates_idx"
      ON "Resident" (lower(btrim("firstName")), lower(btrim("lastName")), "birthDate");
  END IF;
END $$;

-- 3) REGISTRY REPORT: how many residents are registered per purok, how many are active or not,
--    and how many already have an online account. The last row is the total for the whole barangay.
CREATE OR REPLACE FUNCTION fn_report_registry()
RETURNS TABLE (purok TEXT, registered INTEGER, active INTEGER, moved INTEGER, deceased INTEGER, not_active INTEGER, with_online_account INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(h."purokZone", 'ALL PUROKS'),
         COUNT(*)::INTEGER,
         (COUNT(*) FILTER (WHERE r."recordStatus" = 'Active'))::INTEGER,
         (COUNT(*) FILTER (WHERE r."recordStatus" = 'Moved'))::INTEGER,
         (COUNT(*) FILTER (WHERE r."recordStatus" = 'Deceased'))::INTEGER,
         (COUNT(*) FILTER (WHERE r."recordStatus" <> 'Active'))::INTEGER,
         (COUNT(*) FILTER (WHERE r."accountId" IS NOT NULL))::INTEGER
  FROM "Resident" r
  JOIN "Household" h ON h."householdId" = r."householdId"
  GROUP BY ROLLUP (h."purokZone")
  ORDER BY GROUPING(h."purokZone"),
           NULLIF(regexp_replace(h."purokZone", '\D', '', 'g'), '')::INTEGER NULLS LAST,
           1;
$$;
