#!/usr/bin/env bash
# Sync Cloud Agent secrets into server/.env (does not commit .env)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"
EXAMPLE="$ROOT/server/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE" "$ENV_FILE"
  sed -i 's/your_mysql_password/moviemate_root/' "$ENV_FILE" 2>/dev/null || true
  sed -i 's/DB_HOST=localhost/DB_HOST=127.0.0.1/' "$ENV_FILE" 2>/dev/null || true
fi

upsert_env() {
  local key="$1"
  local val="${!key:-}"
  [[ -z "$val" ]] && return 0
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

upsert_env TMDB_ACCESS_TOKEN
upsert_env DASHSCOPE_API_KEY
