#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/import-quick-commands.sh <commands.json> [--db <niceterm.redb>] [--replace] [--dry-run] [--no-backup]

Options:
  --db, --database-path, -d  Path to niceterm.redb. Defaults to ~/.niceterm/niceterm.redb.
  --replace                 Replace existing quick commands instead of merging by id.
  --dry-run                 Validate and print the planned result without writing.
  --no-backup               Do not create a .bak-* copy before writing.
  -h, --help                Show this help.

Close NiceTerm before writing the database.
USAGE
}

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

case "${1:-}" in
  -h|--help)
    usage
    exit 0
    ;;
esac

input_json="$1"
shift

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
manifest_path="$repo_root/src-tauri/Cargo.toml"

cargo_args=(
  run
  --manifest-path "$manifest_path"
  --example import_quick_commands
  --
  "$input_json"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db|--database-path|-d)
      shift
      if [[ $# -eq 0 ]]; then
        echo "error: --db requires a path" >&2
        exit 2
      fi
      cargo_args+=(--db "$1")
      shift
      ;;
    --replace)
      cargo_args+=(--replace)
      shift
      ;;
    --dry-run)
      cargo_args+=(--dry-run)
      shift
      ;;
    --no-backup)
      cargo_args+=(--no-backup)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cargo_bin="${CARGO:-}"
if [[ -z "$cargo_bin" ]]; then
  if command -v cargo >/dev/null 2>&1; then
    cargo_bin="cargo"
  fi
fi

if [[ -z "$cargo_bin" ]] || ! command -v "$cargo_bin" >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust/Cargo or set CARGO=/path/to/cargo." >&2
  exit 127
fi

exec "$cargo_bin" "${cargo_args[@]}"
