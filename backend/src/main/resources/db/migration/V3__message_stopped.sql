-- 2026-07-28 중단 표시 (PR #7 재리뷰 지적 2)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- 중단된 답변을 status='complete' 로 저장하기로 한 결정(같은 날) 때문에, 화면의 무자료 배너
-- (assistant + complete + 출처 0건)가 **출처를 판정하기도 전에 끊긴 답변**에까지 붙었음.
-- 인용은 스트림 끝에 오므로 중단 시점에는 항상 0건이라 100% 오표시였음.
-- status 는 결정대로 complete 로 두고, "어떻게 끝났는지"만 따로 표시해 배너를 억제함.
-- **소급 보정(backfill)은 하지 않음** - 이 컬럼 이전에 저장된 중단 답변은 정상 완료분과 구분할
-- 표시가 없어 식별이 불가능함. 그 행들에는 거짓 배너가 계속 붙으며, 개발 단계 데이터라 감수함
alter table messages add column if not exists stopped boolean not null default false;
