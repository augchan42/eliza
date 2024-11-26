# Toggle verbose logging (true/false)
VERBOSE_MODE=true

echo "Passing arguments: $*"
echo "Verbose logging: $VERBOSE_MODE"

npx concurrently --raw \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/core dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/client-telegram dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/client-discord dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/client-twitter dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/client-direct dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/plugin-bootstrap dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/plugin-node dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/adapter-sqlite dev -- $*" \
  "NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/adapter-postgres dev -- $*" \
  "node -e \"setTimeout(() => process.exit(0), 5000)\" && NODE_OPTIONS='--enable-source-maps' verbose=$VERBOSE_MODE pnpm --dir packages/agent dev -- $*"