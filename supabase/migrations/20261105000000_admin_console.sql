create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.game_pois (
  game_id uuid not null references public.games(id) on delete cascade,
  poi_id text not null,
  sort_order integer not null,
  poi jsonb not null check (jsonb_typeof(poi) = 'object'),
  primary key (game_id, poi_id),
  unique (game_id, sort_order)
);

alter table public.game_pois enable row level security;
revoke all on public.game_pois from anon, authenticated;
grant select (game_id, poi_id, sort_order, poi) on public.game_pois to authenticated;

create policy "Game members can read their game POIs"
  on public.game_pois for select to authenticated
  using (public.is_game_member(game_id));

create table public.player_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.team_members(user_id) on delete cascade,
  kind text not null check (kind in ('bonus', 'malus')),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create index player_items_game_player_idx on public.player_items(game_id, player_id, active);
alter table public.player_items enable row level security;
revoke all on public.player_items from anon, authenticated;

create table public.game_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create index game_messages_game_created_idx on public.game_messages(game_id, created_at desc);
alter table public.game_messages enable row level security;
revoke all on public.game_messages from anon, authenticated;
grant select (id, game_id, team_id, title, body, created_at)
  on public.game_messages to authenticated;

create policy "Recipients can read game messages"
  on public.game_messages for select to authenticated
  using (
    public.is_game_member(game_id)
    and (
      team_id is null
      or exists (
        select 1 from public.team_members m
        where m.user_id = auth.uid() and m.team_id = game_messages.team_id
      )
    )
  );

create table public.game_message_reads (
  message_id uuid not null references public.game_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.game_message_reads enable row level security;
revoke all on public.game_message_reads from anon, authenticated;

drop function if exists public.create_game_with_team(text, text, text);
drop function if exists public.create_game_with_team(text, text, text, text);

create or replace function public.admin_list_games()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'code', g.join_code,
    'created_at', g.created_at,
    'team_count', (select count(*) from public.teams t where t.game_id = g.id),
    'player_count', (
      select count(*)
      from public.teams t
      join public.team_members m on m.team_id = t.id
      where t.game_id = g.id
    )
  ) order by g.created_at desc), '[]'::jsonb)
  into result
  from public.games g;

  return result;
end;
$$;

create or replace function public.admin_create_game(p_name text, p_pois jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_game public.games%rowtype;
  clean_name text := btrim(p_name);
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 40 then
    raise exception 'Le nom de la partie doit contenir de 1 à 40 caractères.';
  end if;
  if p_pois is null or jsonb_typeof(p_pois) <> 'array' then
    raise exception 'La liste de POI est invalide.';
  end if;
  if jsonb_array_length(p_pois) > 500 then
    raise exception 'La liste de POI est invalide (maximum 500).';
  end if;

  insert into public.games (name, join_code)
  values (clean_name, public.generate_join_code())
  returning * into new_game;

  perform public.admin_replace_game_pois(new_game.id, p_pois);

  return jsonb_build_object(
    'id', new_game.id,
    'name', new_game.name,
    'code', new_game.join_code
  );
end;
$$;

create or replace function public.admin_replace_game_pois(p_game_id uuid, p_pois jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;
  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Partie introuvable.';
  end if;
  if p_pois is null or jsonb_typeof(p_pois) <> 'array' then
    raise exception 'La liste de POI est invalide.';
  end if;
  if jsonb_array_length(p_pois) > 500 then
    raise exception 'La liste de POI est invalide (maximum 500).';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_pois) as entries(poi)
    where jsonb_typeof(poi) <> 'object'
      or nullif(btrim(poi->>'id'), '') is null
      or nullif(btrim(poi->>'name'), '') is null
      or coalesce(jsonb_typeof(poi->'latitude') <> 'number', true)
      or coalesce(jsonb_typeof(poi->'longitude') <> 'number', true)
      or coalesce(jsonb_typeof(poi->'activationRadius') <> 'number', true)
      or case when jsonb_typeof(poi->'latitude') = 'number'
        then (poi->>'latitude')::numeric not between -90 and 90 else false end
      or case when jsonb_typeof(poi->'longitude') = 'number'
        then (poi->>'longitude')::numeric not between -180 and 180 else false end
      or case when jsonb_typeof(poi->'activationRadius') = 'number'
        then (poi->>'activationRadius')::numeric <= 0 else false end
  ) then
    raise exception 'Chaque POI doit avoir un identifiant, un nom et des coordonnées.';
  end if;

  delete from public.game_pois where game_id = p_game_id;
  insert into public.game_pois (game_id, poi_id, sort_order, poi)
  select p_game_id, poi->>'id', ordinal::integer, poi
  from jsonb_array_elements(p_pois) with ordinality as entries(poi, ordinal);
