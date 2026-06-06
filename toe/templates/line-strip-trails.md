# Line Strip Trails

## Pattern: Attribute-driven Line Strips with Temporal Trails

## Operators
- Point Generator POP (source particles)
- Attribute POP (create: lineId, vertexOrder)
- Sort POP (sort by lineId, then vertexOrder)
- Line POP (connect vertices into strips)
- Trail POP (temporal accumulation)
- Color POP (color by age or attribute)
- Render POP → Point MAT

## Connections
1. Point Generator POP → Attribute POP
2. Attribute POP → Sort POP
3. Sort POP → Line POP
4. Line POP → Trail POP
5. Trail POP → Color POP
6. Color POP → Render POP

## Parameters
- Point Generator: rate=200, life=5, initialVelocity=random
- Attribute lineId: particleId % 10 (10 lines)
- Attribute vertexOrder: sequential per lineId
- Sort: primary=lineId, secondary=vertexOrder, ascending
- Line POP: verticesPerPrimitive=0 (auto), close=open
- Trail: length=30, method=add, opacity=0.8

## Attribute Setup (td_execute)
```python
op = op('/project1/attrib1')
op.par.name0 = 'lineId'
op.par.value0 = 'me.inputs[0].id % 10'
op.par.name1 = 'vertexOrder'
op.par.value1 = 'me.inputs[0].id'
```

## Notes
- Sort order CRITICAL: must be lineId primary, vertexOrder secondary
- Line POP with verticesPerPrimitive=0 auto-detects strip length
- Trail length controls temporal persistence
- Color POP with ramp for age-based coloring
