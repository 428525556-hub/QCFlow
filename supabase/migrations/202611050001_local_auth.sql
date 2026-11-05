-- 自建认证所需结构。仅加入仓库，不在本轮自动执行。
begin;

alter table public.users add column if not exists password_hash text;
alter table public.users add column if not exists email_verified_at timestamptz;
alter table public.users add column if not exists failed_login_attempts integer not null default 0;
alter table public.users add column if not exists locked_until timestamptz;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function app.set_updated_at();

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists auth_sessions_user_id_idx on public.auth_sessions (user_id, created_at desc);
create index if not exists auth_sessions_expires_at_idx on public.auth_sessions (expires_at);
create index if not exists password_reset_tokens_user_id_idx on public.password_reset_tokens (user_id, created_at desc);
create index if not exists password_reset_tokens_expires_at_idx on public.password_reset_tokens (expires_at);

commit;
