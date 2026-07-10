create or replace function public.emx_clean_display_name(input text)
returns text
language sql
immutable
as $$
  select left(
    coalesce(
      nullif(
        trim(regexp_replace(regexp_replace(coalesce(input, ''), '[^A-Za-z0-9 _.-]', '', 'g'), '[[:space:]]+', ' ', 'g')),
        ''
      ),
      'EMX Trainer'
    ),
    24
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.emx_clean_display_name(new.raw_user_meta_data->>'display_name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.sync_user_profile_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ? 'display_name' then
    update public.profiles
    set display_name = public.emx_clean_display_name(new.raw_user_meta_data->>'display_name')
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of raw_user_meta_data on auth.users
for each row execute function public.sync_user_profile_metadata();

update public.profiles p
set display_name = public.emx_clean_display_name(coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), p.display_name))
from auth.users u
where u.id = p.id;
