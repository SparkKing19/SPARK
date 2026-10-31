#!/usr/bin/env bash
set -e
cd /app/lavalink
java -Xms256M -Xmx768M -jar Lavalink.jar --spring.config.location=file:./application.yml &
LAVALINK_PID=$!
cd /app
node src/index.js &
BOT_PID=$!
shutdown() {
  kill "$BOT_PID" "$LAVALINK_PID" 2>/dev/null || true
  wait || true
}
trap shutdown SIGTERM SIGINT
wait -n "$BOT_PID" "$LAVALINK_PID"
STATUS=$?
shutdown
exit "$STATUS"