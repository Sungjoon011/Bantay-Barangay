-- 17_staff_and_announcements.sql : run once on the database.
-- The API accepts the priorities Normal / Important / Emergency, but the old CHECK (11_readme_features.sql) only allowed
-- Normal / Urgent / Emergency, so posting an "Important" announcement failed in PostgreSQL. This makes both agree.
ALTER TABLE "Announcement" DROP CONSTRAINT IF EXISTS "Announcement_priority_chk";
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_priority_chk"
  CHECK ("priority" IN ('Normal', 'Important', 'Urgent', 'Emergency'));
-- Removing a staff member only sets PrivateAccount.accountStatus = 'Inactive' and StaffOfficial.recordStatus = 'Resigned',
-- which app_user can already do with UPDATE, so no new GRANT is needed (accounts are never deleted: audit logs point to them).
