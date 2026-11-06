#!/usr/bin/env bash
# Автообновление: забирает новые коммиты из GitHub (ветка main) и перезапускает сайт.
# Если после обновления сайт не отвечает — автоматически откатывается на прошлую версию.
set -uo pipefail
cd /var/www/torgana || exit 1

exec 9>/tmp/torgana-update.lock
flock -n 9 || exit 0

git fetch -q origin main || exit 0
OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse origin/main)
[ "$OLD" = "$NEW" ] && exit 0

echo "Обновление $OLD -> $NEW"
git reset -q --hard "$NEW"

healthy() {
  for _ in $(seq 1 15); do
    curl -fsS -m 3 http://127.0.0.1:3000/api/config >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

if node --check server.js && node --check public/assets/app.js; then
  sudo /usr/bin/systemctl restart torgana
  if healthy; then echo "Обновлено до $NEW"; exit 0; fi
fi

echo "Новая версия не запустилась — откат на $OLD"
git reset -q --hard "$OLD"
sudo /usr/bin/systemctl restart torgana
exit 1