end;
$$;

create or replace function public.get_game_pois(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_game_member(p_game_id) and not public.is_admin() then
    raise exception 'Vous ne faites pas partie de cette opération.';
  end if;
  select coalesce(jsonb_agg(poi order by sort_order), '[]'::jsonb)
  into result from public.game_pois where game_id = p_game_id;
  return result;
end;
$$;

create or replace function public.admin_get_game_roster(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;

  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'color', t.color,
        'player_count', (select count(*) from public.team_members m where m.team_id = t.id)
      ) order by t.created_at)
      from public.teams t
      where t.game_id = p_game_id
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', m.user_id,
        'player_name', m.player_name,
        'team_id', t.id,
        'team_name', t.name,
        'team_color', t.color,
        'sharing_location', exists (
          select 1 from public.player_positions p
          where p.player_id = m.user_id and p.updated_at > now() - interval '90 seconds'
        ),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', i.id, 'kind', i.kind, 'name', i.name,
            'description', i.description, 'active', i.active,
            'created_at', i.created_at
          ) order by i.created_at desc)
          from public.player_items i
          where i.player_id = m.user_id and i.game_id = p_game_id
        ), '[]'::jsonb)
      ) order by t.name, m.player_name)
      from public.teams t
      join public.team_members m on m.team_id = t.id
      where t.game_id = p_game_id
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

create or replace function public.admin_grant_player_item(
  p_player_id uuid,
  p_kind text,
  p_name text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_team_id uuid;
  player_game_id uuid;
  new_item_id uuid;
  clean_name text := btrim(p_name);
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;
  if p_kind not in ('bonus', 'malus') then
    raise exception 'Type de bonus ou malus invalide.';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 60
    or char_length(coalesce(p_description, '')) > 500 then
    raise exception 'Nom ou description de l’objet invalide.';
  end if;

  select t.id, t.game_id into player_team_id, player_game_id
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.user_id = p_player_id;
  if player_team_id is null then
    raise exception 'Joueur introuvable.';
  end if;

  insert into public.player_items(game_id, team_id, player_id, kind, name, description, created_by)
  values (player_game_id, player_team_id, p_player_id, p_kind, clean_name, coalesce(p_description, ''), auth.uid())
  returning id into new_item_id;
  return new_item_id;
end;
$$;

create or replace function public.admin_deactivate_player_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;
  update public.player_items set active = false where id = p_item_id;
  if not found then
    raise exception 'Objet bonus/malus introuvable.';
  end if;
end;
$$;

create or replace function public.get_my_player_items()
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
    raise exception 'Connectez-vous pour consulter vos bonus et malus.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'name', name, 'description', description, 'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  into result
  from public.player_items
  where player_id = auth.uid() and active;
  return result;
end;
$$;

create or replace function public.admin_send_game_message(
  p_game_id uuid,
  p_team_id uuid,
  p_title text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_message_id uuid;
  clean_title text := btrim(p_title);
  clean_body text := btrim(p_body);
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;
  if clean_title is null or char_length(clean_title) not between 1 and 80
    or clean_body is null or char_length(clean_body) not between 1 and 2000 then
    raise exception 'Le titre doit faire 1 à 80 caractères et le message 1 à 2000 caractères.';
  end if;
  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'Partie introuvable.';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.teams where id = p_team_id and game_id = p_game_id
  ) then
    raise exception 'L’équipe choisie ne fait pas partie de cette opération.';
  end if;

  insert into public.game_messages(game_id, team_id, title, body, created_by)
  values (p_game_id, p_team_id, clean_title, clean_body, auth.uid())
  returning id into new_message_id;
  return new_message_id;
end;
$$;

create or replace function public.admin_list_game_messages(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administration.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gm.id,
    'team_id', gm.team_id,
    'team_name', t.name,
    'title', gm.title,
    'body', gm.body,
    'created_at', gm.created_at,
    'acknowledged_count', (
      select count(*) from public.game_message_reads r where r.message_id = gm.id
    )
  ) order by gm.created_at desc), '[]'::jsonb)
  into result
  from public.game_messages gm
  left join public.teams t on t.id = gm.team_id
  where gm.game_id = p_game_id;
  return result;
