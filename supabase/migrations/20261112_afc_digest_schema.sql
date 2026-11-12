create extension if not exists pgcrypto with schema extensions;

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

-- Also set search_path on the other definers so they can call this reliably.
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

-- Keep grants (replace may drop them on some versions)
grant execute on function public.afc_get_private(text, text) to anon, authenticated;
grant execute on function public.afc_insert_private(text, text, jsonb, timestamptz) to anon, authenticated;
grant execute on function public.afc_put_private(text, text, jsonb, timestamptz, bigint) to anon, authenticated;
