# DMX Lighting System

## Pattern: DMX Fixture + DMX Out POP Pipeline

## Operators
- Point Generator POP (fixture positions)
- Attribute POP (create: pan, tilt, color, dimmer)
- DMX Fixture POP (map to DMX channels)
- DMX Out POP (Art-Net/sACN output)
- Noise POP (organic movement)
- CHOP (DMX control values)
- Render TOP (visualization)

## Connections
1. Point Generator POP → Attribute POP
2. Attribute POP → Noise POP
3. Noise POP → DMX Fixture POP
4. DMX Fixture POP → DMX Out POP
5. CHOP → Attribute POP (control)

## Parameters
- Point Generator: numPoints=24 (24 fixtures)
- DMX Fixture: protocol=Art-Net, universe=0
- DMX Out: IP=255.255.255.255, port=6454
- Noise: amplitude=0.5, frequency=0.3

## Notes
- Each POP point = one DMX fixture
- DMX Fixture POP maps attributes to DMX channels
- DMX Out POP sends via Art-Net (UDP) or sACN
- Use Math CHOP for DMX value mapping (0-255)
- Pan/Tilt: use atan2 for direction-to-angle conversion
