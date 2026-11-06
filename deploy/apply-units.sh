#!/usr/bin/env bash
# Устанавливает службы и таймеры Торганы из репозитория (запускать от root).
# Нужно после изменений в deploy/*.service и deploy/*.timer — автообновление само этого не делает.
set -euo pipefail
APP_DIR=/var/www/torgana
for f in torgana.service torgana-update.service torgana-update.timer torgana-backup.service torgana-backup.timer; do
  install -m 644 "$APP_DIR/deploy/$f" "/etc/systemd/system/$f"
done
chmod 755 "$APP_DIR/deploy/backup.sh" "$APP_DIR/deploy/restore.sh" 2>/dev/null || true
# Команда для ручной проверки обновлений: sudo torgana-autoupdate [--status]
printf '#!/bin/sh\nexec /bin/bash %s/deploy/update.sh "$@"\n' "$APP_DIR" > /usr/local/sbin/torgana-autoupdate
chmod 755 /usr/local/sbin/torgana-autoupdate
# Технические журналы — не дольше 6 месяцев (так написано в Политике обработки персональных данных).
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nMaxRetentionSec=6month\n' > /etc/systemd/journald.conf.d/torgana.conf
systemctl restart systemd-journald
systemctl daemon-reload
systemctl enable --now torgana torgana-update.timer torgana-backup.timer >/dev/null
echo "Службы обновлены:"
systemctl list-timers 'torgana-*' --no-pager | head -5
