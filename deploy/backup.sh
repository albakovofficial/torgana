#!/usr/bin/env bash
# Ежедневная резервная копия всего, что нужно сайту (запускается от root в 04:00):
#   db/torgana-ДАТА.db.gz        — база (согласованная копия, сайт не останавливается)
#   db/torgana-ДАТА.commit       — версия кода, с которой была база
#   uploads/ДАТА/                — снимок всех фото (жёсткие ссылки: места почти не занимает)
#   config/config-ДАТА.tar.gz    — .env, nginx, HTTPS-сертификаты, службы, ключ GitHub
# Хранится KEEP_DAYS дней (по умолчанию 14). Весь диск сервера дополнительно копирует Selectel в 05:00.
# Восстановление: deploy/restore.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/torgana}"
DATA_DIR="${DATA_DIR:-/var/lib/torgana}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DAY="${DAY:-$(date +%F)}"
CONFIG_PATHS="${CONFIG_PATHS-var/www/torgana/.env etc/nginx/sites-available/torgana etc/letsencrypt etc/systemd/system/torgana.service etc/systemd/system/torgana-update.service etc/systemd/system/torgana-update.timer etc/systemd/system/torgana-backup.service etc/systemd/system/torgana-backup.timer etc/sudoers.d/torgana home/torgana/.ssh}"
CONFIG_ROOT="${CONFIG_ROOT:-/}"

DB="$DATA_DIR/data/torgana.db"
UPLOADS="$DATA_DIR/uploads"
umask 077
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/uploads" "$BACKUP_DIR/config"

echo "Резервная копия за $DAY"

# 1. База
tmp="$BACKUP_DIR/db/.torgana-$DAY.db"
node --disable-warning=ExperimentalWarning "$APP_DIR/scripts/db-copy.js" backup "$DB" "$tmp"
gzip -f "$tmp"
mv -f "$tmp.gz" "$BACKUP_DIR/db/torgana-$DAY.db.gz"
git -C "$APP_DIR" rev-parse HEAD > "$BACKUP_DIR/db/torgana-$DAY.commit" 2>/dev/null || echo unknown > "$BACKUP_DIR/db/torgana-$DAY.commit"

# 2. Фото — снимок из жёстких ссылок: удалённое на сайте фото остаётся в снимке.
rm -rf "$BACKUP_DIR/uploads/$DAY"
if [ -d "$UPLOADS" ]; then cp -al "$UPLOADS" "$BACKUP_DIR/uploads/$DAY"; else mkdir -p "$BACKUP_DIR/uploads/$DAY"; fi
echo "фото: $(find "$BACKUP_DIR/uploads/$DAY" -type f | wc -l) файлов"

# 3. Настройки сервера
existing=()
for p in $CONFIG_PATHS; do [ -e "$CONFIG_ROOT/$p" ] && existing+=("$p"); done
if [ ${#existing[@]} -gt 0 ]; then
  tar -czf "$BACKUP_DIR/config/config-$DAY.tar.gz" -C "$CONFIG_ROOT" "${existing[@]}"
  echo "настройки: ${#existing[@]} путей"
fi

# 4. Старые копии удаляем по дате в имени
cutoff="$(date -d "$DAY -$KEEP_DAYS days" +%F)"
for f in "$BACKUP_DIR"/db/torgana-*.db.gz "$BACKUP_DIR"/db/torgana-*.commit "$BACKUP_DIR"/config/config-*.tar.gz "$BACKUP_DIR"/torgana-*.db; do
  [ -e "$f" ] || continue
  d="$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)"
  [ -n "$d" ] && [[ "$d" < "$cutoff" ]] && rm -f "$f"
done
for d in "$BACKUP_DIR"/uploads/*/; do
  [ -d "$d" ] || continue
  n="$(basename "$d")"
  [[ "$n" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] && [[ "$n" < "$cutoff" ]] && rm -rf "$d"
done

date -Is > "$BACKUP_DIR/last-ok"
echo "Готово. Копий базы: $(ls "$BACKUP_DIR"/db/torgana-*.db.gz 2>/dev/null | wc -l), занято: $(du -sh "$BACKUP_DIR" | cut -f1)"
