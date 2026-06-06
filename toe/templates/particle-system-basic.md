# Basic Particle System

## Project: TDSW Basic Module (00_Basic)

## Operators
- Sphere POP (emitter)
- Noise POP (organic motion)
- Particle POP (solver)
- Render POP (visualization)
- Point MAT (material)
- Null TOP (output)

## Connections
1. Sphere POP → Noise POP
2. Noise POP → Particle POP
3. Particle POP → Render POP
4. Render POP → Geometry COMP (with Camera)
5. Geometry COMP → Render TOP → Null TOP

## Parameters
- Sphere POP: type=point, rate=100, radius=1
- Noise POP: amplitude=0.5, frequency=0.3, type=perlin
- Particle POP: life=3, drag=0.1, gravity=0.01
- Render POP: requires Camera in Geometry COMP

## Notes
- Start with low rate (100) and increase after verifying
- Use Pre-roll for steady-state visualization
- Point Sprite MAT for efficient rendering
TMPEOF && cat > /path/to/touchdesigner/toe/templates/top-to-pop-conversion.md << 'TMPEOF'
# TOP to POP Conversion System

## Project: TDSW 01_TOPtoPOP Module

## Operators
- Movie File In TOP (video input)
- TOP to POP (bridge)
- Attribute POP (color/brightness extraction)
- Noise POP (organic displacement)
- Particle POP (physics)
- Render POP (output)

## Connections
1. Movie File In TOP → TOP to POP
2. TOP to POP → Attribute POP (extract Cd from RGB)
3. Attribute POP → Noise POP (amplitude from brightness)
4. Noise POP → Particle POP
5. Particle POP → Render POP

## Parameters
- Movie File In TOP: file=video source, resolution=640x480
- TOP to POP: resolution=matching, use=RGB
- Attribute POP: attribute=Cd, source=color
- Noise POP: amplitude driven by brightness
- Particle POP: rate=1000, life=2

## Notes
- This pattern converts video pixels to particle positions
- Color data drives particle behavior
- Useful for interactive installations with cameras
TMPEOF && cat > /path/to/touchdesigner/toe/templates/feedback-loop-simulation.md << 'TMPEOF'
# Feedback Loop Simulation

## Pattern: Persistent GPU Simulation

## Operators
- Feedback POP (frame buffer)
- Noise POP (organic evolution)
- Particle POP (physics solver)
- Render POP (visualization)

## Connections (Loop)
1. Feedback POP → Noise POP
2. Noise POP → Particle POP
3. Particle POP → Feedback POP (blend=0.95)
4. Particle POP → Render POP

## Parameters
- Feedback POP: blend=0.95 (decay rate)
- Noise POP: amplitude=0.3, speed=0.5
- Particle POP: life=-1 (infinite), drag=0.02

## Notes
- Blend < 1.0 ensures simulation doesn't explode
- Lower blend = faster decay
- Higher blend = longer persistence
- Use Trail POP to visualize history
TMPEOF && cat > /path/to/touchdesigner/toe/templates/audio-reactive-system.md << 'TMPEOF'
# Audio-Reactive System

## Pattern: Sound-Driven Visuals

## Operators
- Audio CHOP (sound input)
- Math CHOP (normalize 0-1)
- CHOP to POP (bridge)
- Noise POP (visual driver)
- Particle POP (physics)
- Render POP (output)

## Connections
1. Audio CHOP → Math CHOP
2. Math CHOP → CHOP to POP
3. CHOP to POP → Noise POP (amplitude channel)
4. Noise POP → Particle POP
5. Particle POP → Render POP

## Parameters
- Audio CHOP: channels=all, device=default
- Math CHOP: rangeMin=0, rangeMax=1, filter=sigma=2
- CHOP to POP: channel=amplitude → attribute
- Noise POP: amplitude=CHOP driven
- Particle POP: rate=500, life=2

## Notes
- Use Math CHOP to normalize audio levels
- Filter CHOP for smoothing
- Lag CHOP for delay effects
- Map different frequency bands to different visual parameters
