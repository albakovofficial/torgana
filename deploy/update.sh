#!/usr/bin/env bash
# Автообновление Торганы из GitHub, как в ALBAKOV: на сайт попадает только то, что слито в ветку release.
#   main    — рабочая ветка: коммиты «1.1.0: что сделано», сайт от неё не меняется;
#   release — выпуск: pull request «main → release», владелец нажимает Merge.
# Служба torgana-update.timer проверяет release каждые 30 секунд. Вручную на сервере:
#   sudo torgana-autoupdate            — проверить и установить новую версию сейчас
#   sudo torgana-autoupdate --status   — какая версия работает, журнал последних обновлений
#
# Что происходит при новой версии:
#   1) проверка во временной папке: синтаксис и сценарии API на временной базе (работающий сайт не трогается);
#   2) копия базы (последние 5 — в data/update/db);  3) установка кода и перезапуск;  4) проверка, что сайт отвечает;
#   5) если что-то не так — возврат прежней версии, а неудачная больше не ставится, пока в release не появится следующая.
# Ставятся только версии новее работающей (продолжение её истории): старые и «боковые» версии в release пропускаются.
# Ветку можно сменить строкой UPDATE_BRANCH=… в .env.
# Для теста (tests/update.test.js): APP_DIR, NO_SYSTEMCTL=1, RESTART_CMD, HEALTH_URL, HEALTH_TRIES.
set -uo pipefail
APP_DIR="${APP_DIR:-/var/www/torgana}"
APP_USER=torgana
RESTART="${RESTART_CMD:-sudo /usr/bin/systemctl restart torgana}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/config}"
HEALTH_TRIES="${HEALTH_TRIES:-15}"
cd "$APP_DIR" || exit 1

# sudo torgana-autoupdate запускает от root — работаем от пользователя сайта: папка с кодом принадлежит ему.
if [ "$(id -u)" -eq 0 ] && [ -z "${NO_SYSTEMCTL:-}" ]; then exec runuser -u "$APP_USER" -- /bin/bash "$APP_DIR/deploy/update.sh" "$@"; fi

