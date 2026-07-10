alter table public.profiles alter column leaderboard_opt_in set default true;

update public.profiles p
set leaderboard_opt_in = true
from auth.users u
where u.id = p.id and coalesce(u.is_anonymous, false) = false;

drop policy if exists achievement_update on public.user_tracker_achievements;
create policy achievement_update on public.user_tracker_achievements
  for update using (user_id = auth.uid() and public.member_role(tracker_id) in ('owner', 'editor'))
  with check (user_id = auth.uid() and public.member_role(tracker_id) in ('owner', 'editor'));

create or replace function public.get_emx_leaderboard(requested_limit integer default 50)
returns table (rank bigint, user_id uuid, display_name text, avatar_color text, xp integer, level integer, owned_count bigint, mastered_count bigint, owned_percent numeric, mastered_percent numeric, indexed_count integer)
language sql stable security definer set search_path = public as $$
with eligible as (
  select p.id, p.display_name, p.avatar_color,
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
  select e.id, e.display_name, e.avatar_color,
    count(sp.sprite_id) filter (where sp.owned) as owned_count,
    count(sp.sprite_id) filter (where sp.mastered) as mastered_count
  from eligible e
  left join public.sprite_progress sp on sp.user_id = e.id and sp.tracker_id = e.tracker_id
  group by e.id, e.display_name, e.avatar_color
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
  id as user_id, display_name, avatar_color, score as xp,
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
