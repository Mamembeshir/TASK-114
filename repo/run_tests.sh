#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_tests.sh — CI test runner for Meridian Portal
#
# Usage:
#   ./run_tests.sh              # run tests (builds image if needed)
#   ./run_tests.sh --coverage   # run tests + generate coverage report
#   ./run_tests.sh --watch      # run tests in watch mode (dev only)
#   ./run_tests.sh --clean      # remove test container + image before running
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

IMAGE="meridian-portal:test"
CONTAINER="meridian-test"
COMPOSE_FILE="docker-compose.yml"

MODE="run"       # run | coverage | watch
CLEAN=false

# ── Parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case $arg in
    --coverage) MODE="coverage" ;;
    --watch)    MODE="watch" ;;
    --clean)    CLEAN=true ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--coverage] [--watch] [--clean]"
      exit 1
      ;;
  esac
done

# ── Clean up previous run ─────────────────────────────────────────────────────
if [ "$CLEAN" = true ]; then
  echo "→ Removing previous test container and image..."
  docker rm -f "$CONTAINER" 2>/dev/null || true
  docker rmi -f "$IMAGE"    2>/dev/null || true
fi

# ── Select pnpm script based on mode ─────────────────────────────────────────
case $MODE in
  coverage) CMD="pnpm test:coverage" ;;
  watch)    CMD="pnpm test:watch" ;;
  *)        CMD="pnpm test" ;;
esac

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Meridian Portal — Test Runner"
echo "  Mode    : $MODE"
echo "  Command : $CMD"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Build the test image ──────────────────────────────────────────────────────
echo "→ Building test image..."
docker build \
  --file Dockerfile.test \
  --tag "$IMAGE" \
  .

# ── Run the tests ─────────────────────────────────────────────────────────────
echo "→ Running tests..."
docker run \
  --rm \
  --name "$CONTAINER" \
  --env CI=true \
  --env NODE_ENV=test \
  --volume "$(pwd)/coverage:/app/coverage" \
  "$IMAGE" \
  sh -c "$CMD"

EXIT_CODE=$?

# ── Result summary ────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $EXIT_CODE -eq 0 ]; then
  echo "  ✓ All tests passed"
  if [ "$MODE" = "coverage" ]; then
    echo "  Coverage report: ./coverage/index.html"
  fi
else
  echo "  ✗ Tests failed (exit code: $EXIT_CODE)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $EXIT_CODE
