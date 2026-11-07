#!/usr/bin/env sh
set -eu

backup_dir="${QCFLOW_BACKUP_DIR:-/root/backups/qcflow-postgres}"
container="${QCFLOW_PG_CONTAINER:-qcflow-pg}"
stamp="$(date +%Y%m%d_%H%M%S)"
dump="$backup_dir/qcflow-$stamp.dump"
tmp="$dump.tmp"
toc="$backup_dir/qcflow-$stamp.toc.txt"

umask 077
mkdir -p "$backup_dir"

docker exec "$container" sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$tmp"

if [ ! -s "$tmp" ]; then
  rm -f "$tmp"
  echo "备份失败：pg_dump 输出为空" >&2
  exit 1
fi

docker exec -i "$container" pg_restore --list < "$tmp" > "$toc"
if [ ! -s "$toc" ]; then
  rm -f "$tmp" "$toc"
  echo "备份失败：归档无法通过 pg_restore 读取" >&2
  exit 1
fi

mv "$tmp" "$dump"
sha256sum "$dump" "$toc" > "$backup_dir/qcflow-$stamp.sha256"
echo "备份完成：$dump"
