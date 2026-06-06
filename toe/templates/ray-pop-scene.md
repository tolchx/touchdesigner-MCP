# Ray POP Scene

## Pattern: Ray POP with Bounding Objects

## Operators
- Sphere POP (ray source points)
- Box POP (bounding object)
- Ray POP (intersection test)
- Attribute POP (hit/distance)
- Noise POP (organic variation)
- Render POP → Point MAT

## Connections
1. Sphere POP → Ray POP (input 0: rays)
2. Box POP → Ray POP (input 1: geometry)
3. Ray POP → Attribute POP
4. Attribute POP → Noise POP
5. Noise POP → Render POP

## Parameters
- Sphere POP: radius=3, type=point, numPoints=1000
- Box POP: size=4×4×4
- Ray POP: method=intersect, maxDistance=10
- Attribute POP: attribute Cd from hitDistance

## Notes
- Ray POP input 0 = source points (ray origin = P, direction = N)
- Ray POP input 1 = geometry to intersect
- Output: hit point positions, distance, UV
- Use bounding object to limit ray search space
- For multiple objects: use Merge POP on input 1
