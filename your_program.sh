#!/bin/sh
set -e
# Runner script for redis-clone server
exec bun run "$(dirname "$0")/app/main.ts" "$@"
