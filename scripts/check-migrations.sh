#!/usr/bin/env bash
# Fail if migration history would break Supabase GitHub Integration.
# Catches: "Remote migration versions not found in local migrations directory"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$ROOT/supabase/migrations"

echo "::group::Local migration hygiene"
fail=0
versions_file="$(mktemp)"
tmp_json=""
remote_versions=""
cleanup() {
  rm -f "$versions_file" ${tmp_json:+"$tmp_json"} ${remote_versions:+"$remote_versions"}
}
trap cleanup EXIT

shopt -s nullglob
for f in "$MIG_DIR"/*.sql; do
  base="$(basename "$f")"
  if [[ ! "$base" =~ ^([0-9]{14})_(.+)\.sql$ ]]; then
    echo "::error file=supabase/migrations/$base::Migration filename must be <14-digit-version>_<name>.sql"
    fail=1
    continue
  fi
  echo "${BASH_REMATCH[1]}" >>"$versions_file"
done

if [[ ! -s "$versions_file" ]]; then
  echo "::error::No migrations found in supabase/migrations"
  exit 1
fi

dups="$(sort "$versions_file" | uniq -d || true)"
if [[ -n "$dups" ]]; then
  while IFS= read -r dup; do
    [[ -z "$dup" ]] && continue
    echo "::error::Duplicate migration version $dup — Integration cannot apply a unique history"
  done <<<"$dups"
  fail=1
fi

echo "Local migration files: $(wc -l <"$versions_file" | tr -d ' ')"
echo "::endgroup::"

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "::group::Remote migration history vs repo"
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  echo "::error::SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required to verify remote migration history (Integration failure from PR #38)."
  echo "Add repo Actions secret SUPABASE_ACCESS_TOKEN and variable SUPABASE_PROJECT_ID (open-bsp-luna: tmjczmxmmdsgjxdgpdan). Use a repo-level secret (not only the Production environment) so pull_request checks can read it."
  exit 1
fi

api_url="https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/migrations"
tmp_json="$(mktemp)"
remote_versions="$(mktemp)"

http_code="$(
  curl -sS -o "$tmp_json" -w "%{http_code}" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Accept: application/json" \
    "$api_url"
)"

if [[ "$http_code" != "200" ]]; then
  echo "::error::Failed to list remote migrations (HTTP $http_code) from $api_url"
  head -c 2000 "$tmp_json" || true
  echo
  exit 1
fi

python3 - "$tmp_json" "$remote_versions" <<'PY'
import json, sys
path, out = sys.argv[1], sys.argv[2]
data = json.load(open(path))
if isinstance(data, dict):
    rows = data.get("migrations") or data.get("data") or []
elif isinstance(data, list):
    rows = data
else:
    raise SystemExit(f"unexpected migrations payload type: {type(data)}")
versions = []
for row in rows:
    if isinstance(row, dict):
        v = row.get("version") or row.get("version_num")
        if v:
            versions.append(str(v))
    elif isinstance(row, str):
        versions.append(row)
open(out, "w").write("\n".join(versions) + ("\n" if versions else ""))
print(f"Remote applied migrations: {len(versions)}")
PY

missing=0
while IFS= read -r ver; do
  [[ -z "$ver" ]] && continue
  if ! grep -qx "$ver" "$versions_file"; then
    echo "::error::Remote migration version $ver is not in supabase/migrations/ — Integration fails with: Remote migration versions not found in local migrations directory"
    missing=1
  fi
done <"$remote_versions"

if [[ "$missing" -ne 0 ]]; then
  echo "Restore or rename the migration file(s) so versions match remote schema_migrations. Do not invent a new timestamp for an already-applied change."
  exit 1
fi

echo "All remote migration versions are present locally."
echo "::endgroup::"
