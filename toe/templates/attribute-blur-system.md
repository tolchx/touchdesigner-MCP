# Attribute Blur System

## Pattern: Smooth Attribute Propagation Between Points

## Operators
- Source POP (geometry with attributes)
- Attribute POP (create target attribute)
- Attribute POP (mode=smooth, blur attribute)
- Attribute Combine POP (blend with original)
- Attribute Convert POP (type conversion if needed)
- Null POP (inspection)

## Connections
1. Source POP → Attribute POP (create)
2. Attribute POP → Attribute POP (smooth/blur)
3. Attribute POP → Attribute Combine POP (input 0)
4. Source POP → Attribute Combine POP (input 1)
5. Attribute Combine POP → Attribute Convert POP
6. Attribute Convert POP → Null POP

## Parameters
- Attribute create: name="blurColor", type=vector
- Smooth iterations: 5-10
- Smooth radius: 1.0-3.0
- Combine operation: blend, ratio=0.5

## Workflow
1. Create attribute from source (e.g., Cd)
2. Apply smooth iterations (blur between neighbors)
3. Blend blurred result with original
4. Convert type if needed (float↔vector)

## Notes
- More iterations = smoother but slower
- Radius controls blur spread
- Useful for: smooth color transitions, organic deformations, noise smoothing
