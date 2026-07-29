"""Clean up empty rows in neon_values table."""
import json

nv = op('/project1/neon_values')
if not nv:
    print(json.dumps({'error': 'neon_values not found'}))
    raise SystemExit(0)

# Collect non-empty rows (keep header row 0)
keep = [0]
for r in range(1, nv.numRows):
    val_id = str(nv[r, 0].val).strip()
    val_val = str(nv[r, 2].val).strip()
    if val_id or val_val:
        keep.append(r)

# Resize to fit only kept rows
nv.setSize(len(keep), 4)

print(json.dumps({
    'cleaned': True,
    'rows_kept': len(keep),
    'rows_removed': nv.numRows - len(keep),
}))
