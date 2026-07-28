-- 2026-07-28 보안·정합성 보강 (미결 「그 밖 결정 변경 잔여분」 중 인증 관련 2건)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL. 앱 코드가 alter 하지 않음

-- 1) 이메일 대소문자 정규화
--    앱은 소문자로 저장하고, DB도 lower(email) 유일성을 강제함.
--    기존 행에 대소문자만 다른 중복이 있으면 아래 update 가 V1 의 email unique 제약에 걸려 먼저 실패함
--    (인덱스 생성까지 가지도 않음). 자동 병합하지 않고 실패로 드러내는 것이 맞음 -
--    어느 계정을 남길지는 사람이 정할 일임
update users set email = lower(email) where email <> lower(email);
create unique index if not exists idx_users_email_lower on users (lower(email));

-- 2) 비밀번호 변경 시각
--    변경 이전에 발급된 JWT를 무효화하는 기준선. stateless JWT라 서버가 토큰을 회수할 수 없으므로,
--    "언제 이후 발급분만 유효한가"를 사용자 행에 두고 매 요청에서 대조함
--    눈금은 초 - JWT의 iat 가 초 단위로 내림되므로 기준선도 같은 눈금이어야 함. 밀리초를 남기면
--    가입 직후 발급된 토큰이 자기보다 늦은 기준선에 걸려 곧바로 무효가 됨.
--    **가입 경로의 기본값만 DB 시계를 씀**(비밀번호 변경은 앱이 시각을 넘김) - DB 호스트 시계가 앱보다
--    1초 이상 앞서면 가입 직후 토큰이 무효가 됨. 단일 호스트 전제라 감수하며 경위는 처리 이력에 있음
alter table users add column if not exists password_changed_at timestamptz not null
	default date_trunc('second', now());
