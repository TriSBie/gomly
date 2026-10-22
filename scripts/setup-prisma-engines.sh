#!/usr/bin/env bash
# Tải Prisma engines thủ công qua mirror khi mạng chặn/kết nối tới CDN mặc định của Prisma bị reset.
# Chỉ cần khi `npm install` báo lỗi ở @prisma/engines postinstall, hoặc prisma CLI không tải được engine.
# Sau khi chạy script này, dùng kèm biến môi trường:
#   PRISMA_QUERY_ENGINE_LIBRARY=<đường dẫn libquery_engine...so.node>
#   PRISMA_SCHEMA_ENGINE_BINARY=<đường dẫn schema-engine...>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENG="$ROOT/node_modules/@prisma/engines"
HASH="$(node -p "require('$ROOT/node_modules/@prisma/engines-version/package.json').version.split('-').pop()" 2>/dev/null || echo "")"
if [ -z "$HASH" ]; then
  # Fallback: đọc từ package @prisma/engines-version nếu cấu trúc khác
  HASH="$(grep -oE '[a-f0-9]{40}' "$ROOT/node_modules/@prisma/engines-version/package.json" | head -1)"
fi
PLATFORM="debian-openssl-3.0.x"
BASE="https://registry.npmmirror.com/-/binary/prisma/all_commits/$HASH/$PLATFORM"

echo "Engines commit: $HASH | platform: $PLATFORM"
curl -sL --retry 5 --retry-all-errors -o /tmp/gomly-qe.gz "$BASE/libquery_engine.so.node.gz"
curl -sL --retry 5 --retry-all-errors -o /tmp/gomly-se.gz "$BASE/schema-engine.gz"
gunzip -c /tmp/gomly-qe.gz > "$ENG/libquery_engine-$PLATFORM.so.node"
gunzip -c /tmp/gomly-se.gz > "$ENG/schema-engine-$PLATFORM"
chmod +x "$ENG/schema-engine-$PLATFORM"
echo "Xong. Kiểm chứng: (cd packages/db && PRISMA_QUERY_ENGINE_LIBRARY=$ENG/libquery_engine-$PLATFORM.so.node PRISMA_SCHEMA_ENGINE_BINARY=$ENG/schema-engine-$PLATFORM npx prisma validate)"
