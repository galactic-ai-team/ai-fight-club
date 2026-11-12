-- AI Fight Club Commander live rooms.
-- Private match payloads (join-code and host-token HASHES only) are never
-- readable by anon. Anon may SELECT public state to spectate. Writes go
-- through SECURITY DEFINER RPCs that require a server-only store secret
-- (set in afc_meta, never committed). The Vercel API holds that secret.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.afc_meta (
  key text primary key,
  value text not null
);
alter table public.afc_meta enable row level security;
revoke all on table public.afc_meta from anon, authenticated, public;

create table if not exists public.afc_matches (
  id text primary key,
  payload jsonb not null,
  status text not null default 'waiting',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);
create index if not exists afc_matches_expires_at_idx on public.afc_matches (expires_at);
create index if not exists afc_matches_status_idx on public.afc_matches (status);
alter table public.afc_matches enable row level security;
revoke all on table public.afc_matches from anon, authenticated, public;

-- Public snapshot: no hashes, no join codes, no host tokens.
create table if not exists public.afc_public_state (
  id text primary key references public.afc_matches(id) on delete cascade,
  status text not null default 'waiting',
  seed integer not null default 0,
  window_mode text not null default 'off',
  p1 jsonb not null default '{}'::jsonb,
  p2 jsonb not null default '{}'::jsonb,
  score text not null default '0-0',
  tick integer not null default 0,
  host_present boolean not null default false,
  expires_at timestamptz not null,
  watch_path text not null,
  state jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists afc_public_state_updated_idx on public.afc_public_state (updated_at desc);
alter table public.afc_public_state enable row level security;
revoke all on table public.afc_public_state from public;
grant select on table public.afc_public_state to anon, authenticated;
drop policy if exists afc_public_state_select on public.afc_public_state;
create policy afc_public_state_select on public.afc_public_state
  for select to anon, authenticated
  using (expires_at > now());

-- Realtime for spectators (polling also works).
do $$
begin
  begin
    alter publication supabase_realtime add table public.afc_public_state;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
alter table public.afc_public_state replica identity full;

-- Server-only secret check. Hash lives in afc_meta; plaintext never in SQL.
create or replace function public.afc_check_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  select value into h from public.afc_meta where key = 'store_secret_hash';
  if h is null or p_secret is null
     or encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'::text), 'hex') is distinct from h then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.afc_check_secret(text) from public, anon, authenticated;

create or replace function public.afc_sync_public(p_id text, p_payload jsonb, p_expires timestamptz)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  st jsonb := p_payload->'publicState';
  host_ok boolean;
  host_seen bigint;
begin
  host_seen := coalesce((p_payload->>'hostSeenAtMs')::bigint, 0);
  host_ok := coalesce((p_payload->>'hostPresent')::boolean, false)
             and (extract(epoch from now()) * 1000 - host_seen) <= 15000;
  insert into public.afc_public_state (
    id, status, seed, window_mode, p1, p2, score, tick, host_present,
    expires_at, watch_path, state, updated_at
  ) values (
    p_id,
    coalesce(p_payload->>'status', 'waiting'),
    coalesce((p_payload->>'seed')::integer, 0),
    coalesce(p_payload->>'windowMode', 'off'),
    jsonb_build_object(
      'controller', p_payload->>'p1Controller',
      'character', p_payload->>'p1Character',
      'bot', p_payload->>'p1Bot'
    ),
    jsonb_build_object(
      'controller', p_payload->>'p2Controller',
      'character', p_payload->>'p2Character',
      'bot', p_payload->>'p2Bot'
    ),
    case
      when st is not null then coalesce((st->>'p1Wins')::text, '0') || '-' || coalesce((st->>'p2Wins')::text, '0')
      else '0-0'
    end,
    coalesce((st->>'tick')::integer, 0),
    host_ok,
    p_expires,
    '/watch.html?m=' || p_id,
    st,
    now()
  )
  on conflict (id) do update set
    status = excluded.status,
    seed = excluded.seed,
    window_mode = excluded.window_mode,
    p1 = excluded.p1,
    p2 = excluded.p2,
    score = excluded.score,
    tick = excluded.tick,
    host_present = excluded.host_present,
    expires_at = excluded.expires_at,
    watch_path = excluded.watch_path,
    state = excluded.state,
    updated_at = now();
end;
$$;
revoke all on function public.afc_sync_public(text, jsonb, timestamptz) from public, anon, authenticated;

create or replace function public.afc_get_private(p_secret text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.afc_matches%rowtype;
begin
  perform public.afc_check_secret(p_secret);
  select * into r from public.afc_matches where id = p_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object('record', r.payload, 'version', r.version, 'expires_at', r.expires_at);
end;
$$;
grant execute on function public.afc_get_private(text, text) to anon, authenticated;

create or replace function public.afc_insert_private(p_secret text, p_id text, p_payload jsonb, p_expires timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.afc_check_secret(p_secret);
  insert into public.afc_matches (id, payload, status, expires_at, updated_at, version)
  values (
    p_id,
    p_payload,
    coalesce(p_payload->>'status', 'waiting'),
    p_expires,
    now(),
    1
  );
  perform public.afc_sync_public(p_id, p_payload, p_expires);
  return jsonb_build_object('ok', true, 'version', 1);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'conflict');
end;
$$;
grant execute on function public.afc_insert_private(text, text, jsonb, timestamptz) to anon, authenticated;

create or replace function public.afc_put_private(
  p_secret text,
  p_id text,
  p_payload jsonb,
  p_expires timestamptz,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_ver bigint;
begin
  perform public.afc_check_secret(p_secret);
  update public.afc_matches
     set payload = p_payload,
         status = coalesce(p_payload->>'status', status),
         expires_at = p_expires,
         updated_at = now(),
         version = version + 1
   where id = p_id and version = p_expected_version
   returning version into new_ver;
  if new_ver is null then
    return jsonb_build_object('ok', false, 'error', 'conflict');
  end if;
  perform public.afc_sync_public(p_id, p_payload, p_expires);
  return jsonb_build_object('ok', true, 'version', new_ver);
end;
$$;
grant execute on function public.afc_put_private(text, text, jsonb, timestamptz, bigint) to anon, authenticated;
