# Anti-Patterns — TouchDesigner MCP

Catalog of traps that look right and aren't. Cross-referenced from td-core-discipline.

### Destroy + Recreate Race
Creating a new operator with the same name as an existing one, then destroying the old one, destroys the new one too.
**Fix:** Check if the operator exists first, rename it, or destroy before creating.

### `top.save()` for Animation
`TOP.save()` saves a single frame, not an animation sequence. Use `Movie File Out TOP` for renders.
**Fix:** Use `moviefileoutTOP` for sequences, `TOP.save()` only for single frames.

### Hardcoded Paths in Callbacks
Inside an `executeDAT`, `scriptOp`, or panel callback, hardcoding `/project1/something` breaks when the COMP is moved or cloned.
**Fix:** Use `me.parent()` or `parent()` relative paths.

### Blind Trust in `td_get_errors == 0`
Zero errors does NOT mean correct output. It catches broken refs and type mismatches but NOT empty geometry, scale=0, camera frustum miss, or NaN positions.
**Fix:** Always visually verify with `td_screenshot` after render-chain work.

### Feedback TOP Self-Wiring
Connecting `feedbackTOP` output back to its own input creates a cycle that TD's static analyzer flags.
**Fix:** The canonical pattern:
```
src → fb (in 0) → level → over (in 1 = OVERLAY) → out
src → over (in 0 = BG)
fb.par.top = over
```
Trail decay via `level.opacity` (Post page), NOT `brightness1`.

### `.expr` Without `.mode`
Setting `par.expr = "..."` without `par.mode = ParMode.EXPRESSION` means the expression string is stored but never evaluated.
**Fix:** Always set both:
```python
op('/path/to/op').par.paramname.expr = "absTime.seconds"
op('/path/to/op').par.paramname.mode = ParMode.EXPRESSION
```

### `P[id]` Read-After-Write (GLSL POP)
`P[id]` is a write-only buffer. Doing `P[id].x += sin(P[id].y)` reads AND writes the same buffer, causing "Compile failed".
**Fix:** Read with `TDIn_P()`, modify local vars, write `P[id]` once.

### Guessing Parameter Names
Passing wrong parameter names to `td_set_operator_pars` causes silent failure.
**Fix:** Use `td_get_param_help` or `td_pars_get` first to discover exact parameter names.

### `geometryCOMP` Default POP Torus
A fresh `geometryCOMP` in TD 2025+ auto-creates a POP-family `torus1`, not SOP. SOP-based instancing breaks.
**Fix:** Delete the default POP torus, create a SOP shape with `render=True`, `display=True`.
