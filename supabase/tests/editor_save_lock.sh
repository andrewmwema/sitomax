#!/usr/bin/env bash
# Only run against the project's isolated test server, with all migrations applied.
set -euo pipefail
url="${TEST_DATABASE_URL:-}"
expected='postgresql://sitomax_test@127.0.0.1:55439/sitomax_test'
if [[ "$url" != "$expected" ]]; then
  echo "Set TEST_DATABASE_URL to the isolated local test database URL." >&2
  exit 1
fi
root="$(cd "$(dirname "$0")/../.." && pwd -P)"
psql="$root/.test-db/install/usr/lib/postgresql/17/bin/psql"
export PGPASSFILE="$root/.test-db/pgpass"
ids="$("$psql" "$url" -XAt -v ON_ERROR_STOP=1 -c "select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()")"
IFS='|' read -r user_id account_id site_id page_id <<< "$ids"
holder_pid=''
cleanup() {
  if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; wait "$holder_pid" 2>/dev/null || true; fi
  "$psql" "$url" -Xq -v ON_ERROR_STOP=1 -v account_id="$account_id" -v user_id="$user_id" <<'SQL'
delete from public.accounts where id = :'account_id';
delete from auth.users where id = :'user_id';
SQL
}
trap cleanup EXIT

"$psql" "$url" -Xq -v ON_ERROR_STOP=1 -v user_id="$user_id" -v account_id="$account_id" \
  -v site_id="$site_id" -v page_id="$page_id" <<'SQL'
begin;
insert into auth.users(id, email, raw_user_meta_data)
  values (:'user_id', :'user_id' || '@contention.test', '{}');
insert into public.accounts(id, name) values (:'account_id', 'Lock test');
insert into public.account_members values (:'account_id', :'user_id', 'owner');
insert into public.sites(id, account_id, subdomain, draft_header)
  values (:'site_id', :'account_id', 'lock-' || :'site_id', '{"version":1}');
insert into public.pages(id, site_id, slug, title, draft_data)
  values (:'page_id', :'site_id', '', 'Home', '{"root":{"props":{}},"content":[]}');
commit;
SQL

PGAPPNAME="editor-lock-$site_id" "$psql" "$url" -Xq -v ON_ERROR_STOP=1 -v site_id="$site_id" <<'SQL' &
begin;
select id from public.sites where id = :'site_id' for update;
select pg_sleep(15);
rollback;
SQL
holder_pid=$!
ready=false
for _ in {1..100}; do
  if [[ "$("$psql" "$url" -XAt -v app="editor-lock-$site_id" \
    <<< "select exists(select 1 from pg_stat_activity where application_name = :'app' and wait_event = 'PgSleep')")" == t ]]; then
    ready=true
    break
  fi
  kill -0 "$holder_pid" 2>/dev/null || { echo "Lock holder exited early" >&2; exit 1; }
  sleep 0.1
done
if [[ "$ready" != true ]]; then echo "Lock holder did not become ready" >&2; exit 1; fi

"$psql" "$url" -Xq -v ON_ERROR_STOP=1 -v user_id="$user_id" -v page_id="$page_id" <<'SQL'
select set_config('request.jwt.claim.sub', :'user_id', false);
select set_config('test.page_id', :'page_id', false);
set role authenticated;
set statement_timeout = '2s';
do $$
declare page_id uuid := current_setting('test.page_id')::uuid; version uuid; data jsonb; saved uuid;
begin
  select draft_version into version from public.pages where id = page_id;
  data := jsonb_build_object('root', jsonb_build_object('props', jsonb_build_object(
    '__expectedPageVersion', version, '__nextPageVersion', gen_random_uuid())),
    'content', jsonb_build_array(jsonb_build_object('type', 'Text', 'props', jsonb_build_object('text', 'changed'))));
  saved := public.save_page_with_header(page_id, data, '{"version":1}', '{"version":1}');
  if saved is distinct from (data#>>'{root,props,__nextPageVersion}')::uuid then
    raise exception 'Body save did not return the new version';
  end if;
end;
$$;
-- A genuine header write must fail promptly rather than report success.
set statement_timeout = '6s';
do $$
declare page_id uuid := current_setting('test.page_id')::uuid; data jsonb;
begin
  select draft_data into data from public.pages where id = page_id;
  begin
    perform public.save_page_with_header(page_id, data, '{"version":1,"logo":{"text":"New"}}', '{"version":1}');
    raise exception 'Expected lock timeout';
  exception when lock_not_available then null; end;
end;
$$;
SQL
echo "Body-only save succeeded under site lock; header write timed out."
