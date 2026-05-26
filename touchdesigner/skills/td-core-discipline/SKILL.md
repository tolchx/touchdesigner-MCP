---
name: td-core-discipline
description: "Use when building, debugging, or modifying TouchDesigner projects. Defines mandatory node layout, color coding, error checking, expression rules, render pipeline pitfalls, and visual verification discipline for all TD work."
version: 1.0.0
author: Tolch
license: MIT
metadata:
  hermes:
    tags: [touchdesigner, discipline, layout, debugging, expressions]
    related_skills: [td-pops-advanced, td-integration, td-fundamentals]
---

# TD Core Discipline

You are an AI assistant working inside a live TouchDesigner project. Every action should leave the project cleaner, more readable, and more stable than you found it.

## 1. Mandatory STOP Rules

These rules MUST hold for every action. Violating them is the #1 source of bugs.

1. **Never guess parameter names.** Before setting parameters on an unfamiliar operator, inspect an existing instance first, or use the operator's documentation.
2. **On `AttributeError` or "param does not exist" — STOP.** Do not retry blindly. Read the actual param list first.
3. **Script callbacks use RELATIVE paths.** Inside an `executeDAT`, `scriptOp`, or panel callback, use `me.parent()` or `parent()`. NEVER hardcode `/project1/...` in callback bodies.
4. **Prefer `td_execute` with Python for complex multi-step logic.** For simple operations like create/connect/delete, use dedicated endpoints.
5. **Snapshot before destructive changes.** Save a version or create an undo point before modifying render chains, feedback loops, or critical networks.
6. **Always set `viewer = True` on test/debug COMPs.** Without the viewer flag, red-bordered errors stay invisible and error checks may show false positives.

## 2. Node Layout & Color Coding

### Positioning
- **Horizontal spacing**: 250px between nodes in a chain
- **Vertical spacing**: 200px between parallel chains
- **Flow direction**: left to right (inputs left, outputs right)
- **Alignment**: same-chain nodes share the same Y

### Color Conventions
- **Generators / sources**: blue `(0.2, 0.3, 0.6)`
- **Processing / transforms**: green `(0.2, 0.5, 0.3)`
- **Outputs / renders / nulls**: orange `(0.7, 0.4, 0.1)`
- **Control / logic / selects**: purple `(0.4, 0.2, 0.5)`
- **Debug / temporary**: red `(0.7, 0.2, 0.2)`

## 3. Error Checking — Always the Last Step

After any operation that modifies the project:
1. Do the work
2. Check errors on the affected nodes/network
3. If errors exist → diagnose and fix, then check again
4. Report to the user with a clean status

## 4. Expressions — Common Patterns

- **Relative vs absolute paths**: expressions inside a COMP cannot reach outside nodes with `op('name')`. Use `op('/project1/name')` for absolute paths.
- **Menu parameters**: use `.par.ParamName.eval()`, not bracket notation.
- **Expression mode**: after assigning `.expr`, always set `.mode = ParMode.EXPRESSION`.
- **Time-driven**: `absTime.seconds` for smooth animation, `absTime.frame` for frame-locked.

## 5. Render Pipeline Pitfalls (TD 2025+)

### geometryCOMP defaults to POP-family `torus1`
When you create a fresh `geometryCOMP` in TD 2025+, the auto-populated child is `torus1` of family **POP**, not the legacy SOP torus. This breaks SOP-based instancing patterns. Fix: delete the default POP torus and create a SOP shape inside with `render=True` and `display=True`.

### Reference-style params need real OP refs, not strings
`td_set_params({'instanceop': '../noise'})` on a `geometryCOMP` returns `success=False`. Use `td_execute` with `op(target_path).par.instanceop = op(source_path)` for reliable assignment.

### feedbackTOP canonical pattern
```
src ──┬──► fb (in 0)              [seed]
      ├──► over (in 0 = BG)       [fresh frame]
      └──► dryWetMix (in 0 = dry)

fb → level → over (in 1 = OVERLAY) → dryWetMix (in 1 = wet) → out

fb.par.top      = over
level.opacity   = 0.9 (Post page)  ← trail decay, NOT brightness
over.size       = "input1"         ← sizes from level input
```

### `td_get_errors == 0` is NOT a render-success signal
It only catches engine-level errors. It does NOT catch: empty geometry, scale=0, camera frustum miss, broken material, instances at NaN positions. Always visually verify renders.

## 6. Communication Style

Be direct. Say what you did, what you found, what changed. Include node paths and actual error messages. If something broke, explain how you're fixing it.

## Verification Checklist
- [ ] Nodes positioned in logical left-to-right flow
- [ ] Color coding applied by purpose
- [ ] Errors checked after every modification
- [ ] Expressions use absolute paths where needed
- [ ] `.mode = ParMode.EXPRESSION` set after `.expr`
- [ ] viewer=True on test COMPs
- [ ] Feedback loops follow canonical wiring
- [ ] Snapshot taken before destructive changes
