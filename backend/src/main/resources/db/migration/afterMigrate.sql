-- 런타임 계정 권한(#415). Flyway 가 마이그레이션 뒤 **기동마다** 돌린다(afterMigrate 콜백) - 버전 마이그레이션이 아니라
-- 새 테이블이 생겨도, 계정을 나중에 만들어도 다음 기동에 권한이 맞춰진다. 소유자(Flyway 계정)로 돈다.
--
-- 앱이 소유자와 같은 계정으로 접속하면(로컬 · 옛 구성) 아무것도 하지 않는다. 계정이 아직 없어도 기동을 막지 않는다.
-- 마이그레이션 이력은 런타임 계정이 고칠 이유가 없어 권한을 거둔다.
DO $$
DECLARE
  runtime text := '${runtime_user}';
BEGIN
  IF runtime <> '' AND runtime <> current_user AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', runtime);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', runtime);
    EXECUTE format('REVOKE ALL ON flyway_schema_history FROM %I', runtime);
  END IF;
END $$;
