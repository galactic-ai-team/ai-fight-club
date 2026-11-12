-- Commander live rooms. Apply to a free Supabase project if you want a durable
-- store on the Vercel preview. The API talks to this table with the service
-- role (server-only) or a tightly-scoped RPC; anon has no direct access.
-- Join codes and host tokens are NEVER stored in plaintext — only SHA-256 hashes
-- inside the jsonb payload.

create table if not exists public.afc_matches (
  id text primary key,
  payload jsonb not null,
  status text not null default 'waiting',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists afc_matches_expires_at_idx on public.afc_matches (expires_at);
create index if not exists afc_matches_status_idx on public.afc_matches (status);

alter table public.afc_matches enable row level security;

-- No policies for anon / authenticated: the browser never talks to this table
-- directly. All reads and writes go through /api, which uses a server key.

revoke all on table public.afc_matches from anon, authenticated, public;
grant all on table public.afc_matches to service_role;
