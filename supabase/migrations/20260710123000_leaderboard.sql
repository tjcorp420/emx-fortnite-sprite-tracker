alter table public.profiles add column if not exists leaderboard_opt_in boolean not null default false;
alter table public.profiles add column if not exists leaderboard_tracker_id uuid references public.trackers(id) on delete set null;

create or replace function public.add_tracker_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tracker_members (tracker_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  update public.profiles set leaderboard_tracker_id = coalesce(leaderboard_tracker_id, new.id) where id = new.owner_id;
  return new;
end; $$;

create or replace function public.get_emx_leaderboard(requested_limit integer default 50)
returns table (rank bigint, user_id uuid, display_name text, avatar_color text, xp integer, level integer, owned_count bigint, mastered_count bigint, owned_percent numeric, mastered_percent numeric, indexed_count integer)
language sql stable security definer set search_path = public as $$
with eligible as (
  select p.id, p.display_name, p.avatar_color, coalesce(p.leaderboard_tracker_id, first_tracker.id) as tracker_id
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (select t.id from public.trackers t where t.owner_id = p.id order by t.created_at asc limit 1) first_tracker on true
  where p.leaderboard_opt_in = true and coalesce(u.is_anonymous, false) = false
), counts as (
  select e.id, e.display_name, e.avatar_color, count(sp.sprite_id) filter (where sp.owned) as owned_count, count(sp.sprite_id) filter (where sp.mastered) as mastered_count
  from eligible e left join public.sprite_progress sp on sp.user_id = e.id and sp.tracker_id = e.tracker_id
  group by e.id, e.display_name, e.avatar_color
), scored as (
  select *, (owned_count * 25 + mastered_count * 100)::integer as score from counts
)
select row_number() over (order by score desc, mastered_count desc, owned_count desc, display_name asc) as rank, id as user_id, display_name, avatar_color, score as xp, (floor(score / 500.0) + 1)::integer as level, owned_count, mastered_count, round(owned_count * 100.0 / 146, 2) as owned_percent, round(mastered_count * 100.0 / 146, 2) as mastered_percent, 146 as indexed_count
from scored order by score desc, mastered_count desc, owned_count desc, display_name asc limit greatest(1, least(requested_limit, 100));
$$;

grant execute on function public.get_emx_leaderboard(integer) to authenticated;
