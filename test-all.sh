#!/usr/bin/env bash
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTER_DIR="/tmp/redis-tester"

STAGES=(
  "jm1|Bind to port"
  "rg2|Ping-pong once"
  "wy1|Ping-pong multiple"
  "zu2|Ping-pong concurrent"
  "qq0|Echo"
  "la7|Get / Set"
  "yz1|Expiry (PX)"
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

declare -a PASSED=()
declare -a FAILED=()

for item in "${STAGES[@]}"; do
  IFS="|" read -r SLUG LABEL <<< "$item"
  printf "Testing %-26s [%s]... " "$LABEL" "$SLUG"

  OUTPUT=$(cd "$TESTER_DIR" && \
    CODECRAFTERS_REPOSITORY_DIR="$PROJECT_DIR" \
    CODECRAFTERS_SUBMISSION_DIR="$PROJECT_DIR" \
    CODECRAFTERS_CURRENT_STAGE_SLUG="$SLUG" \
    CODECRAFTERS_TEST_CASES_JSON="[{\"slug\": \"$SLUG\", \"tester_log_prefix\": \"stage-$SLUG\", \"title\": \"$LABEL\"}]" \
    go run ./cmd/tester 2>&1)

  if [ $? -eq 0 ] && echo "$OUTPUT" | grep -q "Test passed."; then
    printf "\033[0;32mPASSED\033[0m\n"
    PASSED+=("$SLUG|$LABEL")
  else
    printf "\033[0;31mFAILED\033[0m\n"
    FAILED+=("$SLUG|$LABEL")
  fi
done

echo ""
printf "| %-6s | %-26s | %-10s |\n" "Slug" "Stage" "Status"
echo "|--------|----------------------------|------------|"
for item in "${STAGES[@]}"; do
  IFS="|" read -r SLUG LABEL <<< "$item"
  STATUS="\033[0;31mFAIL\033[0m      "
  for pass in "${PASSED[@]}"; do
    if [[ "$pass" == "$item" ]]; then
      STATUS="\033[0;32mPASS\033[0m      "
      break
    fi
  done
  printf "| %-6s | %-26s | %b |\n" "$SLUG" "$LABEL" "$STATUS"
done
