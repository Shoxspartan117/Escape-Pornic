create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

revoke all on public.games, public.teams, public.team_members from anon, authenticated;
grant select (id, name, created_at) on public.games to authenticated;
grant select (id, game_id, name, color, created_at) on public.teams to authenticated;
grant select (user_id, team_id, created_at) on public.team_members to authenticated;

create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.game_id = p_game_id and m.user_id = auth.uid()
  );
$$;

create policy "Game members can read their game"
  on public.games for select to authenticated
  using (public.is_game_member(id));

create policy "Game members can see teams in their game"
  on public.teams for select to authenticated
  using (public.is_game_member(game_id));

create policy "Users can read their own membership"
  on public.team_members for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.generate_join_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  random_bytes bytea := pg_catalog.decode(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
    'hex'
  );
  i integer;
begin
  for i in 0..7 loop
    result := result || pg_catalog.substr(
      alphabet,
      1 + (pg_catalog.get_byte(random_bytes, i) % pg_catalog.length(alphabet)),
      1
    );
  end loop;
  return result;
end;
$$;

create or replace function public.create_game_with_team(
  p_game_name text,
  p_team_name text,
  p_color text
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

  insert into public.games (name, join_code)
  values (btrim(p_game_name), public.generate_join_code())
  returning * into new_game;

  insert into public.teams (game_id, name, color, join_code)
  values (new_game.id, btrim(p_team_name), p_color, public.generate_join_code())
  returning * into new_team;

  insert into public.team_members (user_id, team_id)
  values (current_user_id, new_team.id);

  return jsonb_build_object(
    'game_id', new_game.id,
    'game_name', new_game.name,
    'game_code', new_game.join_code,
    'team_id', new_team.id,
    'team_name', new_team.name,
    'team_color', new_team.color,
    'team_code', new_team.join_code
  );
end;
$$;

create or replace function public.create_team_in_game(
  p_game_code text,
  p_team_name text,
  p_color text
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

  select * into target_game from public.games where join_code = upper(p_game_code);
  if not found then
    raise exception 'Aucune partie ne correspond à ce code.';
  end if;

  insert into public.teams (game_id, name, color, join_code)
  values (target_game.id, btrim(p_team_name), p_color, public.generate_join_code())
  returning * into new_team;

  insert into public.team_members (user_id, team_id)
  values (current_user_id, new_team.id);

  return jsonb_build_object(
    'game_id', target_game.id,
    'game_name', target_game.name,
    'game_code', target_game.join_code,
    'team_id', new_team.id,
    'team_name', new_team.name,
    'team_color', new_team.color,
    'team_code', new_team.join_code
  );
end;
$$;

create or replace function public.join_team_by_code(p_team_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_team public.teams%rowtype;
  target_game public.games%rowtype;
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

  select * into target_team from public.teams where join_code = upper(p_team_code);
  if not found then
    raise exception 'Aucune équipe ne correspond à ce code.';
  end if;
  select * into target_game from public.games where id = target_team.game_id;

  insert into public.team_members (user_id, team_id)
  values (current_user_id, target_team.id);

  return jsonb_build_object(
    'game_id', target_game.id,
    'game_name', target_game.name,
    'game_code', target_game.join_code,
    'team_id', target_team.id,
    'team_name', target_team.name,
    'team_color', target_team.color,
    'team_code', target_team.join_code
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
    'team_code', t.join_code
  )
  into result
  from public.team_members m
  join public.teams t on t.id = m.team_id
  join public.games g on g.id = t.game_id
  where m.user_id = current_user_id;

  return result;
end;
$$;

revoke all on function public.generate_join_code() from public, anon, authenticated;
revoke all on function public.is_game_member(uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;
revoke all on function public.create_game_with_team(text, text, text) from public, anon;
revoke all on function public.create_team_in_game(text, text, text) from public, anon;
revoke all on function public.join_team_by_code(text) from public, anon;
revoke all on function public.get_my_team() from public, anon;
grant execute on function public.create_game_with_team(text, text, text) to authenticated;
grant execute on function public.create_team_in_game(text, text, text) to authenticated;
grant execute on function public.join_team_by_code(text) to authenticated;
grant execute on function public.get_my_team() to authenticated;
