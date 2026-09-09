#!/usr/bin/env bash

PROJECT_DIR="/home/auysh/Projects/redis-clone"
TESTER_DIR="/home/auysh/Projects/redis-tester"

# Kill any leftover server process using port 6379
fuser -k 6379/tcp 2>/dev/null || true

TRACK=(
  "mh6|RPUSH (single)"
  "tn7|RPUSH (multiple)"
  "lx4|RPUSH (append)"
  "sf6|LRANGE (pos idx)"
  "ri1|LRANGE (neg idx)"
  "gu5|LPUSH"
  "fv6|LLEN"
  "ef1|LPOP (single)"
  "jp1|LPOP (multiple)"
  "ec3|BLPOP (no timeout)"
  "xj7|BLPOP (with timeout)"
)

for item in "${TRACK[@]}"; do
  IFS="|" read -r SLUG LABEL <<< "$item"
  printf "Checking %-25s [%s]... " "$LABEL" "$SLUG"

  OUTPUT=$(cd "$TESTER_DIR" && \
    CODECRAFTERS_REPOSITORY_DIR="$PROJECT_DIR" \
    CODECRAFTERS_SUBMISSION_DIR="$PROJECT_DIR" \
    CODECRAFTERS_CURRENT_STAGE_SLUG="$SLUG" \
    CODECRAFTERS_TEST_CASES_JSON="[{\"slug\": \"$SLUG\", \"tester_log_prefix\": \"stage-$SLUG\", \"title\": \"$LABEL\"}]" \
    go run ./cmd/tester 2>&1)
  
  if echo "$OUTPUT" | grep -q "Test passed."; then
    printf "\033[0;32mPASS\033[0m\n"
  else
    printf "\033[0;31mFAIL (CURRENT STAGE)\033[0m\n\n"
    echo "=========================================================="
    echo " Next stage to solve: $LABEL ($SLUG)"
    echo "=========================================================="
    exit 0
  fi
done

echo "All stages in this track are passing!"