envval() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n1 | tr -d "\"'\r"; }
BRANCH="$(envval UPDATE_BRANCH)"; BRANCH="${BRANCH:-release}"
DATA="$(envval DATA_DIR)"; DATA="${DATA:-data}"; case "$DATA" in /*) ;; *) DATA="$APP_DIR/$DATA" ;; esac
STATE="$DATA/update"                # failed — пропущенная версия, update.log — журнал, db/ — копии базы
LOG="$STATE/update.log"
STATUS_FILE="$DATA/update-status.json"  # для панели «Модерация → Версия сайта»
mkdir -p "$STATE/db"

log() {
  echo "$*"
  printf '%s  %s\n' "$(date '+%F %T')" "$*" >> "$LOG"
  tail -n 300 "$LOG" > "$LOG.tmp" 2>/dev/null && mv -f "$LOG.tmp" "$LOG"
}

# Номер версии из package.json нужного коммита: «V1.0.1 (abc1234)»; без номера — только коммит.
label() {
  local v; v="$(git show "$1:package.json" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})' 2>/dev/null)"
  if [ -n "$v" ]; then echo "V$v (${1:0:7})"; else echo "${1:0:7}"; fi
}

# Состояние для панели: ok | failed | checked | error [сообщение]
write_status() {
  ST="$1" MSG="${2:-}" BRANCH="$BRANCH" F="$STATUS_FILE" FAILED="$(cat "$STATE/failed" 2>/dev/null)" node -e '
    const fs = require("fs"), cp = require("child_process"), e = process.env;
    let o = {}; try { o = JSON.parse(fs.readFileSync(e.F, "utf8")); } catch {}
    let version = ""; try { version = JSON.parse(fs.readFileSync("package.json", "utf8")).version || ""; } catch {}
    let git = []; try { git = cp.execFileSync("git", ["show", "-s", "--format=%h%n%cI%n%s", "HEAD"], { encoding: "utf8" }).split("\n"); } catch {}
    const now = new Date().toISOString();
    Object.assign(o, { enabled: true, branch: e.BRANCH, version, commit: git[0] || "", date: git[1] || "", subject: (git[2] || "").slice(0, 200), checkedAt: now });
    if (e.ST === "ok") Object.assign(o, { updatedAt: now, lastError: "", failedCommit: "" });
    if (e.ST === "failed") Object.assign(o, { lastError: e.MSG.slice(0, 300), failedCommit: e.FAILED.slice(0, 7), failedAt: now });
    o.checkError = e.ST === "error" ? e.MSG.slice(0, 300) : "";
    fs.writeFileSync(e.F + ".tmp", JSON.stringify(o, null, 2)); fs.renameSync(e.F + ".tmp", e.F);
  ' 2>/dev/null || true
}

if [ "${1:-}" = "--status" ]; then
  echo "Ветка выпуска: $BRANCH"
  echo "Работает версия: $(label "$(git rev-parse HEAD)") — $(git show -s --format='%s (%cd)' --date=format:'%d.%m.%Y %H:%M' HEAD)"
  [ -s "$STATE/failed" ] && echo "Не встала и пропущена: $(cut -c1-7 "$STATE/failed")"
  systemctl list-timers torgana-update.timer --no-pager 2>/dev/null | sed -n 1,2p
  echo; echo "Журнал ($LOG):"; tail -n 15 "$LOG" 2>/dev/null || echo "  пусто"
  exit 0
fi

# Одна проверка за раз
exec 9>"$STATE/lock"
flock -n 9 || exit 0

# Без таймаута оборванное соединение с GitHub подвешивает автообновление навсегда.
export GIT_SSH_COMMAND="ssh -o ConnectTimeout=15 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 -o BatchMode=yes"
export GIT_TERMINAL_PROMPT=0
if ! timeout 90 git fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>"$STATE/git.err"; then
  if grep -qi "couldn't find remote ref" "$STATE/git.err"; then MSG="В GitHub нет ветки $BRANCH — создайте её из main"; else MSG="Не удалось связаться с GitHub"; fi
  # Сбой пишем в журнал один раз, а не каждые 30 секунд, пока он длится
  [ -f "$STATE/fetch-failed" ] || log "$MSG: $(tail -n1 "$STATE/git.err")"
  touch "$STATE/fetch-failed"; write_status error "$MSG"
  exit 0
fi
[ -f "$STATE/fetch-failed" ] && { rm -f "$STATE/fetch-failed"; log "Связь с GitHub восстановлена"; }

OLD="$(git rev-parse HEAD)"
NEW="$(git rev-parse "refs/remotes/origin/$BRANCH")"
FAILED="$(cat "$STATE/failed" 2>/dev/null || true)"
if [ "$OLD" = "$NEW" ] || [ "$NEW" = "$FAILED" ]; then write_status checked; exit 0; fi
# Ставим только версии новее работающей: release должен продолжать её историю.
# Старую (уже пройденную) версию пропускаем молча — например, сразу после перехода с main на release.
if git merge-base --is-ancestor "$NEW" "$OLD"; then write_status checked; exit 0; fi
if ! git merge-base --is-ancestor "$OLD" "$NEW"; then
  MSG="В $BRANCH версия $(label "$NEW"), которая не продолжает работающую $(label "$OLD") — не ставлю. Слейте main → $BRANCH"
  [ "$(cat "$STATE/diverged" 2>/dev/null)" = "$NEW" ] || { log "$MSG"; echo "$NEW" > "$STATE/diverged"; }
  write_status error "$MSG"
  exit 0
fi
rm -f "$STATE/diverged"

SHORT="${NEW:0:7}"
NEWV="$(label "$NEW")"
log "Новая версия $NEWV: $(git show -s --format=%s "$NEW")"

# 1. Проверка новой версии во временной папке — работающий сайт и его файлы пока не меняются.
check_new() {
  local dir; dir="$(mktemp -d /tmp/torgana-check.XXXXXX)" || return 1
  git archive "$NEW" | tar -x -C "$dir" || { rm -rf "$dir"; return 1; }
  local rc=0
  ( cd "$dir" && node --check server.js && node --check public/assets/app.js ) >"$STATE/check.err" 2>&1 || rc=2
  if [ "$rc" = 0 ] && [ -f "$dir/tests/api.test.js" ]; then
    ( cd "$dir" && timeout 180 node --test --test-reporter=dot tests/api.test.js ) >"$STATE/check.err" 2>&1 || rc=3
  fi
  rm -rf "$dir"
  return "$rc"
}

# 2. Копия базы перед установкой (хранятся 5 последних).
backup_db() {
  [ -f "$DATA/torgana.db" ] || return 0
  local f; f="$STATE/db/torgana-$(date +%F-%H%M%S)-before-$SHORT.db"
  ( umask 077; node --disable-warning=ExperimentalWarning scripts/db-copy.js backup "$DATA/torgana.db" "$f" >/dev/null && gzip -f "$f" ) || return 1
  ls -1t "$STATE"/db/*.db.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
}

healthy() {
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    curl -fsS -m 3 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

check_new; rc=$?
REASON=""
case "$rc" in
  0) ;;
  2) REASON="ошибка в коде" ;;
  3) REASON="не прошли сценарии API" ;;
  *) REASON="не удалось получить код версии" ;;
esac
[ -z "$REASON" ] && ! backup_db && REASON="не удалось сделать копию базы"

if [ -z "$REASON" ]; then
  git reset -q --hard "$NEW"
  $RESTART
  if healthy; then
    rm -f "$STATE/failed"
    write_status ok
    log "Готово: работает версия $NEWV"
    exit 0
  fi
  REASON="сайт не запустился"
  git reset -q --hard "$OLD"
  $RESTART
  healthy || log "ВНИМАНИЕ: сайт не отвечает и после отката — нужна ручная проверка (journalctl -u torgana -n 50)"
fi

[ -s "$STATE/check.err" ] && [ "$rc" != 0 ] && tail -n 8 "$STATE/check.err" | sed 's/^/    /' >> "$LOG"
echo "$NEW" > "$STATE/failed"
write_status failed "Версия $NEWV не установлена: $REASON. Сайт работает на прежней версии"
log "Версия $NEWV не установлена: $REASON — работает прежняя $(label "$OLD")"
exit 1
