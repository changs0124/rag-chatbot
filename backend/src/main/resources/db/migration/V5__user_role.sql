-- 2026-08-19 관리자 권한 (FEAT-ADMIN-001 · REQ-ADMIN-004)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- 지금까지는 로그인한 전원이 동등했음. RAG 문서를 관리할 사람과 아닌 사람을 구분할 수단이 없어
-- 문서 등록 경로 자체를 제품 안에 둘 수 없었음(FEAT-ADMIN-002 의 전제).
--
-- **승격은 앱이 환경변수 ADMIN_EMAILS 명단으로 함.** 앱 안에 권한 상승 API 를 두지 않으므로
-- 공격면이 늘지 않고, 통제권이 배포 설정에 남음. 대가로 명단 변경에 재기동이 필요하며
-- 사내 소규모에서 관리자 교체는 드물어 감수함(2026-08-19 결정, docs/99_inbox/03-roles.md 1.1절).
--
-- 기존 행은 전부 'user' 로 채워짐. 소급 승격은 하지 않음 - 명단 기반 동기화가 기동 때 돌므로
-- ADMIN_EMAILS 에 넣는 것으로 충분함.
alter table users add column if not exists role text not null default 'user';

-- check 제약은 별도로 검. add column 과 함께 걸면 이미 컬럼이 있는 환경에서 재실행 시
-- 컬럼 추가가 건너뛰어지며 제약도 함께 빠짐
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'users_role_check') then
        alter table users add constraint users_role_check check (role in ('user', 'admin'));
    end if;
end $$;
