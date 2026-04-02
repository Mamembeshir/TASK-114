#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_tests.sh — full test suite for Meridian Portal
#
# Usage:
#   ./run_tests.sh              # lint + type-check + unit tests + build
#   ./run_tests.sh --coverage   # same + generate coverage report
#   ./run_tests.sh --tests-only # unit tests only (skip lint/type-check/build)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="full"   # full | coverage | tests-only

for arg in "$@"; do
  case $arg in
    --coverage)   MODE="coverage" ;;
    --tests-only) MODE="tests-only" ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--coverage] [--tests-only]"
      exit 1
      ;;
  esac
done

PASS=0
FAIL=0

run_step() {
  local label="$1"
  shift
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if "$@"; then
    echo "  ✓ $label passed"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label FAILED"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Meridian Portal — Test Suite  (mode: $MODE)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$MODE" = "full" ] || [ "$MODE" = "coverage" ]; then
  run_step "Lint (ESLint)"           pnpm lint
  run_step "Format check (Prettier)" pnpm format:check
  run_step "Type check (tsc)"        pnpm exec tsc --noEmit
fi

if [ "$MODE" = "coverage" ]; then
  run_step "Unit tests + coverage (Vitest)" pnpm test:coverage
else
  run_step "Unit tests (Vitest)" pnpm test --run
fi

if [ "$MODE" = "full" ] || [ "$MODE" = "coverage" ]; then
  run_step "Production build" pnpm build
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$MODE" = "coverage" ] && [ "$FAIL" -eq 0 ]; then
  echo "  Coverage report: ./coverage/index.html"
  echo ""
fi

[ "$FAIL" -eq 0 ]
