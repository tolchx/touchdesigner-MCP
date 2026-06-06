#!/bin/bash
# Fix legacy test imports: replace './touchdesigner/' with '../../' in ESM import paths
# Tests are in touchdesigner/mcp/tests/ and the module root is touchdesigner/
# So './touchdesigner/api/...' -> '../../api/...'

set -e
cd "$(dirname "$0")"
FILES=legacy_test_*.mjs
count=0
fixed=0

for f in $FILES; do
    if [ ! -f "$f" ]; then continue; fi
    count=$((count + 1))
    # Check if file contains the bad import
    if grep -q "from\s*['\"]\./touchdesigner/" "$f"; then
        echo "FIXING: $f"
        # Replace 'from './touchdesigner/' with 'from '../../' only on import lines
        sed -i "s|from\s*['\"]\./touchdesigner/|from '../../|g" "$f"
        fixed=$((fixed + 1))
    else
        echo "SKIP (no ./touchdesigner import): $f"
    fi
done

echo ""
echo "=== Summary ==="
echo "Total legacy_test_*.mjs files: $count"
echo "Files with imports fixed: $fixed"
echo ""

# Now verify syntax of all fixed files
echo "=== Syntax check (node --check) ==="
for f in $FILES; do
    if [ ! -f "$f" ]; then continue; fi
    result=$(node --check "$f" 2>&1) && echo "OK: $f" || echo "FAIL: $f - $result"
done
