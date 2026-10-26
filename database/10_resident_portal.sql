-- 10_resident_portal.sql : residents file complaints themselves, so staff are recorded later.
ALTER TABLE "IncidentBlotter" ALTER COLUMN "recordedByStaffId" DROP NOT NULL;
