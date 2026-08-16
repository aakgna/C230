#!/usr/bin/env bash
# Applies hand-written SQL migrations (triggers, RLS, etc.) that live alongside
# the drizzle-kit generated ones but aren't expressible in the Drizzle schema
# DSL, and so aren't applied by `drizzle-kit push`. Written to be re-run safely
# (each file uses CREATE OR REPLACE / DROP IF EXISTS guards).
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set. Run via: npm run db:migrate" >&2
  exit 1
fi

for f in lib/db/migrations/*_*.sql; do
  base=$(basename "$f")
  # 0000 is the full initial schema dump from drizzle-kit generate; it's kept
  # applied via `drizzle-kit push`, not this script.
  if [[ "$base" == 0000_* ]]; then
    continue
  fi
  echo "Applying $base"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
