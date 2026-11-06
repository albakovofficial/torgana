#!/usr/bin/env bash
# Установка Торганы на чистый сервер Ubuntu 24.04.
# Запуск (с компьютера, где есть SSH-ключ):
#   type install.sh | ssh root@IP "bash -s -- torgana.ru admin@email"        (Windows PowerShell)
#   ssh root@IP "bash -s -- torgana.ru admin@email" < install.sh             (macOS / Linux)
set -euo pipefail

DOMAIN="${1:-torgana.ru}"
ADMIN="${2:-}"
REPO="git@github.com:albakovofficial/torgana.git"
APP_DIR=/var/www/torgana
DATA_DIR=/var/lib/torgana
APP_USER=torgana

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }
export DEBIAN_FRONTEND=noninteractive

log "Обновляю систему и ставлю пакеты"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git nginx certbot python3-certbot-nginx ufw sqlite3 >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node.js $(node -v)"

log "Создаю пользователя и папки"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR/data" "$DATA_DIR/uploads" "$DATA_DIR/backups" /home/$APP_USER/.ssh
chown -R "$APP_USER:$APP_USER" "$DATA_DIR" /home/$APP_USER

log "Ключ доступа к GitHub (только чтение)"
KEY=/home/$APP_USER/.ssh/id_ed25519
if [ ! -f "$KEY" ] && [ -f /root/deploy_key ]; then
  install -o "$APP_USER" -g "$APP_USER" -m 600 /root/deploy_key "$KEY"
  install -o "$APP_USER" -g "$APP_USER" -m 644 /root/deploy_key.pub "$KEY.pub"
fi
if [ ! -f "$KEY" ]; then
  sudo -u "$APP_USER" ssh-keygen -q -t ed25519 -N "" -C "torgana-server-deploy" -f "$KEY"
fi
sudo -u "$APP_USER" bash -c "ssh-keyscan -t ed25519 github.com >> /home/$APP_USER/.ssh/known_hosts 2>/dev/null; sort -u -o /home/$APP_USER/.ssh/known_hosts /home/$APP_USER/.ssh/known_hosts"
echo
echo "------------------------------------------------------------------"
echo "Добавьте этот ключ в GitHub: репозиторий torgana → Settings → Deploy keys → Add deploy key"
echo "(галочку «Allow write access» НЕ ставить)"
echo
cat "$KEY.pub"
echo "------------------------------------------------------------------"
echo "Жду, пока ключ добавят (до 15 минут)…"
for i in $(seq 1 180); do
  if sudo -u "$APP_USER" git ls-remote "$REPO" HEAD >/dev/null 2>&1; then echo "Доступ к GitHub есть."; break; fi
  [ "$i" -eq 180 ] && { echo "Ключ так и не добавили. Запустите скрипт ещё раз после добавления."; exit 1; }
  sleep 5
done

log "Скачиваю сайт"
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR" && chown "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone -q "$REPO" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" pull -q --ff-only
fi

log "Настройки (.env)"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
PORT=3000
HOST=127.0.0.1
PUBLIC_URL=https://$DOMAIN
ADMIN_EMAIL=$ADMIN
SUPPORT_EMAIL=
TRUST_PROXY=1
DATA_DIR=$DATA_DIR/data
UPLOAD_DIR=$DATA_DIR/uploads
ANTHROPIC_API_KEY=
AI_MODEL=claude-sonnet-5-5
EOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

log "Служба сайта и автообновление"
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart torgana, /usr/bin/systemctl is-active torgana" > /etc/sudoers.d/torgana
chmod 440 /etc/sudoers.d/torgana
bash "$APP_DIR/deploy/apply-units.sh"

log "nginx"
sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/torgana
ln -sf /etc/nginx/sites-available/torgana /etc/nginx/sites-enabled/torgana
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

log "Файрвол"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

log "HTTPS-сертификат"
if certbot --nginx -n --agree-tos --register-unsafely-without-email --redirect -d "$DOMAIN" -d "www.$DOMAIN"; then
  echo "HTTPS включён."
else
  echo "Сертификат пока не выдан: домен ещё не указывает на этот сервер."
  echo "Когда DNS обновится, выполните на сервере: certbot --nginx --redirect -d $DOMAIN -d www.$DOMAIN"
fi

sleep 2
if curl -fsS http://127.0.0.1:3000/api/config >/dev/null; then
  log "Готово! Торгана работает. Автообновление из ветки release — каждые 30 секунд (sudo torgana-autoupdate --status)."
else
  echo "Сайт не ответил. Логи: journalctl -u torgana -n 50"; exit 1
fi
