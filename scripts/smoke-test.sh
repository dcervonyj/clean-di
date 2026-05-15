#!/usr/bin/env bash
# Smoke-test: build packages, run the CLI against each example, verify exit 0.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building packages…"
pnpm build

echo "==> Running CLI smoke test on examples…"
for example_dir in examples/*/; do
  example="$(basename "$example_dir")"
  echo "  → $example"
  node packages/clean-di-codegen/dist/bin.js --root "$example_dir" --check
done

echo "==> All smoke tests passed."
