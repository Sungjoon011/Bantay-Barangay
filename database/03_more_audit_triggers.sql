-- 03_more_audit_triggers.sql
-- One reusable audit function. The primary-key column name is passed as the trigger argument.
-- "Who did it" comes from the session setting app.account_id (set by the API for every write).

CREATE OR REPLACE FUNCTION fn_audit_generic()
RETURNS TRIGGER AS $$
DECLARE
  v_row JSONB;
  v_id  TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
  ELSE
    v_row := to_jsonb(NEW);
  END IF;

  v_id := v_row ->> TG_ARGV[0];

  INSERT INTO "SystemAuditLog" ("accountId", "actionPerformed", "tableAffected")
  VALUES (
    NULLIF(current_setting('app.account_id', true), '')::INTEGER,
    TG_OP || ' ' || TG_ARGV[0] || '=' || COALESCE(v_id, '?'),
    TG_TABLE_NAME
  );

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_document_request ON "DocumentRequest";
CREATE TRIGGER trg_audit_document_request
AFTER INSERT OR UPDATE OR DELETE ON "DocumentRequest"
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic('requestId');

DROP TRIGGER IF EXISTS trg_audit_incident_blotter ON "IncidentBlotter";
CREATE TRIGGER trg_audit_incident_blotter
AFTER INSERT OR UPDATE OR DELETE ON "IncidentBlotter"
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic('caseId');

DROP TRIGGER IF EXISTS trg_audit_payment ON "Payment";
CREATE TRIGGER trg_audit_payment
AFTER INSERT OR UPDATE OR DELETE ON "Payment"
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic('paymentId');

DROP TRIGGER IF EXISTS trg_audit_business_permit ON "BusinessPermit";
CREATE TRIGGER trg_audit_business_permit
AFTER INSERT OR UPDATE OR DELETE ON "BusinessPermit"
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic('permitId');

-- Credential / security changes only (the password itself is never copied into the log)
DROP TRIGGER IF EXISTS trg_audit_private_account ON "PrivateAccount";
CREATE TRIGGER trg_audit_private_account
AFTER INSERT OR DELETE OR UPDATE OF "passwordHash", "email", "systemRole", "accountStatus" ON "PrivateAccount"
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic('accountId');
