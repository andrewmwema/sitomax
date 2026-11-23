#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd -P)"
state="$root/.test-db"
bin="$state/install/usr/lib/postgresql/17/bin"
data="$state/data"
database_url="${TEST_DATABASE_URL:-postgresql://sitomax_test@127.0.0.1:55439/sitomax_test}"
expected_url="postgresql://sitomax_test@127.0.0.1:55439/sitomax_test"
export PGPASSFILE="$state/pgpass"

if [[ "$database_url" != "$expected_url" ]]; then
  echo "TEST_DATABASE_URL must be exactly $expected_url" >&2
  exit 1
fi

install_postgres() {
  if [[ -x "$bin/postgres" && -x "$bin/psql" && -f "$state/install/usr/lib/postgresql/17/lib/pg_cron.so" ]]; then return; fi
  if ! command -v apt-get >/dev/null || ! command -v dpkg-deb >/dev/null; then
    echo "Local PostgreSQL setup requires Debian apt-get and dpkg-deb." >&2
    exit 1
  fi
  mkdir -p "$state"
  chmod 700 "$state"
  mkdir -p "$state/packages" "$state/install"
  (
    cd "$state/packages"
    apt-get download postgresql-17 postgresql-client-17 postgresql-17-cron
    for package in postgresql-17_*.deb postgresql-client-17_*.deb postgresql-17-cron_*.deb; do
      dpkg-deb -x "$package" "$state/install"
    done
  )
}

start() {
  install_postgres
  chmod 700 "$state"
  if [[ ! -f "$data/PG_VERSION" ]]; then
    umask 077
    openssl rand -hex 32 > "$state/password"
    printf '127.0.0.1:55439:*:sitomax_test:%s\n' "$(cat "$state/password")" > "$PGPASSFILE"
    chmod 600 "$state/password" "$PGPASSFILE"
    "$bin/initdb" -D "$data" --auth-local=trust --auth-host=scram-sha-256 \
      --username=sitomax_test --pwfile="$state/password" --no-instructions
  fi
  if "$bin/pg_ctl" -D "$data" status >/dev/null 2>&1; then return; fi
  "$bin/pg_ctl" -D "$data" -l "$state/postgres.log" -w start -o \
    "-h 127.0.0.1 -p 55439 -k $state -c shared_buffers=32MB -c max_connections=20 -c shared_preload_libraries=pg_cron -c cron.database_name=sitomax_test -c cron.use_background_workers=on"
}

case "${1:-}" in
  start)
    start
    echo "Local test server started. Run scripts/test-db.sh reset to apply migrations."
    ;;
  stop)
    if [[ -x "$bin/pg_ctl" && -f "$data/PG_VERSION" ]] && "$bin/pg_ctl" -D "$data" status >/dev/null 2>&1; then
      "$bin/pg_ctl" -D "$data" -w stop -m fast
    fi
    ;;
  reset)
    start
    "$bin/dropdb" --no-password --if-exists --force --host="$state" --port=55439 --username=sitomax_test sitomax_test
    "$bin/createdb" --no-password --host="$state" --port=55439 --username=sitomax_test sitomax_test
    "$bin/psql" --host="$state" --port=55439 --username=sitomax_test --dbname=sitomax_test -w -X -v ON_ERROR_STOP=1 -f "$root/supabase/tests/local_shims.sql"
    for migration in "$root"/supabase/migrations/*.sql; do
      echo "Applying $(basename "$migration")"
      "$bin/psql" --host="$state" --port=55439 --username=sitomax_test --dbname=sitomax_test -w -X -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
    done
    echo "All migrations applied to the local test database."
    ;;
  *)
    echo "Usage: bash scripts/test-db.sh start|stop|reset" >&2
    exit 2
    ;;
esac
