-- DayFlow schema. Run once in Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null, color text not null default '#4f46e5',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  freq text not null check (freq in ('daily','weekly','monthly','custom')),
  interval_days int not null default 1, until date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null, notes text not null default '',
  done boolean not null default false, completed_at timestamptz,
  start_at timestamptz, due_at timestamptz, all_day boolean not null default false,
  priority smallint not null default 1 check (priority between 0 and 3),
  category_id uuid references categories on delete set null,
  tags text[] not null default '{}',
  est_minutes int, spent_minutes int not null default 0, remind_minutes int,
  rule_id uuid references recurring_rules on delete set null,
  parent_id uuid references tasks on delete cascade,
  position double precision not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null, notes text not null default '',
  start_at timestamptz not null, end_at timestamptz not null, all_day boolean not null default false,
  category_id uuid references categories on delete set null,
  google_event_id text, google_etag text,            -- reserved for Google Calendar sync
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, google_event_id));

create index on tasks (user_id, due_at);
create index on events (user_id, start_at);

create function touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['categories','recurring_rules','tasks','events'] loop
    execute format('create trigger touch before update on %I for each row execute function touch()', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy own on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter publication supabase_realtime add table tasks, events, categories;
