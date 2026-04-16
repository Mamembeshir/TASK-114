#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_tests.sh — Unified test runner for Meridian Portal
#
# Runs inside Docker. One image (two stages), one command.
#
# Usage:
#   ./run_tests.sh              # Vitest (unit/integration) + Playwright (E2E)
#   ./run_tests.sh --unit       # Vitest only  (fast — no Chromium install)
#   ./run_tests.sh --e2e        # Playwright only
#   ./run_tests.sh --coverage   # Vitest with coverage report + Playwright
#   ./run_tests.sh --watch      # Vitest watch mode (dev only, no E2E)
#   ./run_tests.sh --clean      # Remove image + container before running
#
# Artefacts written to host:
#   ./coverage/          — Vitest HTML coverage report
#   ./playwright-report/ — Playwright HTML report
#   ./test-results/      — Playwright traces / screenshots for failures
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Always run from the directory containing this script (the repo root)
cd "$(dirname "$0")"

IMAGE_BASE="meridian-portal:test-base"
IMAGE_E2E="meridian-portal:test-e2e"
CONTAINER="meridian-test"

MODE="all"    # all | unit | e2e | coverage | watch
CLEAN=false

for arg in "$@"; do
  case $arg in
    --unit)     MODE="unit" ;;
    --e2e)      MODE="e2e" ;;
    --coverage) MODE="coverage" ;;
    --watch)    MODE="watch" ;;
    --clean)    CLEAN=true ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--unit] [--e2e] [--coverage] [--watch] [--clean]"
      exit 1
      ;;
  esac
done

if [ "$CLEAN" = true ]; then
  echo "→ Removing previous containers and images..."
  docker rm -f "$CONTAINER" 2>/dev/null || true
  docker rmi -f "$IMAGE_BASE" "$IMAGE_E2E" 2>/dev/null || true
fi

# Remove any stale container from a previous interrupted run
docker rm -f "$CONTAINER" 2>/dev/null || true

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Meridian Portal — Test Runner"
echo "  Mode : $MODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Choose which Docker stage to build and what command to run ─────────────────
case $MODE in
  unit|watch)
    TARGET="base"
    IMAGE="$IMAGE_BASE"
    ;;
  e2e)
    TARGET="e2e"
    IMAGE="$IMAGE_E2E"
    ;;
  coverage|all)
    # Need both Vitest and Playwright → build the full e2e stage
    TARGET="e2e"
    IMAGE="$IMAGE_E2E"
    ;;
esac

echo "→ Building image (stage: $TARGET)..."
docker build \
  --file Dockerfile.test \
  --target "$TARGET" \
  --tag "$IMAGE" \
  .

# ── Build the run command ─────────────────────────────────────────────────────
case $MODE in
  unit)
    CMD="pnpm test"
    ;;
  e2e)
    CMD="npx playwright test --reporter=list"
    ;;
  coverage)
    CMD="pnpm test:coverage && npx playwright test --reporter=list"
    ;;
  watch)
    CMD="pnpm test:watch"
    ;;
  all)
    CMD="pnpm test && npx playwright test --reporter=list"
    ;;
esac

echo "→ Running tests (mode: $MODE)..."
docker run \
  --rm \
  --name "$CONTAINER" \
  --env CI=true \
  --env NODE_ENV=test \
  --ipc=host \
  --volume "$(pwd)/coverage:/app/coverage" \
  --volume "$(pwd)/playwright-report:/app/playwright-report" \
  --volume "$(pwd)/test-results:/app/test-results" \
  "$IMAGE" \
  sh -c "$CMD"

EXIT_CODE=$?

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $EXIT_CODE -eq 0 ]; then
  echo "  ✓ All tests passed"
  [[ "$MODE" == "coverage" || "$MODE" == "all" ]] && echo "  Coverage : ./coverage/index.html"
  [[ "$MODE" == "e2e"      || "$MODE" == "all" || "$MODE" == "coverage" ]] && \
    echo "  E2E report: ./playwright-report/index.html"
else
  echo "  ✗ Tests failed (exit code: $EXIT_CODE)"
  [[ "$MODE" == "e2e" || "$MODE" == "all" || "$MODE" == "coverage" ]] && \
    echo "  Traces : ./test-results/"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $EXIT_CODE
