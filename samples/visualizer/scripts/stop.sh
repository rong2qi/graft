#!/bin/zsh
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PORT=4712
CACHE_DIR="${PROJECT_DIR}/.cache"
LOG_FILE="${CACHE_DIR}/graft-visualizer.log"
PID_FILE="${CACHE_DIR}/graft-visualizer.pid"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"
}

stop_pid() {
  local pid="$1"
  local command=""
  [[ -n "$pid" ]] || return 0
  command=$(ps -p "$pid" -o command= 2>/dev/null) || command=""
  if [[ "$command" == *"sample-visualizer"* || "$command" == *"corepack pnpm"* ]]; then
    kill "$pid" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$pid" 2>/dev/null || return 0
      sleep 0.2
    done
    kill -9 "$pid" 2>/dev/null || true
  elif [[ -z "$command" ]]; then
    # ps can be unavailable in restricted environments; the pid file is ours.
    kill "$pid" 2>/dev/null || true
  fi
}

if [[ -f "$PID_FILE" ]]; then
  stop_pid "$(cat "$PID_FILE")"
  rm -f "$PID_FILE"
fi

# Port 4712 belongs to this demo; stop its listener even if the pid file is stale.
/usr/sbin/lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null | while read -r pid; do
  kill "$pid" 2>/dev/null || true
done

for _ in {1..40}; do
  if ! /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

log "Visualizer stopped"
/usr/bin/osascript -e 'display notification "Graft 花园已停止" with title "Graft"' >/dev/null 2>&1 || true
exit 0
