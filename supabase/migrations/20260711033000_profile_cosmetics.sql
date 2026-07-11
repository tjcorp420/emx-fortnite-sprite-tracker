alter table public.profiles
  add column if not exists profile_badge text not null default 'spark',
  add column if not exists profile_title text not null default 'Sprite Scout',
  add column if not exists avatar_frame text not null default 'neon';

alter table public.profiles
  drop constraint if exists profiles_profile_badge_check,
  drop constraint if exists profiles_avatar_frame_check;

alter table public.profiles
  add constraint profiles_profile_badge_check check (profile_badge in ('spark', 'collector', 'master', 'legend')),
  add constraint profiles_avatar_frame_check check (avatar_frame in ('neon', 'volt', 'royal', 'legend'));

drop function if exists public.get_emx_leaderboard(integer);
create function public.get_emx_leaderboard(requested_limit integer default 50)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  avatar_color text,
  profile_badge text,
  profile_badge_mark text,
  profile_title text,
  avatar_frame text,
  xp integer,
  level integer,
  owned_count bigint,
  mastered_count bigint,
  owned_percent numeric,
  mastered_percent numeric,
  indexed_count integer
)
language sql stable security definer set search_path = public as $$
with eligible as (
  select p.id, p.display_name, p.avatar_color, p.profile_badge, p.profile_title, p.avatar_frame,
    coalesce(selected_tracker.id, first_tracker.id) as tracker_id
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select t.id from public.trackers t
    where t.owner_id = p.id and t.id = p.leaderboard_tracker_id
    limit 1
  ) selected_tracker on true
  left join lateral (
    select t.id from public.trackers t
    where t.owner_id = p.id
    order by t.created_at asc
    limit 1
  ) first_tracker on true
  where p.leaderboard_opt_in = true and coalesce(u.is_anonymous, false) = false
), counts as (
  select e.id, e.display_name, e.avatar_color, e.profile_badge, e.profile_title, e.avatar_frame,
    count(sp.sprite_id) filter (where sp.owned) as owned_count,
    count(sp.sprite_id) filter (where sp.mastered) as mastered_count
  from eligible e
  left join public.sprite_progress sp on sp.user_id = e.id and sp.tracker_id = e.tracker_id
  group by e.id, e.display_name, e.avatar_color, e.profile_badge, e.profile_title, e.avatar_frame
), achievement_totals as (
  select e.id, coalesce(sum(a.xp_awarded), 0)::integer as achievement_xp
  from eligible e
  left join public.user_tracker_achievements a on a.user_id = e.id and a.tracker_id = e.tracker_id
  group by e.id
), scored as (
  select c.*, a.achievement_xp,
    (c.owned_count * 25 + c.mastered_count * 100 + a.achievement_xp)::integer as score
  from counts c join achievement_totals a using (id)
)
select row_number() over (order by score desc, mastered_count desc, owned_count desc, display_name asc) as rank,
  id as user_id, display_name, avatar_color, profile_badge,
  case profile_badge when 'collector' then '+' when 'master' then 'M' when 'legend' then 'E' else '*' end as profile_badge_mark,
  profile_title, avatar_frame, score as xp,
  (floor(score / 500.0) + 1)::integer as level,
  owned_count, mastered_count,
  round(owned_count * 100.0 / 146, 2) as owned_percent,
  round(mastered_count * 100.0 / 146, 2) as mastered_percent,
  146 as indexed_count
from scored
order by score desc, mastered_count desc, owned_count desc, display_name asc
limit greatest(1, least(coalesce(requested_limit, 50), 100));
$$;

grant execute on function public.get_emx_leaderboard(integer) to authenticated;
