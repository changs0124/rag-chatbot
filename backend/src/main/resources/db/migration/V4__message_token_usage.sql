-- 2026-08-19 턴별 토큰 사용량 기록 (FEAT-OPS-001)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- 앱 안에서 비용을 볼 수단이 전혀 없었음. OpenAI 완료 이벤트에 usage 가 이미 실려 오는데
-- 인용만 뽑고 버리고 있었으므로, 새로 호출하는 것이 아니라 **버리던 것을 줍는** 변경임(추가 API 비용 0).
--
-- **nullable 로 둠.** 0 을 기본값으로 두면 "모르는 것"과 "정말 0"이 구분되지 않아 합계가 거짓이 됨 :
--   - 사용자 메시지 행     : 사용량이라는 개념이 없음
--   - 목업 응답            : 실제 토큰을 쓰지 않음. 숫자를 지어내면 합계가 오염됨
--   - 중단·오류 부분 저장  : 비용은 발생했지만 usage 가 도착하기 전에 끝나 값을 알 방법이 없음
--   - 이 컬럼 이전의 행    : 아래 참고
-- 조회할 때는 `where input_tokens is not null` 로 거름 - 빼면 위 네 부류가 0 으로 섞여
-- 턴당 평균이 실제보다 낮게 나옴.
--
-- **소급 보정(backfill)을 하지 않음.** 이전에 저장된 행의 사용량은 어디에도 남아 있지 않아
-- 복원이 불가능함. 추정치를 채우면 그 순간부터 합계가 거짓이 되므로 비운 채 둠(V3 와 같은 판단).
alter table messages add column if not exists input_tokens  integer;
alter table messages add column if not exists output_tokens integer;
