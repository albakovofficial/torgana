#!/usr/bin/env bash
# Устанавливает службы и таймеры Торганы из репозитория (запускать от root).
# Нужно после изменений в deploy/*.service и deploy/*.timer — автообновление само этого не делает.
set -euo pipefail
APP_DIR=/var/www/torgana
for f in torgana.service torgana-update.service torgana-update.timer torgana-backup.service torgana-backup.timer; do
  install -m 644 "$APP_DIR/deploy/$f" "/etc/systemd/system/$f"
done
chmod 755 "$APP_DIR/deploy/backup.sh" "$APP_DIR/deploy/restore.sh" 2>/dev/null || true
systemctl daemon-reload
systemctl enable --now torgana-update.timer torgana-backup.timer >/dev/null
echo "Службы обновлены:"
systemctl list-timers 'torgana-*' --no-pager | head -5
