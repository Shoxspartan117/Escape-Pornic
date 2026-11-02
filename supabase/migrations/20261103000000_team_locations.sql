create table public.team_positions (
  team_id uuid primary key references public.teams(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

create index team_positions_game_id_idx on public.team_positions(game_id);

alter table public.team_positions enable row level security;
revoke all on public.team_positions from anon, authenticated;
grant select (team_id, game_id, latitude, longitude, updated_at)
  on public.team_positions to authenticated;

create policy "Game members can read shared team positions"
  on public.team_positions for select to authenticated
  using (public.is_game_member(game_id));

create or replace function public.set_my_team_position(
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_team_id uuid;
  current_game_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour partager une position.';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Coordonnées GPS invalides.';
  end if;

  select t.id, t.game_id into current_team_id, current_game_id
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.user_id = auth.uid();
  if current_team_id is null then
    raise exception 'Aucune équipe liée à cette session.';
  end if;

  insert into public.team_positions (team_id, game_id, latitude, longitude, updated_at)
  values (current_team_id, current_game_id, p_latitude, p_longitude, now())
  on conflict (team_id) do update
  set game_id = excluded.game_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.clear_my_team_position()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour arrêter le partage de position.';
  end if;

  delete from public.team_positions p
  using public.team_members m
  where p.team_id = m.team_id and m.user_id = auth.uid();
end;
$$;

revoke all on function public.set_my_team_position(double precision, double precision) from public, anon;
revoke all on function public.clear_my_team_position() from public, anon;
grant execute on function public.set_my_team_position(double precision, double precision) to authenticated;
grant execute on function public.clear_my_team_position() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_positions'
  ) then
    alter publication supabase_realtime add table public.team_positions;
  end if;
end;
$$;
