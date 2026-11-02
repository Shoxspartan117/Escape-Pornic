alter table public.team_members
  add column if not exists player_name text not null default 'Joueur';

alter table public.team_members
  drop constraint if exists team_members_player_name_check;

alter table public.team_members
  add constraint team_members_player_name_check
  check (char_length(player_name) between 1 and 32);

create table public.player_positions (
  player_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

create index player_positions_game_id_idx on public.player_positions(game_id);

alter table public.player_positions enable row level security;
revoke all on public.player_positions from anon, authenticated;
grant select (player_id, team_id, game_id, latitude, longitude, updated_at)
  on public.player_positions to authenticated;
grant select (user_id, team_id, created_at, player_name)
  on public.team_members to authenticated;

create policy "Game members can read shared player positions"
  on public.player_positions for select to authenticated
  using (public.is_game_member(game_id));

create policy "Game members can read player names"
  on public.team_members for select to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = team_members.team_id
        and public.is_game_member(t.game_id)
    )
  );

drop function if exists public.create_game_with_team(text, text, text);
drop function if exists public.create_team_in_game(text, text, text);
drop function if exists public.join_team_by_code(text);
drop function if exists public.set_my_team_position(double precision, double precision);
drop function if exists public.clear_my_team_position();

create or replace function public.create_game_with_team(
  p_game_name text,
  p_team_name text,
  p_color text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_game public.games%rowtype;
  new_team public.teams%rowtype;
  clean_player_name text := btrim(p_player_name);
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour créer une partie.';
  end if;
  if exists (select 1 from public.team_members where user_id = current_user_id) then
    raise exception 'Ce navigateur appartient déjà à une équipe.';
  end if;
  if p_game_name is null or char_length(btrim(p_game_name)) not between 1 and 40 then
    raise exception 'Le nom de la partie doit contenir de 1 à 40 caractères.';
  end if;
  if p_team_name is null or char_length(btrim(p_team_name)) not between 1 and 32 then
    raise exception 'Le nom de l’équipe doit contenir de 1 à 32 caractères.';
  end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'La couleur de l’équipe est invalide.';
  end if;
  if clean_player_name is null or char_length(clean_player_name) not between 1 and 32 then
    raise exception 'Votre nom de joueur doit contenir de 1 à 32 caractères.';
  end if;

  insert into public.games (name, join_code)
  values (btrim(p_game_name), public.generate_join_code())
  returning * into new_game;

  insert into public.teams (game_id, name, color, join_code)
  values (new_game.id, btrim(p_team_name), p_color, public.generate_join_code())
  returning * into new_team;

  insert into public.team_members (user_id, team_id, player_name)
  values (current_user_id, new_team.id, clean_player_name);

  return jsonb_build_object(
    'game_id', new_game.id,
    'game_name', new_game.name,
    'game_code', new_game.join_code,
    'team_id', new_team.id,
    'team_name', new_team.name,
    'team_color', new_team.color,
    'team_code', new_team.join_code,
    'player_id', current_user_id,
    'player_name', clean_player_name
  );
end;
$$;

create or replace function public.create_team_in_game(
  p_game_code text,
  p_team_name text,
  p_color text,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_game public.games%rowtype;
  new_team public.teams%rowtype;
  clean_player_name text := btrim(p_player_name);
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour rejoindre une partie.';
  end if;
  if exists (select 1 from public.team_members where user_id = current_user_id) then
    raise exception 'Ce navigateur appartient déjà à une équipe.';
  end if;
  if p_game_code is null or p_game_code !~* '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'Code de partie invalide.';
  end if;
  if p_team_name is null or char_length(btrim(p_team_name)) not between 1 and 32 then
    raise exception 'Le nom de l’équipe doit contenir de 1 à 32 caractères.';
  end if;
  if p_color is null or p_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'La couleur de l’équipe est invalide.';
  end if;
  if clean_player_name is null or char_length(clean_player_name) not between 1 and 32 then
    raise exception 'Votre nom de joueur doit contenir de 1 à 32 caractères.';
  end if;

  select * into target_game from public.games where join_code = upper(p_game_code);
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  insert into public.teams (game_id, name, color, join_code)
  values (target_game.id, btrim(p_team_name), p_color, public.generate_join_code())
  returning * into new_team;

  insert into public.team_members (user_id, team_id, player_name)
  values (current_user_id, new_team.id, clean_player_name);

  return jsonb_build_object(
    'game_id', target_game.id,
    'game_name', target_game.name,
    'game_code', target_game.join_code,
    'team_id', new_team.id,
    'team_name', new_team.name,
    'team_color', new_team.color,
    'team_code', new_team.join_code,
    'player_id', current_user_id,
    'player_name', clean_player_name
  );
end;
$$;

create or replace function public.join_team_by_code(p_team_code text, p_player_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_team public.teams%rowtype;
  target_game public.games%rowtype;
  clean_player_name text := btrim(p_player_name);
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour rejoindre une équipe.';
  end if;
  if exists (select 1 from public.team_members where user_id = current_user_id) then
    raise exception 'Ce navigateur appartient déjà à une équipe.';
  end if;
  if p_team_code is null or p_team_code !~* '^[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'Code d’équipe invalide.';
  end if;
  if clean_player_name is null or char_length(clean_player_name) not between 1 and 32 then
    raise exception 'Votre nom de joueur doit contenir de 1 à 32 caractères.';
  end if;

  select * into target_team from public.teams where join_code = upper(p_team_code);
  if not found then
    raise exception 'Aucune équipe ne correspond à ce code.';
  end if;
  select * into target_game from public.games where id = target_team.game_id;

  insert into public.team_members (user_id, team_id, player_name)
  values (current_user_id, target_team.id, clean_player_name);

  return jsonb_build_object(
    'game_id', target_game.id,
    'game_name', target_game.name,
    'game_code', target_game.join_code,
    'team_id', target_team.id,
    'team_name', target_team.name,
    'team_color', target_team.color,
    'team_code', target_team.join_code,
    'player_id', current_user_id,
    'player_name', clean_player_name
  );
end;
$$;

create or replace function public.get_my_team()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour retrouver votre équipe.';
  end if;

  select jsonb_build_object(
    'game_id', g.id,
    'game_name', g.name,
    'game_code', g.join_code,
    'team_id', t.id,
    'team_name', t.name,
    'team_color', t.color,
    'team_code', t.join_code,
    'player_id', current_user_id,
    'player_name', m.player_name
  )
  into result
  from public.team_members m
  join public.teams t on t.id = m.team_id
  join public.games g on g.id = t.game_id
  where m.user_id = current_user_id;

  return result;
end;
$$;

create or replace function public.set_my_player_name(p_player_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_player_name text := btrim(p_player_name);
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour modifier votre nom.';
  end if;
  if clean_player_name is null or char_length(clean_player_name) not between 1 and 32 then
    raise exception 'Votre nom de joueur doit contenir de 1 à 32 caractères.';
  end if;

  update public.team_members
  set player_name = clean_player_name
  where user_id = auth.uid();
  if not found then
    raise exception 'Aucune équipe liée à cette session.';
  end if;
  return clean_player_name;
end;
$$;

create or replace function public.set_my_player_position(
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_team_id uuid;
  current_game_id uuid;
begin
  if current_user_id is null then
    raise exception 'Connectez-vous pour partager une position.';
  end if;
  if p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180 then
    raise exception 'Coordonnées GPS invalides.';
  end if;

  select t.id, t.game_id into current_team_id, current_game_id
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.user_id = current_user_id;
  if current_team_id is null then
    raise exception 'Aucune équipe liée à cette session.';
  end if;

  delete from public.player_positions where updated_at < now() - interval '90 seconds';
  insert into public.player_positions (player_id, team_id, game_id, latitude, longitude, updated_at)
  values (current_user_id, current_team_id, current_game_id, p_latitude, p_longitude, now())
  on conflict (player_id) do update
  set team_id = excluded.team_id,
      game_id = excluded.game_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.clear_my_player_position()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour arrêter le partage de position.';
  end if;
  delete from public.player_positions where player_id = auth.uid();
end;
$$;

create or replace function public.get_game_player_positions(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour consulter les positions.';
  end if;
  if not public.is_game_member(p_game_id) then
    raise exception 'Vous ne faites pas partie de cette opération.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'player_id', p.player_id,
        'player_name', m.player_name,
        'team_id', t.id,
        'team_name', t.name,
        'team_color', t.color,
        'latitude', p.latitude,
        'longitude', p.longitude,
        'updated_at', p.updated_at
      ) order by p.updated_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.player_positions p
  join public.team_members m on m.user_id = p.player_id and m.team_id = p.team_id
  join public.teams t on t.id = p.team_id and t.game_id = p.game_id
  where p.game_id = p_game_id
    and p.updated_at > now() - interval '90 seconds';

  return result;
end;
$$;

revoke all on function public.create_game_with_team(text, text, text, text) from public, anon;
revoke all on function public.create_team_in_game(text, text, text, text) from public, anon;
revoke all on function public.join_team_by_code(text, text) from public, anon;
revoke all on function public.get_my_team() from public, anon;
revoke all on function public.set_my_player_name(text) from public, anon;
revoke all on function public.set_my_player_position(double precision, double precision) from public, anon;
revoke all on function public.clear_my_player_position() from public, anon;
revoke all on function public.get_game_player_positions(uuid) from public, anon;
grant execute on function public.create_game_with_team(text, text, text, text) to authenticated;
grant execute on function public.create_team_in_game(text, text, text, text) to authenticated;
grant execute on function public.join_team_by_code(text, text) to authenticated;
grant execute on function public.get_my_team() to authenticated;
grant execute on function public.set_my_player_name(text) to authenticated;
grant execute on function public.set_my_player_position(double precision, double precision) to authenticated;
grant execute on function public.clear_my_player_position() to authenticated;
grant execute on function public.get_game_player_positions(uuid) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_positions'
  ) then
    alter publication supabase_realtime drop table public.team_positions;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'player_positions'
  ) then
    alter publication supabase_realtime add table public.player_positions;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_members'
  ) then
    alter publication supabase_realtime add table public.team_members;
  end if;
end;
$$;

drop table if exists public.team_positions;
