-- setup_database_automation.sql

-- 1. AUTOMATED AUDIT LOGGING TRIGGER
CREATE OR REPLACE FUNCTION process_incident_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO "audit_logs" ("table_name", "action", "record_id", "old_data", "new_data", "changed_at")
        VALUES ('incidents', 'UPDATE', OLD.id, row_to_json(OLD), row_to_json(NEW), NOW());
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO "audit_logs" ("table_name", "action", "record_id", "old_data", "changed_at")
        VALUES ('incidents', 'DELETE', OLD.id, row_to_json(OLD), NOW());
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_incident_audit ON "incidents";

CREATE TRIGGER trigger_incident_audit
AFTER UPDATE OR DELETE ON "incidents"
FOR EACH ROW
EXECUTE FUNCTION process_incident_audit_log();


-- 2. STORED PROCEDURE FOR INCIDENT STATUS UPDATES
CREATE OR REPLACE PROCEDURE update_incident_status(
    p_incident_id INT,
    p_new_status VARCHAR,
    p_updated_by INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "incidents"
    SET "status" = p_new_status
    WHERE "id" = p_incident_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Incident record with ID % not found', p_incident_id;
    END IF;
END;
$$;


-- 3. ROLE-BASED ACCESS CONTROL (RBAC) PERMISSIONS
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN PASSWORD 'SecureAppPass2026!';
    END IF;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;