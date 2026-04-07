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

# ── Select vitest command based on mode ──────────────────────────────────────
# node_modules are mounted from the host (no network access in the container),
# so we invoke vitest directly via node rather than via pnpm.
case $MODE in
  coverage) CMD="node_modules/.bin/vitest run --coverage" ;;
  watch)    CMD="node_modules/.bin/vitest" ;;
  *)        CMD="node_modules/.bin/vitest run" ;;
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
# Mount host node_modules (read-only) so the container has all dependencies
# without needing any network access during the build or run.
echo "→ Running tests..."
docker run \
  --rm \
  --name "$CONTAINER" \
  --env CI=true \
  --env NODE_ENV=test \
  --volume "$(pwd)/coverage:/app/coverage" \
  --volume "$(pwd)/node_modules:/app/node_modules" \
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
