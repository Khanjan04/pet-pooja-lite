-- Supabase exposes the public schema through its Data API (PostgREST) to the roles anon and
-- authenticated, and by default grants them every new table. This app never uses that API:
-- all access goes through our server. So:
--   1. RLS on every table that doesn't have it yet (auth tables, migrations log), with no
--      policies: invisible to the Data API even if a grant slips through.
--   2. Remove anon/authenticated grants on everything in public, now and for future tables.
-- Safe on plain Postgres too: the role steps are skipped when the roles don't exist.

do $$
declare t text;
begin
  foreach t in array array['user', 'session', 'account', 'verification', 'rateLimit', 'schema_migrations'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