end;
$$;

create or replace function public.get_my_game_messages()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_team_id uuid;
  current_game_id uuid;
  result jsonb;
begin
  select t.id, t.game_id into current_team_id, current_game_id
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.user_id = auth.uid();
  if current_team_id is null then
    raise exception 'Aucune équipe liée à cette session.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gm.id,
    'title', gm.title,
    'body', gm.body,
    'created_at', gm.created_at
  ) order by gm.created_at), '[]'::jsonb)
  into result
  from public.game_messages gm
  where gm.game_id = current_game_id
    and (gm.team_id is null or gm.team_id = current_team_id)
    and not exists (
      select 1 from public.game_message_reads r
      where r.message_id = gm.id and r.user_id = auth.uid()
    );
  return result;
end;
$$;

create or replace function public.acknowledge_game_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_team_id uuid;
begin
  select team_id into current_team_id from public.team_members where user_id = auth.uid();
  if current_team_id is null then
    raise exception 'Aucune équipe liée à cette session.';
  end if;
  if not exists (
    select 1 from public.game_messages gm
    where gm.id = p_message_id
      and (gm.team_id is null or gm.team_id = current_team_id)
      and exists (
        select 1 from public.teams t
        where t.id = current_team_id and t.game_id = gm.game_id
      )
  ) then
    raise exception 'Message introuvable ou non destiné à votre équipe.';
  end if;

  insert into public.game_message_reads(message_id, user_id)
  values (p_message_id, auth.uid())
  on conflict (message_id, user_id) do nothing;
end;
$$;

revoke all on function public.admin_list_games() from public, anon;
revoke all on function public.admin_create_game(text, jsonb) from public, anon;
revoke all on function public.admin_replace_game_pois(uuid, jsonb) from public, anon;
revoke all on function public.get_game_pois(uuid) from public, anon;
revoke all on function public.admin_get_game_roster(uuid) from public, anon;
revoke all on function public.admin_grant_player_item(uuid, text, text, text) from public, anon;
revoke all on function public.admin_deactivate_player_item(uuid) from public, anon;
revoke all on function public.get_my_player_items() from public, anon;
revoke all on function public.admin_send_game_message(uuid, uuid, text, text) from public, anon;
revoke all on function public.admin_list_game_messages(uuid) from public, anon;
revoke all on function public.get_my_game_messages() from public, anon;
revoke all on function public.acknowledge_game_message(uuid) from public, anon;
grant execute on function public.admin_list_games() to authenticated;
grant execute on function public.admin_create_game(text, jsonb) to authenticated;
grant execute on function public.admin_replace_game_pois(uuid, jsonb) to authenticated;
grant execute on function public.get_game_pois(uuid) to authenticated;
grant execute on function public.admin_get_game_roster(uuid) to authenticated;
grant execute on function public.admin_grant_player_item(uuid, text, text, text) to authenticated;
grant execute on function public.admin_deactivate_player_item(uuid) to authenticated;
grant execute on function public.get_my_player_items() to authenticated;
grant execute on function public.admin_send_game_message(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_list_game_messages(uuid) to authenticated;
grant execute on function public.get_my_game_messages() to authenticated;
grant execute on function public.acknowledge_game_message(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_messages'
  ) then
    alter publication supabase_realtime add table public.game_messages;
  end if;
end;
$$;
