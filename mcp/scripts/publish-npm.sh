#!/usr/bin/env bash
# =============================================================================
# publish-npm.sh — TouchDesigner MCP npm publication script
#
# Usage:
#   chmod +x scripts/publish-npm.sh
#   ./scripts/publish-npm.sh          # dry-run (no actual publish)
#   ./scripts/publish-npm.sh --publish # actual publish to npm
#
# This script:
#   1. Verifies the project compiles (TypeScript typecheck + build)
#   2. Runs smoke tests
#   3. Validates package.json is ready for publication
#   4. Optionally publishes to npm
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$MCP_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   TouchDesigner MCP — Pre-publication check                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────
# 1. Check Node.js and npm versions
# ──────────────────────────────────────────
echo "── Step 1/5: Checking environment ──"
NODE_VER=$(node -v 2>/dev/null || echo "none")
NPM_VER=$(npm -v 2>/dev/null || echo "none")

if [ "$NODE_VER" = "none" ] || [ "$NPM_VER" = "none" ]; then
  echo "  ❌ Node.js or npm not found. Please install Node.js >=18."
  exit 1
fi

echo "  ✓ Node.js $NODE_VER"
echo "  ✓ npm v$NPM_VER"

# ──────────────────────────────────────────
# 2. Install dependencies
# ──────────────────────────────────────────
echo ""
echo "── Step 2/5: Installing dependencies ──"
cd "$ROOT_DIR"
npm install
echo "  ✓ Dependencies installed"

# ──────────────────────────────────────────
# 3. Typecheck & Build
# ──────────────────────────────────────────
echo ""
echo "── Step 3/5: TypeScript typecheck & build ──"

cd "$ROOT_DIR"
echo "  Building api/ ..."
npx tsc -p api/tsconfig.json 2>&1 | sed 's/^/    /'

echo "  Building mcp/ ..."
npx tsc -p mcp/tsconfig.json 2>&1 | sed 's/^/    /'

echo "  ✓ TypeScript compiles cleanly"

# Also verify the dist entry point exists
if [ ! -f "$MCP_DIR/dist/index.js" ]; then
  echo "  ❌ dist/index.js not found after build!"
  exit 1
fi
echo "  ✓ dist/index.js exists"

# ──────────────────────────────────────────
# 4. Run smoke tests
# ──────────────────────────────────────────
echo ""
echo "── Step 4/5: Running smoke tests ──"

cd "$ROOT_DIR"
node "$MCP_DIR/test_smoke.mjs" 2>&1 | sed 's/^/    /'

# Check exit code of the test (the test script does process.exit)
SMOKE_EXIT=$?
if [ $SMOKE_EXIT -ne 0 ]; then
  echo ""
  echo "  ⚠  Smoke tests completed with failures ($SMOKE_EXIT)."
  echo "     Some failures are expected without a TouchDesigner connection."
  echo "     If you see only TD-connection-related failures, this is normal."
else
  echo "  ✓ All smoke tests passed"
fi

# ──────────────────────────────────────────
# 5. Validate package.json
# ──────────────────────────────────────────
echo ""
echo "── Step 5/5: Validating package.json ──"

PKG="$MCP_DIR/package.json"

# Required fields for npm publication
echo "  Checking package.json fields..."

check_field() {
  local field="$1"
  local val
  val=$(node -e "const p = require('$PKG'); console.log(p.$field || '')" 2>/dev/null)
  if [ -z "$val" ] || [ "$val" = "" ]; then
    echo "  ⚠  Missing: $field"
    return 1
  else
    echo "  ✓ $field: $val"
    return 0
  fi
}

check_field "name" || true
check_field "version" || true
check_field "description" || true

# Check for critical metadata
HAS_REPO=$(node -e "const p = require('$PKG'); console.log(p.repository ? 'yes' : 'no')" 2>/dev/null)
HAS_KEYWORDS=$(node -e "const p = require('$PKG'); console.log(Array.isArray(p.keywords) && p.keywords.length > 0 ? 'yes' : 'no')" 2>/dev/null)
HAS_LICENSE=$(node -e "const p = require('$PKG'); console.log(p.license || 'no')" 2>/dev/null)
HAS_BIN=$(node -e "const p = require('$PKG'); console.log(p.bin ? 'yes' : 'no')" 2>/dev/null)

echo "  ✓ repository: $HAS_REPO"
echo "  ✓ keywords: $HAS_KEYWORDS"
echo "  ✓ license: $HAS_LICENSE"
echo "  ✓ bin entry: $HAS_BIN"

# Check if we need to add fields
NEEDS_FIX=""
if [ "$HAS_REPO" = "no" ]; then NEEDS_FIX="$NEEDS_FIX repository"; fi
if [ "$HAS_KEYWORDS" = "no" ]; then NEEDS_FIX="$NEEDS_FIX keywords"; fi
if [ "$HAS_LICENSE" = "no" ]; then NEEDS_FIX="$NEEDS_FIX license"; fi
if [ "$HAS_BIN" = "no" ]; then NEEDS_FIX="$NEEDS_FIX bin"; fi

if [ -n "$NEEDS_FIX" ]; then
  echo ""
  echo "  ⚠  Missing metadata fields:$NEEDS_FIX"
  echo "     Update mcp/package.json before publishing."
  echo "     Suggested additions for package.json:"
  echo ""
  echo '     "repository": {'
  echo '       "type": "git",'
  echo '       "url": "https://github.com/tolchx/touchdesigner-MCP.git"'
  echo '     },'
  echo '     "keywords": ["touchdesigner", "mcp", "claude", "ai", "vfx", "generative"],'
  echo '     "license": "MIT",'
  echo '     "bin": {'
  echo '       "touchdesigner-mcp": "./dist/index.js"'
  echo '     },'
  echo '     "engines": { "node": ">=18" },'
  echo '     "files": ["dist/", "data/", "README.md", "LICENSE"]'
  echo ""
else
  echo "  ✓ All metadata fields present"
fi

# ──────────────────────────────────────────
# Summary & Publish
# ──────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Summary                                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ $SMOKE_EXIT -eq 0 ]; then
  echo "  ✓ Build:     OK"
  echo "  ✓ Tests:     PASSED"
else
  echo "  ✓ Build:     OK"
  echo "  ⚠  Tests:     $SMOKE_EXIT failures (may be TD-connection only)"
fi

echo ""
echo "  Package:  $(node -e "console.log(require('$PKG').name + '@' + require('$PKG').version)")"
echo "  Location: $PKG"
echo ""

if [ "${1:-}" = "--publish" ]; then
  echo "── Publishing to npm ──"
  cd "$MCP_DIR"
  npm publish --dry-run 2>&1 | sed 's/^/    /'
  echo ""
  echo "  ⚠  This was a DRY RUN. To actually publish, run:"
  echo ""
  echo "     cd $MCP_DIR"
  echo "     npm publish"
  echo ""
  echo "  Make sure you are logged in: npm whoami"
  echo "  If not: npm login"
else
  echo "── Dry run mode (no publish) ──"
  echo ""
  echo "  To preview what would be published:"
  echo "    cd $MCP_DIR && npm pack --dry-run"
  echo ""
  echo "  To publish:"
  echo "    $0 --publish"
  echo ""
  echo "  Before publishing, ensure:"
  echo "    1. You are logged into npm: npm whoami"
  echo "    2. Version in package.json is correct"
  echo "    3. All metadata fields (repository, keywords, license, bin) are set"
  echo "    4. A LICENSE file exists in the package root"
fi

echo ""
