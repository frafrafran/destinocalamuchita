-- Defense in depth for hosted PostgreSQL (Supabase exposes the public schema through its REST API).
-- Row Level Security without policies blocks every role except the table owner, which is the role the
-- app connects with, so the app is unaffected. New tables added later should enable it too.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
