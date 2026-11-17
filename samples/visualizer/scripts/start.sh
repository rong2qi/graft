#!/bin/zsh
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PORT=4712
URL="http://127.0.0.1:${PORT}/"
CACHE_DIR="${PROJECT_DIR}/.cache"
LOG_FILE="${CACHE_DIR}/graft-visualizer.log"
PID_FILE="${CACHE_DIR}/graft-visualizer.pid"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$CACHE_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"
}

alert() {
  /usr/bin/osascript -e "display alert \"$1\" message \"$2\"" >/dev/null 2>&1 || true
}

open_page() {
  /usr/bin/open "$URL"
}

if /usr/bin/curl -fsS --max-time 1 "${URL}api/health" >/dev/null 2>&1; then
  open_page
  exit 0
fi

if ! command -v corepack >/dev/null 2>&1; then
  alert "找不到 corepack" "请先安装 Node.js 22 或更高版本。"
  exit 1
fi

if [[ ! -d "$PROJECT_DIR" ]]; then
  alert "找不到 Graft 仓库" "请确认项目仍在 ~/Documents/Codex/Projects/graft。"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
log "Launcher started"

if [[ ! -d "$PROJECT_DIR/node_modules" ||
  ! -d "$PROJECT_DIR/node_modules/effect" ||
  ! -d "$PROJECT_DIR/samples/visualizer/node_modules" ||
  ! -d "$PROJECT_DIR/samples/visualizer/node_modules/effect" ]]; then
  log "Installing workspace dependencies"
  if ! CI=true corepack pnpm install --frozen-lockfile --prefer-offline >>"$LOG_FILE" 2>&1; then
    log "pnpm install failed"
    alert "Graft 花园依赖安装失败" "请查看 ${LOG_FILE}。"
    exit 1
  fi
  log "Workspace dependencies installed"
fi

if [[ ! -f "$PROJECT_DIR/packages/core/dist/index.js" ||
  ! -f "$PROJECT_DIR/packages/plugin-http/dist/index.js" ]]; then
  log "Building @graftland/graft"
  if ! corepack pnpm --filter @graftland/graft build >>"$LOG_FILE" 2>&1; then
    log "Build of @graftland/graft failed"
    alert "Graft 构建失败" "请查看 ${LOG_FILE}。"
    exit 1
  fi
  log "Building @graftland/plugin-http"
  if ! corepack pnpm --filter @graftland/plugin-http build >>"$LOG_FILE" 2>&1; then
    log "Build of @graftland/plugin-http failed"
    alert "Graft 构建失败" "请查看 ${LOG_FILE}。"
    exit 1
  fi
fi

log "Starting @graftland/sample-visualizer"
nohup corepack pnpm --filter @graftland/sample-visualizer start >>"$LOG_FILE" 2>&1 &
launcher=$!
echo "$launcher" >"$PID_FILE"
log "Visualizer launcher pid ${launcher}"

for _ in {1..480}; do
  if /usr/bin/curl -fsS --max-time 1 "${URL}api/health" >/dev/null 2>&1; then
    log "Visualizer is healthy at ${URL}"
    open_page
    exit 0
  fi
  if ! kill -0 "$launcher" 2>/dev/null; then
    log "Launcher exited before the health check passed"
    break
  fi
  sleep 0.25
done

alert "Graft 花园启动超时" "请查看 ${LOG_FILE}。"
exit 1
