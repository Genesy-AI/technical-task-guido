#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

npx --yes concurrently -k -n temporal,backend,frontend -c magenta,blue,green \
  "temporal server start-dev" \
  "cd backend && pnpm run dev" \
  "cd frontend && pnpm run dev"
