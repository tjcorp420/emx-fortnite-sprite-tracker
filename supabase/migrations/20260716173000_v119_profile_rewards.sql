alter table public.profiles
  drop constraint if exists profiles_profile_badge_check,
  drop constraint if exists profiles_avatar_frame_check;

alter table public.profiles
  add constraint profiles_profile_badge_check check (profile_badge in ('spark', 'collector', 'water', 'holo', 'master', 'mastery', 'cosmic', 'legend')),
  add constraint profiles_avatar_frame_check check (avatar_frame in ('neon', 'volt', 'royal', 'prism', 'cosmic', 'legend'));
