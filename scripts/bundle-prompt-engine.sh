#!/usr/bin/env sh
# Bundles supabase/functions/prompt-engine (index.ts + render.ts + ../_shared/style_card_rules.ts) into ONE minified ES
# module for the Supabase MCP deploy_edge_function tool, whose inline payload cannot carry the three sources (~160 KB).
# Deterministic for the pinned esbuild version; the deployed file's sha256 is recorded in docs/DEPLOY-stylecard-v2.md.
# Usage: sh scripts/bundle-prompt-engine.sh [outfile]   (default /tmp/dm/pe/index.ts)
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/dm/pe/index.ts}"
mkdir -p "$(dirname "$OUT")"
npx -y esbuild@0.25.10 supabase/functions/prompt-engine/index.ts --bundle --format=esm --platform=neutral --target=esnext \
  '--external:jsr:*' --minify --legal-comments=none --line-limit=180 --outfile="$OUT"
shasum -a 256 "$OUT"
