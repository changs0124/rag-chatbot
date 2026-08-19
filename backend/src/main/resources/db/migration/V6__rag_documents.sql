-- 2026-08-19 RAG 문서 관리 (FEAT-ADMIN-002 · REQ-ADMIN-001·002·003)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- 공용 Vector Store 에 문서를 넣는 경로가 제품 안에 없었음. OpenAI 대시보드 수동 작업뿐이라
--   - 규정이 개정될 때마다 개발자가 콘솔에 들어가야 하고
--   - **누가 언제 어떤 문서를 올렸는지 기록이 어디에도 남지 않으며**
--   - 인덱싱 실패를 아무도 모름
-- 이 표가 그 세 가지를 받는다. OpenAI 쪽에는 "누가 올렸는가"가 없으므로 저장소에 남긴다.
create table if not exists rag_documents (
    id              uuid primary key default gen_random_uuid(),
    filename        text not null,
    openai_file_id  text not null,
    vector_store_id text not null,
    byte_size       bigint not null,
    status          text not null default 'in_progress'
                    check (status in ('in_progress', 'completed', 'failed')),
    -- **on delete restrict** : 다른 표는 전부 cascade 인데 여기만 다름.
    -- 사용자를 지웠다고 문서 이력이 사라지면 감사 기록(REQ-ADMIN-002)이 성립하지 않음.
    -- 의도된 차이이며, 사용자 삭제가 막히는 것이 기록이 사라지는 것보다 낫다고 판단함
    uploaded_by     uuid not null references users(id) on delete restrict,
    created_at      timestamptz not null default now(),
    -- soft delete. 이 저장소에서 유일함 - "언제 내려갔는가"가 감사 대상이라 행을 지우면 그 사실이 남지 않음.
    -- 목록 조회는 deleted_at is null 만 봄
    deleted_at      timestamptz
);

-- 살아 있는 문서를 최신순으로 읽는 것이 목록 화면의 유일한 질의임
create index if not exists idx_rag_documents_alive on rag_documents (deleted_at, created_at desc);

-- updated_at 과 트리거를 두지 않음 : 바뀌는 값은 status 와 deleted_at 둘뿐이고,
-- 둘 다 "언제 바뀌었는지"가 그 자체로 의미 있는 값임. 범용 updated_at 은 무엇이 언제 바뀌었는지를 뭉갬
