   CREATE OR REPLACE FUNCTION fn_audit_resident()
   RETURNS TRIGGER AS $$
   DECLARE
     v_id INTEGER;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       v_id := OLD."residentId";
     ELSE
       v_id := NEW."residentId";
     END IF;

     INSERT INTO "SystemAuditLog" ("accountId", "actionPerformed", "tableAffected")
     VALUES (
       NULLIF(current_setting('app.account_id', true), '')::INTEGER,
       TG_OP || ' residentId=' || v_id,
       TG_TABLE_NAME
     );

     RETURN NULL;
   END;
   $$ LANGUAGE plpgsql;

   DROP TRIGGER IF EXISTS trg_audit_resident ON "Resident";
   CREATE TRIGGER trg_audit_resident
   AFTER INSERT OR UPDATE OR DELETE ON "Resident"
   FOR EACH ROW EXECUTE FUNCTION fn_audit_resident();