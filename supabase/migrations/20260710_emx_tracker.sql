create extension if not exists pgcrypto;

create type public.tracker_visibility as enum ('private', 'shared');
create type public.tracker_role as enum ('owner', 'editor', 'viewer');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Anonymous Trainer',
  avatar_color text not null default '#98ff3f',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-zA-Z0-9_]{3,24}$')
);

create table if not exists public.trackers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My EMX Tracker',
  description text not null default '',
  visibility public.tracker_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracker_members (
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tracker_role not null default 'viewer',
  joined_at timestamptz not null default now(),
  primary key (tracker_id, user_id)
);

create table if not exists public.sprite_progress (
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sprite_id text not null,
  owned boolean not null default false,
  mastered boolean not null default false,
  favorite boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete cascade,
  primary key (tracker_id, user_id, sprite_id)
);

create table if not exists public.user_tracker_achievements (
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  xp_awarded integer not null default 0,
  primary key (tracker_id, user_id, achievement_id)
);

create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null unique,
  event_type text not null,
  xp_amount integer not null check (xp_amount >= 0),
  sprite_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracker_invites (
  id uuid primary key default gen_random_uuid(),
  tracker_id uuid not null references public.trackers(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  role public.tracker_role not null default 'viewer',
  invite_code_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists trackers_touch_updated_at on public.trackers;
create trigger trackers_touch_updated_at before update on public.trackers for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Anonymous Trainer')) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.add_tracker_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.tracker_members (tracker_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing; return new; end; $$;
drop trigger if exists trackers_add_owner on public.trackers;
create trigger trackers_add_owner after insert on public.trackers for each row execute function public.add_tracker_owner();

create or replace function public.is_tracker_member(p_tracker_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.tracker_members where tracker_id = p_tracker_id and user_id = auth.uid()); $$;
create or replace function public.is_tracker_owner(p_tracker_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.trackers where id = p_tracker_id and owner_id = auth.uid()); $$;
create or replace function public.member_role(p_tracker_id uuid) returns public.tracker_role language sql stable security definer set search_path = public as $$ select role from public.tracker_members where tracker_id = p_tracker_id and user_id = auth.uid(); $$;

create or replace function public.redeem_tracker_invite(invite_code text) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare invite_row public.tracker_invites%rowtype;
begin
  select * into invite_row from public.tracker_invites where invite_code_hash = encode(digest(invite_code, 'sha256'), 'hex') and revoked_at is null and expires_at > now() and use_count < max_uses for update;
  if invite_row.id is null then raise exception 'Invite is invalid, expired, or already used'; end if;
  insert into public.tracker_members (tracker_id, user_id, role) values (invite_row.tracker_id, auth.uid(), case when invite_row.role = 'owner' then 'viewer' else invite_row.role end) on conflict (tracker_id, user_id) do update set role = excluded.role;
  update public.tracker_invites set use_count = use_count + 1 where id = invite_row.id;
  update public.trackers set visibility = 'shared' where id = invite_row.tracker_id;
  return invite_row.tracker_id;
end; $$;

alter table public.profiles enable row level security;
alter table public.trackers enable row level security;
alter table public.tracker_members enable row level security;
alter table public.sprite_progress enable row level security;
alter table public.user_tracker_achievements enable row level security;
alter table public.xp_events enable row level security;
alter table public.tracker_invites enable row level security;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists trackers_member_select on public.trackers;
create policy trackers_member_select on public.trackers for select using (owner_id = auth.uid() or public.is_tracker_member(id));
drop policy if exists trackers_owner_insert on public.trackers;
create policy trackers_owner_insert on public.trackers for insert with check (owner_id = auth.uid());
drop policy if exists trackers_owner_update on public.trackers;
create policy trackers_owner_update on public.trackers for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists trackers_owner_delete on public.trackers;
create policy trackers_owner_delete on public.trackers for delete using (owner_id = auth.uid());

drop policy if exists members_select on public.tracker_members;
create policy members_select on public.tracker_members for select using (public.is_tracker_member(tracker_id));
drop policy if exists members_owner_manage on public.tracker_members;
create policy members_owner_manage on public.tracker_members for all using (public.is_tracker_owner(tracker_id)) with check (public.is_tracker_owner(tracker_id) and role <> 'owner');

drop policy if exists progress_select on public.sprite_progress;
create policy progress_select on public.sprite_progress for select using (public.is_tracker_member(tracker_id) and (user_id = auth.uid() or exists (select 1 from public.trackers t where t.id = tracker_id and t.visibility = 'shared')));
drop policy if exists progress_insert on public.sprite_progress;
create policy progress_insert on public.sprite_progress for insert with check (user_id = auth.uid() and updated_by = auth.uid() and public.member_role(tracker_id) in ('owner', 'editor'));
drop policy if exists progress_update on public.sprite_progress;
create policy progress_update on public.sprite_progress for update using (user_id = auth.uid() and public.member_role(tracker_id) in ('owner', 'editor')) with check (user_id = auth.uid() and updated_by = auth.uid());
drop policy if exists progress_delete on public.sprite_progress;
create policy progress_delete on public.sprite_progress for delete using (user_id = auth.uid());

drop policy if exists achievement_select on public.user_tracker_achievements;
create policy achievement_select on public.user_tracker_achievements for select using (public.is_tracker_member(tracker_id) and (user_id = auth.uid() or exists (select 1 from public.trackers t where t.id = tracker_id and t.visibility = 'shared')));
drop policy if exists achievement_insert on public.user_tracker_achievements;
create policy achievement_insert on public.user_tracker_achievements for insert with check (user_id = auth.uid() and public.member_role(tracker_id) in ('owner', 'editor'));

drop policy if exists xp_select on public.xp_events;
create policy xp_select on public.xp_events for select using (public.is_tracker_member(tracker_id) and user_id = auth.uid());
drop policy if exists xp_insert on public.xp_events;
create policy xp_insert on public.xp_events for insert with check (user_id = auth.uid() and public.member_role(tracker_id) in ('owner', 'editor'));

drop policy if exists invites_owner_select on public.tracker_invites;
create policy invites_owner_select on public.tracker_invites for select using (public.is_tracker_owner(tracker_id));
drop policy if exists invites_owner_insert on public.tracker_invites;
create policy invites_owner_insert on public.tracker_invites for insert with check (created_by = auth.uid() and public.is_tracker_owner(tracker_id));
drop policy if exists invites_owner_update on public.tracker_invites;
create policy invites_owner_update on public.tracker_invites for update using (public.is_tracker_owner(tracker_id)) with check (public.is_tracker_owner(tracker_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.redeem_tracker_invite(text) to authenticated;
