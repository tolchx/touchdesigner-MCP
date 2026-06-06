# Field Volume System

## Pattern: 3D Force Fields with Volume Visualization

## Operators
- Torus POP (field source geometry)
- Field POP (3D force field from texture)
- Noise POP (organic field variation)
- Particle POP (particles affected by field)
- Sprite POP (volume visualization)
- Render POP → Point MAT

## Connections
1. Torus POP → Field POP
2. Field POP → Noise POP
3. Noise POP → Particle POP
4. Particle POP → Sprite POP
5. Sprite POP → Render POP

## Parameters
- Torus POP: majorRadius=2, minorRadius=0.5
- Field POP: resolution=64, type=scalar
- Noise: amplitude=1.0, frequency=0.5
- Particle POP: life=3, drag=0.01
- Sprite: size=0.1, texture=gaussian

## Notes
- Field POP creates 3D texture from geometry
- Particles respond to field values
- Sprite POP for volume visualization (point sprites)
- Multiple field sources can be merged
- Use TOP to POP for field data extraction
