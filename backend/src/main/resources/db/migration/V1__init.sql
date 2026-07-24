-- rag-chatbot 초기 스키마 (Phase 1)
-- PostgreSQL. uuid 기본키 + gen_random_uuid()(PG13+ 코어 제공). 소유권은 앱 코드가 검증(P-3)

-- 사용자 (자체 이메일/비밀번호 인증 - Supabase auth.users 대체)
create table if not exists users (
    id            uuid primary key default gen_random_uuid(),
    email         text not null unique,
    password_hash text not null,
    name          text not null,
    theme         text not null default 'system' check (theme in ('light', 'dark', 'system')),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- 대화방
create table if not exists conversations (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references users(id) on delete cascade,
    title           text not null default '새 대화',
    vector_store_id text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_conversations_user on conversations(user_id, updated_at desc);

-- 메시지 (status는 DB에 complete|error만 기록. streaming은 프론트 로컬 상태)
create table if not exists messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references conversations(id) on delete cascade,
    role            text not null check (role in ('user', 'assistant')),
    content         text,
    status          text not null default 'complete' check (status in ('complete', 'error')),
    created_at      timestamptz not null default now()
);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- 출처(각주) 영속화 (P-6 - 참조 구현이 미저장으로 소실시킨 결함 개선)
create table if not exists citations (
    id          uuid primary key default gen_random_uuid(),
    message_id  uuid not null references messages(id) on delete cascade,
    seq         integer not null,          -- 각주 번호 [1][2] ...
    source_name text not null,
    snippet     text,
    uri         text,
    created_at  timestamptz not null default now()
);
create index if not exists idx_citations_message on citations(message_id, seq);

-- 첨부 (로컬 디스크 저장. 업로드 시점엔 message_id가 null이므로 nullable + user_id 기준 소유)
create table if not exists attachments (
    id             uuid primary key default gen_random_uuid(),
    message_id     uuid references messages(id) on delete cascade,
    user_id        uuid not null references users(id) on delete cascade,
    storage_path   text not null,
    file_type      text not null check (file_type in ('image', 'document')),
    openai_file_id text,
    created_at     timestamptz not null default now()
);
create index if not exists idx_attachments_message on attachments(message_id);
create index if not exists idx_attachments_user on attachments(user_id);

-- updated_at 자동 갱신 트리거 (users, conversations)
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
    for each row execute function set_updated_at();

drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at before update on conversations
    for each row execute function set_updated_at();
