#!/usr/bin/env bash
SLUG="${1:?Usage: ./test-stage.sh <slug> (e.g. ./test-stage.sh ec3)}"
PROJECT_DIR="/home/auysh/Projects/redis-clone"
TESTER_DIR="/home/auysh/Projects/redis-tester"

# Kill any leftover server process using port 6379
fuser -k 6379/tcp 2>/dev/null || true

# Find the test function name for this slug
TEST_ENTRY=$(grep -E -A 10 "Slug:[[:space:]]*\"$SLUG\"" "$TESTER_DIR/internal/tester_definition.go" | grep "TestFunc:" | head -n 1)
TEST_FUNC=$(echo "$TEST_ENTRY" | sed -E 's/.*TestFunc:[[:space:]]*([^,]+),?/\1/')

echo "=========================================================="
echo " Running Stage: $SLUG | Test Function: $TEST_FUNC"
echo "=========================================================="

cd "$TESTER_DIR" || exit 1
OUTPUT=$(CODECRAFTERS_REPOSITORY_DIR="$PROJECT_DIR" \
CODECRAFTERS_SUBMISSION_DIR="$PROJECT_DIR" \
CODECRAFTERS_CURRENT_STAGE_SLUG="$SLUG" \
CODECRAFTERS_TEST_CASES_JSON="[{\"slug\": \"$SLUG\", \"tester_log_prefix\": \"stage-$SLUG\", \"title\": \"$SLUG\"}]" \
CODECRAFTERS_DEBUG=true \
go run ./cmd/tester 2>&1)
EXIT_CODE=$?

echo "$OUTPUT"

if [ $EXIT_CODE -ne 0 ] || echo "$OUTPUT" | grep -q "Test failed"; then
  echo ""
  echo "=========================================================="
  echo " DIAGNOSTIC: Test Source & Assertions"
  echo "=========================================================="
  
  SRC_FILE=$(grep -rn "func $TEST_FUNC(" "$TESTER_DIR/internal" | head -n 1 | cut -d: -f1)
  if [ -n "$SRC_FILE" ]; then
    echo "Source file: $SRC_FILE"
    echo "--- Assertions & Client Commands ---"
    grep -E -n "SendCommand|SendHandshake|Receive|Assert" "$SRC_FILE" | head -n 25
  fi
  echo "=========================================================="
  exit 1
fi
