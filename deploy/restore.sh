#!/usr/bin/env bash
# Восстановление сайта из ежедневной копии (запускать от root на сервере).
#
#   bash /var/www/torgana/deploy/restore.sh list                  — какие копии есть
#   bash /var/www/torgana/deploy/restore.sh 2026-11-07            — вернуть базу и фото на эту дату
#   bash /var/www/torgana/deploy/restore.sh 2026-11-07 --config   — то же + .env, nginx, сертификаты, службы
#
# Перед восстановлением текущие база и фото сохраняются в backups/before-restore-ВРЕМЯ/,
# так что восстановление тоже можно отменить.
# Если сервер потерян целиком — восстановите весь диск в панели Selectel (см. README, «Резервные копии»).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/torgana}"
DATA_DIR="${DATA_DIR:-/var/lib/torgana}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
CONFIG_ROOT="${CONFIG_ROOT:-/}"
APP_USER="${APP_USER:-torgana}"
NO_SYSTEMCTL="${NO_SYSTEMCTL:-}"
DB="$DATA_DIR/data/torgana.db"
UPLOADS="$DATA_DIR/uploads"
dbcopy() { node --disable-warning=ExperimentalWarning "$APP_DIR/scripts/db-copy.js" "$@"; }

if [ "${1:-}" = "list" ] || [ -z "${1:-}" ]; then
  echo "Доступные копии (дата — фото — настройки):"
  for f in $(ls "$BACKUP_DIR"/db/torgana-*.db.gz 2>/dev/null | sort -r); do
    d="$(basename "$f" .db.gz)"; d="${d#torgana-}"
    up="нет"; [ -d "$BACKUP_DIR/uploads/$d" ] && up="$(find "$BACKUP_DIR/uploads/$d" -type f | wc -l) фото"
    cf="нет"; [ -f "$BACKUP_DIR/config/config-$d.tar.gz" ] && cf="есть"
    echo "  $d — $up — настройки: $cf — $(du -h "$f" | cut -f1)"
  done
  [ -z "${1:-}" ] && echo && echo "Восстановить: bash $0 ДАТА [--config]"
  exit 0
fi

DAY="$1"
WITH_CONFIG=""; [ "${2:-}" = "--config" ] && WITH_CONFIG=1
[[ "$DAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "Дата в формате ГГГГ-ММ-ДД"; exit 2; }
SRC_DB="$BACKUP_DIR/db/torgana-$DAY.db.gz"
SRC_UP="$BACKUP_DIR/uploads/$DAY"
SRC_CFG="$BACKUP_DIR/config/config-$DAY.tar.gz"
[ -f "$SRC_DB" ] || { echo "Нет копии базы за $DAY. Список: bash $0 list"; exit 1; }
[ -z "$WITH_CONFIG" ] || [ -f "$SRC_CFG" ] || { echo "Нет копии настроек за $DAY"; exit 1; }

umask 077
STAGE="$(mktemp -d "$BACKUP_DIR/.restore-XXXX")"
trap 'rm -rf "$STAGE"' EXIT
echo "1/5 Проверяю копию за $DAY"
gzip -dc "$SRC_DB" > "$STAGE/torgana.db"
dbcopy check "$STAGE/torgana.db"
echo "    код в момент копии: $(cat "$BACKUP_DIR/db/torgana-$DAY.commit" 2>/dev/null || echo неизвестно)"

echo "2/5 Останавливаю сайт"
[ -n "$NO_SYSTEMCTL" ] || systemctl stop torgana

SAFE="$BACKUP_DIR/before-restore-$(date +%Y%m%d-%H%M%S)"
echo "3/5 Сохраняю текущее состояние в $SAFE"
mkdir -p "$SAFE"
if [ -f "$DB" ]; then dbcopy backup "$DB" "$SAFE/torgana.db" || cp -a "$DB"* "$SAFE/"; fi
[ -d "$UPLOADS" ] && mv "$UPLOADS" "$SAFE/uploads"

echo "4/5 Возвращаю базу и фото"
mkdir -p "$(dirname "$DB")"
rm -f "$DB" "$DB-wal" "$DB-shm"
mv "$STAGE/torgana.db" "$DB"
if [ -d "$SRC_UP" ]; then cp -al "$SRC_UP" "$UPLOADS"; else mkdir -p "$UPLOADS"; fi
if [ -n "$WITH_CONFIG" ]; then
  echo "    и настройки сервера"
  tar -xzf "$SRC_CFG" -C "$CONFIG_ROOT"
fi
if [ "$(id -u)" = 0 ] && id -u "$APP_USER" >/dev/null 2>&1; then
  chown -R "$APP_USER:$APP_USER" "$DATA_DIR/data" "$UPLOADS"
fi

echo "5/5 Запускаю сайт"
if [ -z "$NO_SYSTEMCTL" ]; then
  if [ -n "$WITH_CONFIG" ]; then systemctl daemon-reload; nginx -t && systemctl reload nginx; fi
  systemctl start torgana
  for _ in $(seq 1 20); do curl -fsS -m 3 http://127.0.0.1:3000/api/config >/dev/null 2>&1 && break; sleep 1; done
  curl -fsS -m 3 http://127.0.0.1:3000/api/config >/dev/null || { echo "Сайт не ответил. Прошлое состояние — в $SAFE"; exit 1; }
fi
echo "Готово: сайт восстановлен на $DAY. Прежнее состояние сохранено в $SAFE"
