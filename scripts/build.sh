#!/bin/bash
# 打包成 macOS 应用：dist/CyberTodo-darwin-<arch>/CyberTodo.app
set -euo pipefail
cd "$(dirname "$0")/.."

ARCH="$(uname -m)"
[ "$ARCH" = "x86_64" ] && ARCH="x64"

# 从 assets/icon.png 生成 .icns（sips 和 iconutil 是 macOS 自带的）
ICONSET="build/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" assets/icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" assets/icon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o build/icon.icns

# 可选：ELECTRON_ZIP_DIR 指向一个已经放好 electron-v<版本>-darwin-<arch>.zip 的目录，
# 打包时就不再联网下载 Electron（网络慢的时候有用）。
EXTRA=()
[ -n "${ELECTRON_ZIP_DIR:-}" ] && EXTRA+=(--electron-zip-dir="$ELECTRON_ZIP_DIR")

npx electron-packager . CyberTodo \
  ${EXTRA[@]+"${EXTRA[@]}"} \
  --platform=darwin --arch="$ARCH" \
  --out=dist --overwrite \
  --icon=build/icon.icns \
  --app-bundle-id=com.noahnorya.cybertodo \
  --ignore='^/(dist|build|docs)($|/)' \
  --ignore='^/scripts/build\.sh$'

APP="dist/CyberTodo-darwin-$ARCH/CyberTodo.app"
# 本机临时签名（ad-hoc），让整个应用包有一个完整一致的签名
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

echo "Built: $APP"
